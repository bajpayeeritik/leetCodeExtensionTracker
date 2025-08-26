// Background service worker for session tracking extension

class BackgroundManager {
  constructor() {
    this.activeSessions = new Map();
    this.backendUrl = 'https://your-backend-api.com/api'; // Replace with your backend URL
    this.apiKey = null; // Will be loaded from storage
    
    this.init();
  }

  init() {
    this.loadApiKey();
    this.setupMessageListeners();
    this.setupTabListeners();
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.local.get(['apiKey']);
      this.apiKey = result.apiKey;
    } catch (error) {
      console.error('Failed to load API key:', error);
    }
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'BACKEND_EVENT':
          this.handleBackendEvent(message.eventType, message.data, sender.tab?.id);
          break;
        case 'GET_SESSION_INFO':
          this.getSessionInfo(sender.tab?.id, sendResponse);
          return true; // Keep message channel open for async response
        case 'UPDATE_SETTINGS':
          this.updateSettings(message.settings);
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
      isActive: true,
      lastActiveTime: Date.now()
    };
    
    this.activeSessions.set(tabId, sessionData);
    console.log('Session initialized for tab:', tabId);
  }

  resumeSession(tabId) {
    const session = this.activeSessions.get(tabId);
    if (session && !session.isActive) {
      session.isActive = true;
      session.lastActiveTime = Date.now();
      console.log('Session resumed for tab:', tabId);
    }
  }

  endSession(tabId) {
    const session = this.activeSessions.get(tabId);
    if (session) {
      session.isActive = false;
      session.endTime = Date.now();
      session.totalActiveTime = session.endTime - session.startTime;
      
      console.log('Session ended for tab:', tabId, session);
      this.activeSessions.delete(tabId);
    }
  }

  async handleBackendEvent(eventType, data, tabId) {
    try {
      // Add tab context to the data
      const enrichedData = {
        ...data,
        tabId: tabId,
        timestamp: Date.now()
      };

      // Store event locally for debugging
      await this.storeEvent(eventType, enrichedData);

      // Send to backend
      await this.sendToBackend(eventType, enrichedData);

      // Update session tracking
      if (tabId && this.activeSessions.has(tabId)) {
        const session = this.activeSessions.get(tabId);
        session.lastEvent = eventType;
        session.lastEventTime = Date.now();
      }

    } catch (error) {
      console.error('Failed to handle backend event:', error);
      // Queue for retry
      await this.queueForRetry(eventType, data, tabId);
    }
  }

  async sendToBackend(eventType, data) {
    if (!this.apiKey) {
      throw new Error('API key not configured');
    }

    const response = await fetch(`${this.backendUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Event-Type': eventType
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

  async queueForRetry(eventType, data, tabId) {
    try {
      const retryQueue = await this.getRetryQueue();
      retryQueue.push({
        eventType,
        data,
        tabId,
        timestamp: Date.now(),
        retryCount: 0
      });

      await chrome.storage.local.set({ retryQueue: retryQueue });
    } catch (error) {
      console.error('Failed to queue for retry:', error);
    }
  }

  async getRetryQueue() {
    try {
      const result = await chrome.storage.local.get(['retryQueue']);
      return result.retryQueue || [];
    } catch (error) {
      console.error('Failed to get retry queue:', error);
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
          (session.lastActiveTime - session.startTime);
        
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
      if (settings.apiKey) {
        this.apiKey = settings.apiKey;
        await chrome.storage.local.set({ apiKey: settings.apiKey });
      }
      
      if (settings.backendUrl) {
        this.backendUrl = settings.backendUrl;
        await chrome.storage.local.set({ backendUrl: settings.backendUrl });
      }
      
      console.log('Settings updated:', settings);
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  }

  // Process retry queue periodically
  async processRetryQueue() {
    try {
      const retryQueue = await this.getRetryQueue();
      const now = Date.now();
      const maxRetries = 3;
      const retryDelay = 60000; // 1 minute

      for (let i = retryQueue.length - 1; i >= 0; i--) {
        const item = retryQueue[i];
        
        if (item.retryCount >= maxRetries) {
          retryQueue.splice(i, 1);
          continue;
        }

        if (now - item.timestamp > retryDelay) {
          try {
            await this.sendToBackend(item.eventType, item.data);
            retryQueue.splice(i, 1); // Remove successful item
          } catch (error) {
            item.retryCount++;
            item.timestamp = now;
          }
        }
      }

      await chrome.storage.local.set({ retryQueue: retryQueue });
    } catch (error) {
      console.error('Failed to process retry queue:', error);
    }
  }
}

// Initialize background manager
const backgroundManager = new BackgroundManager();

// Process retry queue every 5 minutes
setInterval(() => {
  backgroundManager.processRetryQueue();
}, 5 * 60 * 1000);

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');
    // Set default settings
    chrome.storage.local.set({
      apiKey: '',
      backendUrl: 'https://your-backend-api.com/api',
      idleThreshold: 30000
    });
  }
});
