// Background service worker for session tracking extension

class BackgroundManager {
  constructor() {
    this.activeSessions = new Map();
    this.settings = {
      backendUrl: 'http://localhost:8082',
      apiKey: '',
      userId: '',
      idleThreshold: 60000, // 60 seconds default
      heartbeatInterval: 30000 // 30 seconds default
    };
    
    this.retryQueue = [];
    this.isOnline = navigator.onLine;
    this.retryTimer = null;
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupMessageListeners();
    this.setupTabListeners();
    this.setupNetworkListeners();
    this.startRetryProcessor();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(Object.keys(this.settings));
      this.settings = { ...this.settings, ...result };
      console.log('Settings loaded:', this.settings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'SESSION_START':
          this.handleSessionStart(message.data, sender.tab?.id);
          break;
        case 'ACTIVITY_PING':
          this.handleActivityPing(message.data, sender.tab?.id);
          break;
        case 'FOCUS_CHANGE':
          this.handleFocusChange(message.data, sender.tab?.id);
          break;
        case 'RUN_CLICKED':
          this.handleRunClicked(message.data, sender.tab?.id);
          break;
        case 'SUBMIT_CLICKED':
          this.handleSubmitClicked(message.data, sender.tab?.id);
          break;
        case 'VERDICT_DETECTED':
          this.handleVerdictDetected(message.data, sender.tab?.id);
          break;
        case 'SESSION_END':
          this.handleSessionEnd(message.data, sender.tab?.id);
          break;
        case 'GET_SESSION_INFO':
          this.getSessionInfo(sender.tab?.id, sendResponse);
          return true;
        case 'SETTINGS_UPDATED':
          this.updateSettings(message.settings);
          break;
        case 'BACKEND_EVENT': // Legacy support
          this.handleBackendEvent(message.eventType, message.data, sender.tab?.id);
          break;
      }
    });
  }

  setupTabListeners() {
    // Track tab updates to detect navigation
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && this.isCodingPlatform(tab.url)) {
        this.initializeSession(tabId, tab.url);
      }
    });

    // Track tab removal to end sessions
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.endSession(tabId);
    });

    // Track tab activation to resume sessions
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.resumeSession(activeInfo.tabId);
    });
  }

  setupNetworkListeners() {
    // Listen for online/offline status changes
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processRetryQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  isCodingPlatform(url) {
    if (!url) return false;
    const hostname = new URL(url).hostname;
    return hostname.includes('leetcode.com') || 
           hostname.includes('geeksforgeeks.org') || 
           hostname.includes('hackerrank.com');
  }

  initializeSession(tabId, url) {
    const sessionData = {
      tabId: tabId,
      url: url,
      startTime: Date.now(),
      wallStart: Date.now(),
      isActive: true,
      lastActivity: Date.now(),
      activeMs: 0,
      focused: true,
      counters: {
        keystrokes: 0,
        runs: 0,
        submissions: 0
      },
      finalVerdict: null
    };
    
    this.activeSessions.set(tabId, sessionData);
    console.log('Session initialized for tab:', tabId);
  }

  resumeSession(tabId) {
    const session = this.activeSessions.get(tabId);
    if (session && !session.isActive) {
      session.isActive = true;
      session.lastActivity = Date.now();
      session.focused = true;
      console.log('Session resumed for tab:', tabId);
    }
  }

  endSession(tabId) {
    const session = this.activeSessions.get(tabId);
    if (session) {
      const now = Date.now();
      if (session.isActive) {
        session.activeMs += now - session.lastActivity;
      }
      
      session.isActive = false;
      session.endTime = now;
      session.totalWallTime = now - session.wallStart;
      
      console.log('Session ended for tab:', tabId, session);
      this.activeSessions.delete(tabId);
    }
  }

  // New session event handlers
  async handleSessionStart(data, tabId) {
    try {
      // First, detect the problem
      const problemInfo = await this.detectProblem(data);
      
      // Then start the session
      await this.postEvent('ProblemSessionStarted', {
        userId: this.settings.userId,
        platform: data.platform,
        problemId: problemInfo.problemId,
        problemTitle: data.problemTitle,
        problemUrl: data.problemUrl,
        expectedTime: problemInfo.expectedTime,
        timestamp: Date.now()
      }, tabId);

      // Update local session data
      if (tabId && this.activeSessions.has(tabId)) {
        const session = this.activeSessions.get(tabId);
        session.problemId = problemInfo.problemId;
        session.problemTitle = data.problemTitle;
        session.expectedTime = problemInfo.expectedTime;
      }

    } catch (error) {
      console.error('Failed to handle session start:', error);
      await this.queueForRetry('ProblemSessionStarted', data, tabId);
    }
  }

  async handleActivityPing(data, tabId) {
    try {
      await this.postEvent('ProblemProgress', {
        userId: this.settings.userId,
        sessionId: data.sessionId,
        activeMsSinceStart: data.activeMsSinceStart,
        counters: data.counters,
        timestamp: Date.now()
      }, tabId);
    } catch (error) {
      console.error('Failed to handle activity ping:', error);
      await this.queueForRetry('ProblemProgress', data, tabId);
    }
  }

  async handleFocusChange(data, tabId) {
    try {
      await this.postEvent('ProblemProgress', {
        userId: this.settings.userId,
        sessionId: data.sessionId,
        event: 'focus_change',
        focused: data.focused,
        timestamp: Date.now()
      }, tabId);
    } catch (error) {
      console.error('Failed to handle focus change:', error);
      await this.queueForRetry('ProblemProgress', data, tabId);
    }
  }

  async handleRunClicked(data, tabId) {
    try {
      if (tabId && this.activeSessions.has(tabId)) {
        const session = this.activeSessions.get(tabId);
        session.counters.runs++;
      }

      await this.postEvent('ProblemProgress', {
        userId: this.settings.userId,
        sessionId: data.sessionId,
        event: 'run_clicked',
        timestamp: Date.now()
      }, tabId);
    } catch (error) {
      console.error('Failed to handle run clicked:', error);
      await this.queueForRetry('ProblemProgress', data, tabId);
    }
  }

  async handleSubmitClicked(data, tabId) {
    try {
      if (tabId && this.activeSessions.has(tabId)) {
        const session = this.activeSessions.get(tabId);
        session.counters.submissions++;
      }

      await this.postEvent('ProblemProgress', {
        userId: this.settings.userId,
        sessionId: data.sessionId,
        event: 'submit_clicked',
        timestamp: Date.now()
      }, tabId);
    } catch (error) {
      console.error('Failed to handle submit clicked:', error);
      await this.queueForRetry('ProblemProgress', data, tabId);
    }
  }

  async handleVerdictDetected(data, tabId) {
    try {
      if (tabId && this.activeSessions.has(tabId)) {
        const session = this.activeSessions.get(tabId);
        session.finalVerdict = data.verdict;
      }

      await this.postEvent('ProblemSubmitted', {
        userId: this.settings.userId,
        sessionId: data.sessionId,
        verdict: data.verdict,
        runtime: data.runtime,
        memory: data.memory,
        timestamp: Date.now()
      }, tabId);
    } catch (error) {
      console.error('Failed to handle verdict detected:', error);
      await this.queueForRetry('ProblemSubmitted', data, tabId);
    }
  }

  async handleSessionEnd(data, tabId) {
    try {
      await this.postEvent('ProblemSessionEnded', {
        userId: this.settings.userId,
        sessionId: data.sessionId,
        totalActiveMs: data.totalActiveMs,
        totalWallTime: data.totalWallTime,
        finalVerdict: data.finalVerdict,
        counters: data.counters,
        timestamp: Date.now()
      }, tabId);
    } catch (error) {
      console.error('Failed to handle session end:', error);
      await this.queueForRetry('ProblemSessionEnded', data, tabId);
    }
  }

  // Legacy handler for backward compatibility
  async handleBackendEvent(eventType, data, tabId) {
    try {
      const enrichedData = {
        ...data,
        tabId: tabId,
        timestamp: Date.now()
      };

      await this.storeEvent(eventType, enrichedData);
      await this.postEvent(eventType, enrichedData, tabId);

      if (tabId && this.activeSessions.has(tabId)) {
        const session = this.activeSessions.get(tabId);
        session.lastEvent = eventType;
        session.lastEventTime = Date.now();
      }

    } catch (error) {
      console.error('Failed to handle backend event:', error);
      await this.queueForRetry(eventType, data, tabId);
    }
  }

  async detectProblem(data) {
    const response = await fetch(`${this.settings.backendUrl}/api/v1/problems/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.settings.apiKey && { 'Authorization': `Bearer ${this.settings.apiKey}` })
      },
      body: JSON.stringify({
        userId: this.settings.userId,
        platform: data.platform,
        problemTitle: data.problemTitle,
        problemUrl: data.problemUrl
      })
    });

    if (!response.ok) {
      throw new Error(`Problem detection failed: ${response.status}`);
    }

    return await response.json();
  }

  async postEvent(eventType, data, tabId) {
    if (!this.settings.userId) {
      throw new Error('User ID not configured');
    }

    const response = await fetch(`${this.settings.backendUrl}/api/v1/problems/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.settings.apiKey && { 'Authorization': `Bearer ${this.settings.apiKey}` })
      },
      body: JSON.stringify({
        eventType: eventType,
        data: data,
        timestamp: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`Backend request failed: ${response.status}`);
    }

    console.log('Event sent to backend:', eventType, data);
    return response.json();
  }

  async queueForRetry(eventType, data, tabId) {
    try {
      const retryItem = {
        eventType,
        data,
        tabId,
        timestamp: Date.now(),
        retryCount: 0,
        nextRetry: Date.now() + this.getRetryDelay(0)
      };

      this.retryQueue.push(retryItem);
      await this.storeRetryQueue();
      
      console.log('Event queued for retry:', eventType);
      
      // Schedule retry processing
      this.scheduleRetryProcessing();
      
    } catch (error) {
      console.error('Failed to queue for retry:', error);
    }
  }

  getRetryDelay(retryCount) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    return delay + Math.random() * 1000; // Add jitter
  }

  async storeRetryQueue() {
    try {
      await chrome.storage.local.set({ retryQueue: this.retryQueue });
    } catch (error) {
      console.error('Failed to store retry queue:', error);
    }
  }

  async loadRetryQueue() {
    try {
      const result = await chrome.storage.local.get(['retryQueue']);
      this.retryQueue = result.retryQueue || [];
    } catch (error) {
      console.error('Failed to load retry queue:', error);
      this.retryQueue = [];
    }
  }

  startRetryProcessor() {
    // Process retry queue every 30 seconds
    setInterval(() => {
      this.processRetryQueue();
    }, 30000);
  }

  scheduleRetryProcessing() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    
    // Process queue in 5 seconds
    this.retryTimer = setTimeout(() => {
      this.processRetryQueue();
    }, 5000);
  }

  async processRetryQueue() {
    if (!this.isOnline || this.retryQueue.length === 0) {
      return;
    }

    const now = Date.now();
    const maxRetries = 5;
    const itemsToProcess = this.retryQueue.filter(item => 
      item.nextRetry <= now && item.retryCount < maxRetries
    );

    for (const item of itemsToProcess) {
      try {
        await this.postEvent(item.eventType, item.data, item.tabId);
        
        // Remove successful item
        this.retryQueue = this.retryQueue.filter(qItem => qItem !== item);
        console.log('Retry successful for:', item.eventType);
        
      } catch (error) {
        console.error('Retry failed for:', item.eventType, error);
        
        // Update retry count and next retry time
        item.retryCount++;
        item.nextRetry = now + this.getRetryDelay(item.retryCount);
        
        if (item.retryCount >= maxRetries) {
          console.error('Max retries exceeded for:', item.eventType);
          // Could store failed events for manual review
        }
      }
    }

    await this.storeRetryQueue();
  }

  async storeEvent(eventType, data) {
    try {
      const events = await this.getStoredEvents();
      events.push({
        eventType,
        data,
        timestamp: Date.now()
      });

      // Keep only last 100 events
      if (events.length > 100) {
        events.splice(0, events.length - 100);
      }

      await chrome.storage.local.set({ events: events });
    } catch (error) {
      console.error('Failed to store event:', error);
    }
  }

  async getStoredEvents() {
    try {
      const result = await chrome.storage.local.get(['events']);
      return result.events || [];
    } catch (error) {
      console.error('Failed to get stored events:', error);
      return [];
    }
  }

  async getSessionInfo(tabId, sendResponse) {
    try {
      const session = this.activeSessions.get(tabId);
      if (session) {
        const now = Date.now();
        const activeTime = session.isActive ? 
          (now - session.startTime) : 
          (session.lastActivity - session.startTime);
        
        sendResponse({
          success: true,
          data: {
            ...session,
            currentActiveTime: activeTime,
            isActive: session.isActive
          }
        });
      } else {
        sendResponse({
          success: false,
          message: 'No active session found'
        });
      }
    } catch (error) {
      sendResponse({
        success: false,
        message: error.message
      });
    }
  }

  async updateSettings(settings) {
    try {
      this.settings = { ...this.settings, ...settings };
      await chrome.storage.sync.set(settings);
      console.log('Settings updated:', settings);
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  }

  // Heartbeat processing for active sessions
  startHeartbeatProcessor() {
    setInterval(() => {
      this.processHeartbeats();
    }, this.settings.heartbeatInterval);
  }

  async processHeartbeats() {
    const now = Date.now();
    
    for (const [tabId, session] of this.activeSessions) {
      if (session.isActive && session.focused) {
        try {
          await this.postEvent('ProblemProgress', {
            userId: this.settings.userId,
            sessionId: session.sessionId || `tab_${tabId}`,
            activeMsSinceStart: session.activeMs,
            counters: session.counters,
            event: 'heartbeat',
            timestamp: now
          }, tabId);
        } catch (error) {
          console.error('Heartbeat failed for tab:', tabId, error);
          // Heartbeats are not critical, don't queue for retry
        }
      }
    }
  }
}

// Initialize background manager
const backgroundManager = new BackgroundManager();

// Start heartbeat processing
backgroundManager.startHeartbeatProcessor();

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');
    // Set default settings
    chrome.storage.sync.set({
      backendUrl: 'http://localhost:8082',
      apiKey: '',
      userId: '',
      idleThreshold: 60,
      heartbeatInterval: 30
    });
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
  backgroundManager.loadRetryQueue();
});
