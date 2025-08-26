// Options page JavaScript for Session Tracker extension

class OptionsManager {
  constructor() {
    this.defaultSettings = {
      backendUrl: 'http://localhost:8082',
      apiKey: '',
      userId: '',
      idleThreshold: 60,
      heartbeatInterval: 30
    };
    
    this.init();
  }

  init() {
    this.loadSettings();
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById('saveBtn').addEventListener('click', () => this.saveSettings());
    document.getElementById('resetBtn').addEventListener('click', () => this.resetToDefaults());
    document.getElementById('testConnectionBtn').addEventListener('click', () => this.testConnection());
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(Object.keys(this.defaultSettings));
      
      // Load values into form fields
      document.getElementById('backendUrl').value = result.backendUrl || this.defaultSettings.backendUrl;
      document.getElementById('apiKey').value = result.apiKey || this.defaultSettings.apiKey;
      document.getElementById('userId').value = result.userId || this.defaultSettings.userId;
      document.getElementById('idleThreshold').value = result.idleThreshold || this.defaultSettings.idleThreshold;
      document.getElementById('heartbeatInterval').value = result.heartbeatInterval || this.defaultSettings.heartbeatInterval;
      
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showStatus('Failed to load settings', 'error');
    }
  }

  async saveSettings() {
    try {
      const settings = {
        backendUrl: document.getElementById('backendUrl').value.trim(),
        apiKey: document.getElementById('apiKey').value.trim(),
        userId: document.getElementById('userId').value.trim(),
        idleThreshold: parseInt(document.getElementById('idleThreshold').value) || this.defaultSettings.idleThreshold,
        heartbeatInterval: parseInt(document.getElementById('heartbeatInterval').value) || this.defaultSettings.heartbeatInterval
      };

      // Validate required fields
      if (!settings.backendUrl) {
        this.showStatus('Backend URL is required', 'error');
        return;
      }

      if (!settings.userId) {
        this.showStatus('User ID is required', 'error');
        return;
      }

      // Save to chrome.storage.sync
      await chrome.storage.sync.set(settings);
      
      // Notify background script of settings update
      await chrome.runtime.sendMessage({
        type: 'SETTINGS_UPDATED',
        settings: settings
      });

      this.showStatus('Settings saved successfully!', 'success');
      
      // Update background script with new settings
      setTimeout(() => {
        this.showStatus('Settings updated in background', 'info');
      }, 1000);

    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showStatus('Failed to save settings', 'error');
    }
  }

  async resetToDefaults() {
    try {
      // Reset form fields to defaults
      document.getElementById('backendUrl').value = this.defaultSettings.backendUrl;
      document.getElementById('apiKey').value = this.defaultSettings.apiKey;
      document.getElementById('userId').value = this.defaultSettings.userId;
      document.getElementById('idleThreshold').value = this.defaultSettings.idleThreshold;
      document.getElementById('heartbeatInterval').value = this.defaultSettings.heartbeatInterval;

      // Save defaults to storage
      await chrome.storage.sync.set(this.defaultSettings);
      
      // Notify background script
      await chrome.runtime.sendMessage({
        type: 'SETTINGS_UPDATED',
        settings: this.defaultSettings
      });

      this.showStatus('Reset to defaults successfully', 'success');

    } catch (error) {
      console.error('Failed to reset settings:', error);
      this.showStatus('Failed to reset settings', 'error');
    }
  }

  async testConnection() {
    const backendUrl = document.getElementById('backendUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!backendUrl) {
      this.showStatus('Please enter a backend URL first', 'error');
      return;
    }

    try {
      this.showStatus('Testing connection...', 'info');
      
      // Test the detect endpoint
      const testUrl = `${backendUrl}/api/v1/problems/detect`;
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(testUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          userId: document.getElementById('userId').value || 'test-user',
          platform: 'test',
          problemTitle: 'Test Problem',
          problemUrl: 'https://test.com/test'
        })
      });

      if (response.ok) {
        this.showStatus('Connection successful! Backend is accessible.', 'success');
      } else {
        this.showStatus(`Connection failed: ${response.status} ${response.statusText}`, 'error');
      }

    } catch (error) {
      console.error('Connection test failed:', error);
      this.showStatus(`Connection failed: ${error.message}`, 'error');
    }
  }

  showStatus(message, type) {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    statusElement.style.display = 'block';

    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, 3000);
    }
  }

  // Validate URL format
  validateUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

// Initialize options manager when page loads
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
});

// Handle settings import/export (optional feature)
class SettingsExporter {
  static async exportSettings() {
    try {
      const result = await chrome.storage.sync.get(null);
      const dataStr = JSON.stringify(result, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'session-tracker-settings.json';
      link.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export settings:', error);
    }
  }

  static async importSettings(file) {
    try {
      const text = await file.text();
      const settings = JSON.parse(text);
      
      // Validate settings structure
      const requiredKeys = ['backendUrl', 'userId', 'idleThreshold', 'heartbeatInterval'];
      const missingKeys = requiredKeys.filter(key => !(key in settings));
      
      if (missingKeys.length > 0) {
        throw new Error(`Missing required settings: ${missingKeys.join(', ')}`);
      }

      // Save imported settings
      await chrome.storage.sync.set(settings);
      
      // Reload the page to reflect changes
      window.location.reload();
      
    } catch (error) {
      console.error('Failed to import settings:', error);
      alert(`Import failed: ${error.message}`);
    }
  }
}

// Add import/export functionality if needed
// document.getElementById('exportBtn')?.addEventListener('click', SettingsExporter.exportSettings);
// document.getElementById('importBtn')?.addEventListener('change', (e) => SettingsExporter.importSettings(e.target.files[0]));
