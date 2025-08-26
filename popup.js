class PopupManager {
  constructor() {
    this.currentTab = null;
    this.sessionInfo = null;
    this.updateInterval = null;
    this.settings = null;
    
    this.init();
  }

  async init() {
    await this.getCurrentTab();
    this.setupEventListeners();
    await this.loadSettings();
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

    // Add options page link
    const optionsLink = document.createElement('a');
    optionsLink.href = 'options.html';
    optionsLink.textContent = 'Settings';
    optionsLink.className = 'btn-link';
    optionsLink.style.marginTop = '10px';
    optionsLink.style.display = 'block';
    optionsLink.style.textAlign = 'center';
    
    document.querySelector('.footer-content').appendChild(optionsLink);
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'backendUrl', 'apiKey', 'userId', 'idleThreshold', 'heartbeatInterval'
      ]);
      
      this.settings = {
        backendUrl: result.backendUrl || 'http://localhost:8082',
        apiKey: result.apiKey || '',
        userId: result.userId || '',
        idleThreshold: result.idleThreshold || 60,
        heartbeatInterval: result.heartbeatInterval || 30
      };
      
      // Update UI with settings
      if (result.backendUrl) {
        document.getElementById('backendUrl').value = result.backendUrl;
      }
      if (result.apiKey) {
        document.getElementById('apiKey').value = result.apiKey;
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
        backendUrl: document.getElementById('backendUrl').value.trim(),
        apiKey: document.getElementById('apiKey').value.trim(),
        idleThreshold: parseInt(document.getElementById('idleThreshold').value) || 60
      };

      // Validate required fields
      if (!settings.backendUrl) {
        this.showError('Backend URL is required');
        return;
      }

      await chrome.runtime.sendMessage({
        type: 'SETTINGS_UPDATED',
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
      // Get session info from background script
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SESSION_INFO'
      });

      if (response && response.success) {
        this.sessionInfo = response.data;
        this.showSessionInfo();
      } else {
        this.showNoSession();
      }

      // Update events list
      await this.updateEventsList();

    } catch (error) {
      console.error('Failed to update UI:', error);
    }
  }

  showSessionInfo() {
    document.getElementById('sessionInfo').style.display = 'block';
    document.getElementById('noSession').style.display = 'none';

    // Update session details
    document.getElementById('platformInfo').textContent = this.getPlatformDisplayName(this.sessionInfo.platform || 'unknown');
    document.getElementById('problemInfo').textContent = this.sessionInfo.problemTitle || 'Unknown Problem';
    document.getElementById('activeTimeInfo').textContent = this.formatTime(this.sessionInfo.currentActiveTime || 0);
    document.getElementById('totalTimeInfo').textContent = this.formatTime(this.sessionInfo.totalWallTime || 0);

    // Update status indicator
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (this.sessionInfo.isActive) {
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Active';
    } else {
      statusDot.className = 'status-dot paused';
      statusText.textContent = 'Paused';
    }

    // Update session actions
    const pauseBtn = document.getElementById('pauseSessionBtn');
    if (this.sessionInfo.isActive) {
      pauseBtn.textContent = 'Pause';
      pauseBtn.className = 'btn btn-warning';
    } else {
      pauseBtn.textContent = 'Resume';
      pauseBtn.className = 'btn btn-success';
    }
  }

  showNoSession() {
    document.getElementById('sessionInfo').style.display = 'none';
    document.getElementById('noSession').style.display = 'block';

    // Update status indicator
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    statusDot.className = 'status-dot inactive';
    statusText.textContent = 'No Session';
  }

  getPlatformDisplayName(platform) {
    const platformNames = {
      'leetcode': 'LeetCode',
      'geeksforgeeks': 'GeeksforGeeks',
      'hackerrank': 'HackerRank',
      'unknown': 'Unknown'
    };
    return platformNames[platform] || platform;
  }

  formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
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
      // Send message to content script to pause/resume session
      await chrome.tabs.sendMessage(this.currentTab.id, {
        type: 'TOGGLE_SESSION'
      });

      this.updateUI();

    } catch (error) {
      console.error('Failed to pause/resume session:', error);
      this.showError('Failed to pause/resume session');
    }
  }

  async updateEventsList() {
    try {
      const result = await chrome.storage.local.get(['events']);
      const events = result.events || [];
      
      const eventsList = document.getElementById('eventsList');
      eventsList.innerHTML = '';

      // Show last 10 events
      const recentEvents = events.slice(-10).reverse();
      
      if (recentEvents.length === 0) {
        eventsList.innerHTML = '<div class="event-item">No events yet</div>';
        return;
      }

      recentEvents.forEach(event => {
        const eventElement = document.createElement('div');
        eventElement.className = 'event-item';
        
        const time = new Date(event.timestamp).toLocaleTimeString();
        const type = event.eventType || 'Unknown';
        const details = this.formatEventDetails(event.data);
        
        eventElement.innerHTML = `
          <span class="event-time">${time}</span>
          <span class="event-type">${type}</span>
          <span class="event-details">${details}</span>
        `;
        
        eventsList.appendChild(eventElement);
      });

    } catch (error) {
      console.error('Failed to update events list:', error);
    }
  }

  formatEventDetails(data) {
    if (!data) return '-';
    
    if (typeof data === 'string') {
      return data;
    }
    
    if (data.platform) {
      return `${data.platform} - ${data.problemTitle || 'Unknown Problem'}`;
    }
    
    if (data.action) {
      return data.action;
    }
    
    return JSON.stringify(data).substring(0, 50) + '...';
  }

  async clearEvents() {
    try {
      await chrome.storage.local.remove(['events']);
      this.updateEventsList();
      this.showSuccess('Events cleared');
    } catch (error) {
      console.error('Failed to clear events:', error);
      this.showError('Failed to clear events');
    }
  }

  async exportData() {
    try {
      const result = await chrome.storage.local.get(['events', 'retryQueue']);
      const dataStr = JSON.stringify(result, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `session-tracker-data-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      
      URL.revokeObjectURL(url);
      this.showSuccess('Data exported successfully');
      
    } catch (error) {
      console.error('Failed to export data:', error);
      this.showError('Failed to export data');
    }
  }

  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  showError(message) {
    this.showMessage(message, 'error');
  }

  showMessage(message, type) {
    // Create temporary message element
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    messageElement.textContent = message;
    messageElement.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 20px;
      border-radius: 4px;
      color: white;
      font-weight: 500;
      z-index: 1000;
      animation: slideIn 0.3s ease-out;
    `;

    if (type === 'success') {
      messageElement.style.background = '#4caf50';
    } else {
      messageElement.style.background = '#f44336';
    }

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(messageElement);

    // Remove after 3 seconds
    setTimeout(() => {
      messageElement.remove();
      style.remove();
    }, 3000);
  }

  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

// Initialize popup manager when page loads
document.addEventListener('DOMContentLoaded', () => {
  const popupManager = new PopupManager();
  
  // Cleanup when popup closes
  window.addEventListener('beforeunload', () => {
    popupManager.cleanup();
  });
});
