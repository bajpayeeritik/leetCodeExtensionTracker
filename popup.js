class PopupManager {
  constructor() {
    this.currentTab = null;
    this.sessionInfo = null;
    this.updateInterval = null;
    
    this.init();
  }

  async init() {
    await this.getCurrentTab();
    this.setupEventListeners();
    this.loadSettings();
    this.updateUI();
    
    // Start periodic updates
    this.updateInterval = setInterval(() => {
      this.updateUI();
    }, 1000);
  }

  async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;
    } catch (error) {
      console.error('Failed to get current tab:', error);
    }
  }

  setupEventListeners() {
    // Settings
    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    // Session actions
    document.getElementById('endSessionBtn').addEventListener('click', () => {
      this.endSession();
    });

    document.getElementById('pauseSessionBtn').addEventListener('click', () => {
      this.pauseSession();
    });

    // Events
    document.getElementById('clearEventsBtn').addEventListener('click', () => {
      this.clearEvents();
    });

    document.getElementById('exportDataBtn').addEventListener('click', () => {
      this.exportData();
    });
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['apiKey', 'backendUrl', 'idleThreshold']);
      
      if (result.apiKey) {
        document.getElementById('apiKey').value = result.apiKey;
      }
      if (result.backendUrl) {
        document.getElementById('backendUrl').value = result.backendUrl;
      }
      if (result.idleThreshold) {
        document.getElementById('idleThreshold').value = result.idleThreshold;
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async saveSettings() {
    try {
      const settings = {
        apiKey: document.getElementById('apiKey').value,
        backendUrl: document.getElementById('backendUrl').value,
        idleThreshold: parseInt(document.getElementById('idleThreshold').value) || 30000
      };

      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: settings
      });

      // Show success feedback
      const btn = document.getElementById('saveSettingsBtn');
      const originalText = btn.textContent;
      btn.textContent = 'Saved!';
      btn.style.background = '#4caf50';
      
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
      }, 2000);

    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showError('Failed to save settings');
    }
  }

  async updateUI() {
    if (!this.currentTab) return;

    try {
      // Check if current tab is a coding platform
      if (this.isCodingPlatform(this.currentTab.url)) {
        await this.updateSessionInfo();
        this.showSessionInfo();
      } else {
        this.showNoSession();
      }

      await this.updateEvents();
      this.updateStatusIndicator();

    } catch (error) {
      console.error('Failed to update UI:', error);
      this.showError('Failed to update session info');
    }
  }

  isCodingPlatform(url) {
    if (!url) return false;
    const hostname = new URL(url).hostname;
    return hostname.includes('leetcode.com') || 
           hostname.includes('geeksforgeeks.org') || 
           hostname.includes('hackerrank.com');
  }

  async updateSessionInfo() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SESSION_INFO'
      });

      if (response && response.success) {
        this.sessionInfo = response.data;
      } else {
        this.sessionInfo = null;
      }
    } catch (error) {
      console.error('Failed to get session info:', error);
      this.sessionInfo = null;
    }
  }

  showSessionInfo() {
    document.getElementById('sessionInfo').style.display = 'block';
    document.getElementById('noSession').style.display = 'none';

    if (this.sessionInfo) {
      // Update platform info
      document.getElementById('platformInfo').textContent = this.getPlatformDisplayName(this.sessionInfo.platform);
      
      // Update problem info
      document.getElementById('problemInfo').textContent = this.sessionInfo.problemId || 'Unknown';
      
      // Update time info
      this.updateTimeDisplay();
    }
  }

  showNoSession() {
    document.getElementById('sessionInfo').style.display = 'none';
    document.getElementById('noSession').style.display = 'block';
  }

  updateTimeDisplay() {
    if (!this.sessionInfo) return;

    const now = Date.now();
    const activeTime = this.sessionInfo.isActive ? 
      (now - this.sessionInfo.startTime) : 
      (this.sessionInfo.lastActiveTime - this.sessionInfo.startTime);
    
    const totalTime = now - this.sessionInfo.startTime;

    document.getElementById('activeTimeInfo').textContent = this.formatDuration(activeTime);
    document.getElementById('totalTimeInfo').textContent = this.formatDuration(totalTime);
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  getPlatformDisplayName(platform) {
    const names = {
      'leetcode': 'LeetCode',
      'geeksforgeeks': 'GeeksforGeeks',
      'hackerrank': 'HackerRank'
    };
    return names[platform] || platform;
  }

  async updateEvents() {
    try {
      const events = await this.getStoredEvents();
      this.displayEvents(events.slice(-5)); // Show last 5 events
    } catch (error) {
      console.error('Failed to update events:', error);
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

  displayEvents(events) {
    const eventsList = document.getElementById('eventsList');
    
    if (events.length === 0) {
      eventsList.innerHTML = '<div class="event-item"><span>No events yet</span></div>';
      return;
    }

    eventsList.innerHTML = events.map(event => {
      const time = new Date(event.timestamp).toLocaleTimeString();
      const type = event.eventType || 'Unknown';
      const details = this.getEventDetails(event);
      
      return `
        <div class="event-item">
          <span class="event-time">${time}</span>
          <span class="event-type">${type}</span>
          <span class="event-details">${details}</span>
        </div>
      `;
    }).join('');
  }

  getEventDetails(event) {
    if (event.data) {
      if (event.data.action) return event.data.action;
      if (event.data.result) return event.data.result;
      if (event.data.platform) return event.data.platform;
    }
    return '-';
  }

  updateStatusIndicator() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (this.sessionInfo && this.sessionInfo.isActive) {
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Active';
    } else if (this.sessionInfo) {
      statusDot.className = 'status-dot inactive';
      statusText.textContent = 'Paused';
    } else {
      statusDot.className = 'status-dot error';
      statusText.textContent = 'No Session';
    }
  }

  async endSession() {
    if (!this.currentTab) return;

    try {
      // Send message to content script to end session
      await chrome.tabs.sendMessage(this.currentTab.id, {
        type: 'END_SESSION'
      });

      this.showSuccess('Session ended');
      this.updateUI();
    } catch (error) {
      console.error('Failed to end session:', error);
      this.showError('Failed to end session');
    }
  }

  async pauseSession() {
    if (!this.currentTab) return;

    try {
      // Send message to content script to pause session
      await chrome.tabs.sendMessage(this.currentTab.id, {
        type: 'PAUSE_SESSION'
      });

      this.showSuccess('Session paused');
      this.updateUI();
    } catch (error) {
      console.error('Failed to pause session:', error);
      this.showError('Failed to pause session');
    }
  }

  async clearEvents() {
    try {
      await chrome.storage.local.remove(['events']);
      this.updateEvents();
      this.showSuccess('Events cleared');
    } catch (error) {
      console.error('Failed to clear events:', error);
      this.showError('Failed to clear events');
    }
  }

  async exportData() {
    try {
      const events = await this.getStoredEvents();
      const data = {
        exportDate: new Date().toISOString(),
        events: events
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      this.showSuccess('Data exported');
    } catch (error) {
      console.error('Failed to export data:', error);
      this.showError('Failed to export data');
    }
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 6px;
      color: white;
      font-size: 13px;
      font-weight: 500;
      z-index: 1000;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      background: ${type === 'success' ? '#4caf50' : '#f44336'};
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const popupManager = new PopupManager();
  
  // Cleanup when popup is closed
  window.addEventListener('unload', () => {
    popupManager.destroy();
  });
});
