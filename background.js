/* 
  Background service worker for session tracking extension (MV3)
  - Per-tab sessions with active/wall time
  - Problem detection -> problemId
  - Event stream -> /api/v1/problems/events
  - Retry queue with exponential backoff + jitter
  - Online/offline awareness
  - Heartbeats at configurable interval
*/

class BackgroundManager {
  constructor() {
    // Per-tab session states
    this.activeSessions = new Map();

    // User-configurable settings (synced via options page)
    this.settings = {
      backendUrl: "http://localhost:8082",
      apiKey: "",
      userId: "",                 // required to post events
      idleThreshold: 60000,       // ms
      heartbeatInterval: 30000    // ms
    };

    // Retry queue for failed POSTs
    this.retryQueue = [];
    this.retryTimer = null;

    // Connectivity flag for queue processing
    this.isOnline = true; // default true; we’ll probe via navigator and events

    // Interval handles
    this.heartbeatIntervalHandle = null;
    this.queueSweepIntervalHandle = null;

    // Initialize
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadRetryQueue();

    this.isOnline = typeof navigator !== "undefined" ? !!navigator.onLine : true;

    this.setupMessageListeners();
    this.setupTabListeners();
    this.setupNetworkListeners();

    this.startHeartbeatProcessor();
    this.startRetryProcessor();

    // Optional: initial log
    console.log("[bg] initialized with settings:", this.settings);
  }

  // ------------- Settings -----------------

  async loadSettings() {
    try {
      const defaults = { ...this.settings };
      const result = await chrome.storage.sync.get(Object.keys(defaults));
      this.settings = { ...defaults, ...result };
    } catch (err) {
      console.error("[bg] loadSettings error:", err.message);
    }
  }

  async updateSettings(settings) {
    try {
      this.settings = { ...this.settings, ...settings };
      await chrome.storage.sync.set(settings);
      console.log("[bg] settings updated:", settings);
    } catch (err) {
      console.error("[bg] updateSettings error:", err.message);
    }
  }

  // ------------- Messaging -----------------

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const tabId = sender?.tab?.id ?? null;

      switch (message?.type) {
        case "SESSION_START":
          this.handleSessionStart(message.data, tabId);
          break;

        case "ACTIVITY_PING":
          this.handleActivityPing(message.data, tabId);
          break;

        case "FOCUS_CHANGE":
          this.handleFocusChange(message.data, tabId);
          break;

        case "RUN_CLICKED":
          this.handleRunClicked(message.data, tabId);
          break;

        case "SUBMIT_CLICKED":
          this.handleSubmitClicked(message.data, tabId);
          break;

        case "VERDICT_DETECTED":
          this.handleVerdictDetected(message.data, tabId);
          break;

        case "SESSION_END":
          this.handleSessionEnd(message.data, tabId);
          break;

        case "GET_SESSION_INFO":
          this.getSessionInfo(tabId, sendResponse);
          return true; // async response

        case "SETTINGS_UPDATED":
          this.updateSettings(message.settings);
          break;

        // Legacy fallback
        case "BACKEND_EVENT":
          this.handleBackendEvent(message.eventType, message.data, tabId);
          break;
      }
    });
  }

  // ------------- Tabs lifecycle -----------------

  setupTabListeners() {
    // Navigation done: if coding platform, ensure a session exists
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && this.isCodingPlatform(tab?.url)) {
        this.ensureSession(tabId, tab.url);
      }
    });

    // Tab closed: end session
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.endSession(tabId, false);
    });

    // Tab activated: mark focus for that tab’s session
    chrome.tabs.onActivated.addListener((activeInfo) => {
      const { tabId } = activeInfo;
      const s = this.activeSessions.get(tabId);
      if (s) {
        this.markFocus(tabId, true);
      }
    });
  }

  // ------------- Connectivity -----------------

  setupNetworkListeners() {
    // Note: service worker has no window, but navigator.onLine is available in worker
    // We’ll also re-check on intervals through retry processor.
    // If an environment sends online/offline events, handle them:
    self.addEventListener("online", () => {
      this.isOnline = true;
      this.processRetryQueue();
    });
    self.addEventListener("offline", () => {
      this.isOnline = false;
    });
  }

  // ------------- Session state -----------------

  isCodingPlatform(url) {
    if (!url) return false;
    let hostname;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return false;
    }
    return (
      hostname.includes("leetcode.com") ||
      hostname.includes("geeksforgeeks.org") ||
      hostname.includes("hackerrank.com")
    );
  }

  ensureSession(tabId, url) {
    if (!this.activeSessions.has(tabId)) {
      this.initializeSession(tabId, url);
    } else {
      // Update URL on navigation within same tab
      const s = this.activeSessions.get(tabId);
      s.url = url;
    }
  }

  initializeSession(tabId, url) {
    const now = Date.now();
    this.activeSessions.set(tabId, {
      tabId,
      url,
      startTime: now,
      wallStart: now,
      lastActivity: now,
      activeMs: 0,
      isActive: true,
      focused: true,
      counters: { keystrokes: 0, runs: 0, submissions: 0 },
      finalVerdict: null,
      problemId: null,
      problemTitle: null,
      expectedTime: null
    });
    console.log("[bg] session initialized:", tabId);
  }

  endSession(tabId, silent = false) {
    const s = this.activeSessions.get(tabId);
    if (!s) return;

    const now = Date.now();
    // Accumulate remaining active time if not idle
    if (s.isActive && s.focused && now - s.lastActivity < this.settings.idleThreshold) {
      s.activeMs += now - s.lastActivity;
    }
    s.isActive = false;
    s.endTime = now;
    s.totalWallTime = now - s.wallStart;

    if (!silent && s.problemId && this.settings.userId) {
      this.safePostEvent("ProblemSessionEnded", {
        userId: this.settings.userId,
        problemId: s.problemId,
        platform: this.platformFromUrl(s.url),
        totalActiveMs: s.activeMs,
        totalWallTime: s.totalWallTime,
        finalVerdict: s.finalVerdict,
        counters: s.counters
      }, tabId);
    }

    this.activeSessions.delete(tabId);
    console.log("[bg] session ended:", tabId);
  }

  markActivity(tabId) {
    const s = this.activeSessions.get(tabId);
    if (!s) return;
    const now = Date.now();

    // If still within idle threshold and focused, accrue active time
    if (s.isActive && s.focused && now - s.lastActivity < this.settings.idleThreshold) {
      s.activeMs += now - s.lastActivity;
    }

    s.lastActivity = now;
  }

  markFocus(tabId, focused) {
    const s = this.activeSessions.get(tabId);
    if (!s) return;
    this.markActivity(tabId);
    s.focused = !!focused;
  }

  platformFromUrl(url) {
    try {
      const host = new URL(url).hostname;
      if (host.includes("leetcode.com")) return "leetcode";
      if (host.includes("geeksforgeeks.org")) return "geeksforgeeks";
      if (host.includes("hackerrank.com")) return "hackerrank";
    } catch {}
    return "unknown";
  }

  // ------------- Event handlers (from content script) -----------------

  async handleSessionStart(data, tabId) {
    try {
      if (!tabId) return;
      this.ensureSession(tabId, data?.problemUrl || null);
      const s = this.activeSessions.get(tabId);
      if (!s) return;

      // Attach problem title to session immediately
      s.problemTitle = data.problemTitle;

      // Call detect to get problemId and expected time
      const det = await this.detectProblem({
        platform: data.platform || this.platformFromUrl(s.url),
        problemTitle: data.problemTitle,
        problemUrl: data.problemUrl || s.url
      });

      s.problemId = det.problemId;
      s.expectedTime = det.expectedTime ?? det.expectedTimeMinutes ?? null;

      if (this.settings.userId) {
        await this.safePostEvent("ProblemSessionStarted", {
          userId: this.settings.userId,
          platform: data.platform || this.platformFromUrl(s.url),
          problemId: s.problemId,
          problemTitle: s.problemTitle,
          problemUrl: s.url,
          expectedTime: s.expectedTime
        }, tabId);
      }
    } catch (err) {
      console.error("[bg] handleSessionStart error:", err.message);
      await this.queueForRetry("ProblemSessionStarted", data, tabId);
    }
  }

  async handleActivityPing(_data, tabId) {
    try {
      if (!tabId) return;
      this.markActivity(tabId);
      // Keystroke approximation
      const s = this.activeSessions.get(tabId);
      if (s) s.counters.keystrokes++;
      // Activity ping itself is not posted (heartbeats will carry counters)
    } catch (err) {
      console.warn("[bg] handleActivityPing error:", err.message);
    }
  }

  async handleFocusChange(data, tabId) {
    try {
      if (!tabId) return;
      this.markFocus(tabId, !!data?.focused);
      // Optionally post a focus-change progress event (low priority)
      const s = this.activeSessions.get(tabId);
      if (s && s.problemId && this.settings.userId) {
        await this.safePostEvent("ProblemProgress", {
          userId: this.settings.userId,
          problemId: s.problemId,
          event: "focus_change",
          focused: !!data?.focused
        }, tabId);
      }
    } catch (err) {
      console.warn("[bg] handleFocusChange error:", err.message);
    }
  }

  async handleRunClicked(_data, tabId) {
    try {
      if (!tabId) return;
      const s = this.activeSessions.get(tabId);
      if (!s) return;
      s.counters.runs++;
      this.markActivity(tabId);
      // Optional immediate progress event
      if (s.problemId && this.settings.userId) {
        await this.safePostEvent("ProblemProgress", {
          userId: this.settings.userId,
          problemId: s.problemId,
          event: "run_clicked"
        }, tabId);
      }
    } catch (err) {
      console.warn("[bg] handleRunClicked error:", err.message);
    }
  }

  async handleSubmitClicked(_data, tabId) {
    try {
      if (!tabId) return;
      const s = this.activeSessions.get(tabId);
      if (!s) return;
      s.counters.submissions++;
      this.markActivity(tabId);
      if (s.problemId && this.settings.userId) {
        await this.safePostEvent("ProblemProgress", {
          userId: this.settings.userId,
          problemId: s.problemId,
          event: "submit_clicked"
        }, tabId);
      }
    } catch (err) {
      console.warn("[bg] handleSubmitClicked error:", err.message);
    }
  }

  async handleVerdictDetected(data, tabId) {
    try {
      if (!tabId) return;
      const s = this.activeSessions.get(tabId);
      if (!s) return;

      s.finalVerdict = data?.verdict || s.finalVerdict || null;
      this.markActivity(tabId);

      if (s.problemId && this.settings.userId) {
        await this.safePostEvent("ProblemSubmitted", {
          userId: this.settings.userId,
          problemId: s.problemId,
          verdict: data?.verdict || null,
          runtime: data?.runtime || null,
          memory: data?.memory || null
        }, tabId);
      }
    } catch (err) {
      console.error("[bg] handleVerdictDetected error:", err.message);
      await this.queueForRetry("ProblemSubmitted", data, tabId);
    }
  }

  async handleSessionEnd(_data, tabId) {
    try {
      this.endSession(tabId, false);
    } catch (err) {
      console.error("[bg] handleSessionEnd error:", err.message);
    }
  }

  // Legacy passthrough
  async handleBackendEvent(eventType, data, tabId) {
    try {
      await this.storeEvent(eventType, { ...data, tabId, timestamp: Date.now() });
      await this.postEvent(eventType, data, tabId);
    } catch (err) {
      console.error("[bg] handleBackendEvent error:", err.message);
      await this.queueForRetry(eventType, data, tabId);
    }
  }

  // ------------- Backend I/O -----------------

  async detectProblem({ platform, problemTitle, problemUrl }) {
    const base = this.settings.backendUrl?.replace(/\/+$/, "") || "";
    const url = `${base}/api/v1/problems/detect`;
    const headers = { "Content-Type": "application/json" };
    if (this.settings.apiKey) headers["Authorization"] = `Bearer ${this.settings.apiKey}`;

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        userId: this.settings.userId || "user",
        platform,
        problemTitle,
        problemUrl
      })
    });

    if (!resp.ok) {
      throw new Error(`detect HTTP ${resp.status}`);
    }
    return await resp.json();
  }

  async postEvent(eventType, data, tabId) {
    if (!this.settings.userId) {
      throw new Error("User ID not configured");
    }
    const base = this.settings.backendUrl?.replace(/\/+$/, "") || "";
    const url = `${base}/api/v1/problems/events`;
    const headers = { "Content-Type": "application/json" };
    if (this.settings.apiKey) headers["Authorization"] = `Bearer ${this.settings.apiKey}`;

    const payload = {
      eventType,
      data,
      timestamp: Date.now()
    };

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error(`events HTTP ${resp.status}`);
    }
    return await resp.json().catch(() => ({}));
  }

  async safePostEvent(eventType, data, tabId) {
    try {
      await this.postEvent(eventType, data, tabId);
      await this.storeEvent(eventType, data);
    } catch (err) {
      console.warn("[bg] safePostEvent queueing:", eventType, err.message);
      await this.queueForRetry(eventType, data, tabId);
    }
  }

  // ------------- Retry queue -----------------

  getRetryDelay(retryCount) {
    // 1s, 2s, 4s, 8s, 16s, then cap at 30s + jitter
    const base = Math.min(1000 * Math.pow(2, retryCount), 30000);
    return base + Math.floor(Math.random() * 1000);
  }

  async queueForRetry(eventType, data, tabId) {
    const item = {
      eventType,
      data,
      tabId,
      retryCount: 0,
      nextRetry: Date.now() + this.getRetryDelay(0)
    };
    this.retryQueue.push(item);
    await this.storeRetryQueue();
    this.scheduleRetryProcessing();
  }

  startRetryProcessor() {
    // Sweep queue every 30s
    if (this.queueSweepIntervalHandle) clearInterval(this.queueSweepIntervalHandle);
    this.queueSweepIntervalHandle = setInterval(() => this.processRetryQueue(), 30000);
  }

  scheduleRetryProcessing() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.processRetryQueue(), 5000);
  }

  async processRetryQueue() {
    // Re-evaluate online hint
    this.isOnline = typeof navigator !== "undefined" ? !!navigator.onLine : true;
    if (!this.isOnline || this.retryQueue.length === 0) return;

    const now = Date.now();
    const maxRetries = 5;

    const ready = this.retryQueue.filter(it => it.nextRetry <= now && it.retryCount < maxRetries);
    if (ready.length === 0) return;

    for (const item of ready) {
      try {
        await this.postEvent(item.eventType, item.data, item.tabId);
        // Remove from queue
        this.retryQueue = this.retryQueue.filter(q => q !== item);
      } catch (err) {
        item.retryCount++;
        item.nextRetry = Date.now() + this.getRetryDelay(item.retryCount);
        if (item.retryCount >= maxRetries) {
          console.error("[bg] max retries exceeded for", item.eventType);
          // Keep or drop based on your policy; here we drop after max
          this.retryQueue = this.retryQueue.filter(q => q !== item);
        }
      }
    }

    await this.storeRetryQueue();
  }

  async storeRetryQueue() {
    try {
      await chrome.storage.local.set({ retryQueue: this.retryQueue });
    } catch (err) {
      console.error("[bg] storeRetryQueue error:", err.message);
    }
  }

  async loadRetryQueue() {
    try {
      const { retryQueue } = await chrome.storage.local.get(["retryQueue"]);
      this.retryQueue = Array.isArray(retryQueue) ? retryQueue : [];
    } catch (err) {
      console.error("[bg] loadRetryQueue error:", err.message);
      this.retryQueue = [];
    }
  }

  // ------------- Event storage (local history) -----------------

  async storeEvent(eventType, data) {
    try {
      const events = await this.getStoredEvents();
      events.push({ eventType, data, timestamp: Date.now() });
      // keep last 100 events
      if (events.length > 100) events.splice(0, events.length - 100);
      await chrome.storage.local.set({ events });
    } catch (err) {
      console.error("[bg] storeEvent error:", err.message);
    }
  }

  async getStoredEvents() {
    try {
      const { events } = await chrome.storage.local.get(["events"]);
      return Array.isArray(events) ? events : [];
    } catch (err) {
      console.error("[bg] getStoredEvents error:", err.message);
      return [];
    }
  }

  // ------------- Heartbeats -----------------

  startHeartbeatProcessor() {
    if (this.heartbeatIntervalHandle) clearInterval(this.heartbeatIntervalHandle);
    this.heartbeatIntervalHandle = setInterval(() => this.processHeartbeats(), this.settings.heartbeatInterval);
  }

  async processHeartbeats() {
    const now = Date.now();
    for (const [tabId, s] of this.activeSessions) {
      if (!s.isActive || !s.focused) continue;
      // Accumulate active time up to now (if not idle)
      if (now - s.lastActivity < this.settings.idleThreshold) {
        s.activeMs += now - s.lastActivity;
      }
      s.lastActivity = now;

      if (s.problemId && this.settings.userId) {
        try {
          await this.safePostEvent("ProblemProgress", {
            userId: this.settings.userId,
            problemId: s.problemId,
            event: "heartbeat",
            activeMsSinceStart: s.activeMs,
            counters: s.counters
          }, tabId);
        } catch (err) {
          // safePostEvent will queue on failure; no throw here
        }
      }
    }
  }

  // ------------- Status for popup -----------------

  async getSessionInfo(tabId, sendResponse) {
    try {
      const s = this.activeSessions.get(tabId);
      if (!s) {
        sendResponse({ success: false, message: "No active session" });
        return;
      }
      const now = Date.now();
      // Compute a view-only activeTime snapshot (do not mutate here)
      const activeSnapshot =
        s.isActive && s.focused && now - s.lastActivity < this.settings.idleThreshold
          ? s.activeMs + (now - s.lastActivity)
          : s.activeMs;

      sendResponse({
        success: true,
        data: {
          tabId: s.tabId,
          platform: this.platformFromUrl(s.url),
          url: s.url,
          problemId: s.problemId || null,
          problemTitle: s.problemTitle || null,
          expectedTime: s.expectedTime || null,
          activeMs: activeSnapshot,
          counters: s.counters,
          finalVerdict: s.finalVerdict,
          isActive: s.isActive,
          focused: s.focused
        }
      });
    } catch (err) {
      sendResponse({ success: false, message: err.message });
    }
  }
}

// Instantiate manager
const backgroundManager = new BackgroundManager();

// Install defaults on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.sync.set({
      backendUrl: "http://localhost:8082",
      apiKey: "",
      userId: "",
      idleThreshold: 60000,
      heartbeatInterval: 30000
    });
  }
});

// On startup, reload retry queue
chrome.runtime.onStartup.addListener(() => {
  backgroundManager.loadRetryQueue();
});
