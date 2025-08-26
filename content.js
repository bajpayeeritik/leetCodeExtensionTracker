class SessionTracker {
  constructor() {
    this.sessionData = {
      sessionId: null,
      startTime: null,
      endTime: null,
      totalActiveTime: 0,
      totalWallClockTime: 0,
      lastActiveTime: null,
      isActive: false,
      platform: this.detectPlatform(),
      problemId: this.extractProblemId(),
      problemTitle: this.extractProblemTitle(),
      problemUrl: window.location.href,
      events: [],
      counters: {
        keystrokes: 0,
        runs: 0,
        submissions: 0
      }
    };
    
    this.idleTimeout = null;
    this.heartbeatInterval = null;
    this.lastUserActivity = Date.now();
    this.mutationObserver = null;
    this.debounceTimer = null;
    
    this.init();
  }

  detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('leetcode.com')) return 'leetcode';
    if (hostname.includes('geeksforgeeks.org')) return 'geeksforgeeks';
    if (hostname.includes('hackerrank.com')) return 'hackerrank';
    return 'unknown';
  }

  extractProblemId() {
    const url = window.location.pathname;
    const match = url.match(/\/(?:problems?|challenges?)\/([^\/]+)/);
    return match ? match[1] : null;
  }

  extractProblemTitle() {
    switch (this.sessionData.platform) {
      case 'leetcode':
        return this.extractLeetCodeTitle();
      case 'geeksforgeeks':
        return this.extractGFGTitle();
      case 'hackerrank':
        return this.extractHackerRankTitle();
      default:
        return document.title || 'Unknown Problem';
    }
  }

  extractLeetCodeTitle() {
    // Try multiple selectors for LeetCode
    const selectors = [
      'div[data-cy="question-title"] h1',
      'h1[data-cy="question-title"]',
      'h1',
      '.mr-2.text-label-1'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    return 'LeetCode Problem';
  }

  extractGFGTitle() {
    const titleElement = document.querySelector('h1.entry-title');
    if (titleElement && titleElement.textContent.trim()) {
      return titleElement.textContent.trim();
    }
    return 'GeeksforGeeks Problem';
  }

  extractHackerRankTitle() {
    const titleElement = document.querySelector('h1');
    if (titleElement && titleElement.textContent.trim()) {
      return titleElement.textContent.trim();
    }
    return 'HackerRank Challenge';
  }

  init() {
    this.setupEventListeners();
    this.setupMutationObserver();
    this.startSession();
    this.startHeartbeat();
  }

  setupEventListeners() {
    // Page visibility changes
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    
    // Window focus/blur
    window.addEventListener('focus', this.handleWindowFocus.bind(this));
    window.addEventListener('blur', this.handleWindowBlur.bind(this));
    
    // User activity tracking
    document.addEventListener('keydown', this.handleUserActivity.bind(this));
    document.addEventListener('mousedown', this.handleUserActivity.bind(this));
    document.addEventListener('mousemove', this.handleUserActivity.bind(this));
    document.addEventListener('scroll', this.handleUserActivity.bind(this));
    
    // Platform-specific listeners
    this.setupPlatformSpecificListeners();
    
    // Navigation events
    window.addEventListener('beforeunload', this.handlePageUnload.bind(this));
  }

  setupPlatformSpecificListeners() {
    switch (this.sessionData.platform) {
      case 'leetcode':
        this.setupLeetCodeListeners();
        break;
      case 'geeksforgeeks':
        this.setupGFGListeners();
        break;
      case 'hackerrank':
        this.setupHackerRankListeners();
        break;
    }
  }

  setupLeetCodeListeners() {
    // Monitor for run and submit buttons
    this.observeForButtons([
      { selector: 'button[data-e2e-locator="console-run-button"]', action: 'run' },
      { selector: 'button[data-e2e-locator="console-submit-button"]', action: 'submit' }
    ]);

    // Monitor for verdict results
    this.observeForVerdicts([
      { selector: '[class*="success"], [class*="accepted"], [class*="correct"]', verdict: 'Accepted' },
      { selector: '[class*="error"], [class*="wrong"], [class*="failed"]', verdict: 'Wrong Answer' },
      { selector: '[class*="runtime"], [class*="time-limit"]', verdict: 'Time Limit Exceeded' },
      { selector: '[class*="memory"], [class*="memory-limit"]', verdict: 'Memory Limit Exceeded' }
    ]);
  }

  setupGFGListeners() {
    // Monitor for run and submit buttons
    this.observeForButtons([
      { selector: 'button:contains("Run"), button:contains("Submit")', action: 'run' },
      { selector: '.run-code-btn, .submit-code-btn', action: 'submit' }
    ]);

    // Monitor for verdict results
    this.observeForVerdicts([
      { selector: '.success-msg, .accepted-msg', verdict: 'Accepted' },
      { selector: '.error-msg, .wrong-msg', verdict: 'Wrong Answer' },
      { selector: '.runtime-msg', verdict: 'Runtime Error' }
    ]);
  }

  setupHackerRankListeners() {
    // Monitor for run and submit buttons
    this.observeForButtons([
      { selector: 'button:contains("Run Code")', action: 'run' },
      { selector: 'button:contains("Submit Code")', action: 'submit' },
      { selector: '.run-code, .submit-code', action: 'submit' }
    ]);

    // Monitor for verdict results
    this.observeForVerdicts([
      { selector: '.success-result, .accepted-result', verdict: 'Accepted' },
      { selector: '.error-result, .wrong-result', verdict: 'Wrong Answer' },
      { selector: '.runtime-result', verdict: 'Runtime Error' }
    ]);
  }

  setupMutationObserver() {
    this.mutationObserver = new MutationObserver((mutations) => {
      // Debounce mutations to avoid excessive processing
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      
      this.debounceTimer = setTimeout(() => {
        this.processMutations(mutations);
      }, 100);
    });
    
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }

  processMutations(mutations) {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        this.checkForNewElements(mutation.addedNodes);
      } else if (mutation.type === 'attributes') {
        this.checkForAttributeChanges(mutation);
      }
    });
  }

  checkForNewElements(nodes) {
    nodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Check for buttons
        this.checkForButtons(node);
        // Check for verdicts
        this.checkForVerdicts(node);
      }
    });
  }

  checkForAttributeChanges(mutation) {
    // Check if class changes indicate verdict
    if (mutation.attributeName === 'class') {
      this.checkForVerdicts(mutation.target);
    }
  }

  observeForButtons(buttonConfigs) {
    buttonConfigs.forEach(config => {
      this.findAndMonitorButton(config.selector, config.action);
    });
  }

  observeForVerdicts(verdictConfigs) {
    verdictConfigs.forEach(config => {
      this.findAndMonitorVerdict(config.selector, config.verdict);
    });
  }

  findAndMonitorButton(selector, action) {
    // Try to find button immediately
    let button = document.querySelector(selector);
    
    if (button) {
      this.attachButtonListener(button, action);
    } else {
      // If not found, monitor for it
      this.monitorForElement(selector, (element) => {
        this.attachButtonListener(element, action);
      });
    }
  }

  findAndMonitorVerdict(selector, verdict) {
    // Try to find verdict immediately
    let element = document.querySelector(selector);
    
    if (element) {
      this.handleVerdictDetected(verdict);
    } else {
      // If not found, monitor for it
      this.monitorForElement(selector, (element) => {
        this.handleVerdictDetected(verdict);
      });
    }
  }

  monitorForElement(selector, callback) {
    // Use a more robust element monitoring approach
    const checkForElement = () => {
      const element = document.querySelector(selector);
      if (element) {
        callback(element);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkForElement()) return;

    // Check periodically
    const interval = setInterval(() => {
      if (checkForElement()) {
        clearInterval(interval);
      }
    }, 1000);

    // Stop checking after 30 seconds
    setTimeout(() => clearInterval(interval), 30000);
  }

  attachButtonListener(button, action) {
    if (button.dataset.sessionTrackerAttached) return;
    
    button.dataset.sessionTrackerAttached = 'true';
    button.addEventListener('click', () => {
      this.handleButtonClick(action);
    });
  }

  handleButtonClick(action) {
    if (action === 'run') {
      this.trackRunClicked();
    } else if (action === 'submit') {
      this.trackSubmitClicked();
    }
  }

  trackRunClicked() {
    this.sessionData.counters.runs++;
    this.sendMessage('RUN_CLICKED', {
      sessionId: this.sessionData.sessionId,
      action: 'run',
      timestamp: Date.now()
    });
  }

  trackSubmitClicked() {
    this.sessionData.counters.submissions++;
    this.sendMessage('SUBMIT_CLICKED', {
      sessionId: this.sessionData.sessionId,
      action: 'submit',
      timestamp: Date.now()
    });
  }

  handleVerdictDetected(verdict) {
    this.sendMessage('VERDICT_DETECTED', {
      sessionId: this.sessionData.sessionId,
      verdict: verdict,
      timestamp: Date.now()
    });
  }

  startSession() {
    this.sessionData.sessionId = this.generateSessionId();
    this.sessionData.startTime = Date.now();
    this.sessionData.lastActiveTime = Date.now();
    this.sessionData.isActive = true;
    
    this.sendMessage('SESSION_START', {
      platform: this.sessionData.platform,
      problemTitle: this.sessionData.problemTitle,
      problemUrl: this.sessionData.problemUrl,
      timestamp: this.sessionData.startTime
    });
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.pauseSession();
    } else {
      this.resumeSession();
    }
  }

  handleWindowFocus() {
    this.resumeSession();
    this.sendMessage('FOCUS_CHANGE', {
      sessionId: this.sessionData.sessionId,
      focused: true,
      timestamp: Date.now()
    });
  }

  handleWindowBlur() {
    this.pauseSession();
    this.sendMessage('FOCUS_CHANGE', {
      sessionId: this.sessionData.sessionId,
      focused: false,
      timestamp: Date.now()
    });
  }

  handleUserActivity() {
    this.lastUserActivity = Date.now();
    
    if (!this.sessionData.isActive) {
      this.resumeSession();
    }
    
    // Track keystrokes
    this.sessionData.counters.keystrokes++;
    
    // Reset idle timeout
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }
    
    this.idleTimeout = setTimeout(() => {
      this.pauseSession();
    }, 60000); // 60 seconds default
  }

  pauseSession() {
    if (this.sessionData.isActive) {
      const now = Date.now();
      this.sessionData.totalActiveTime += now - this.sessionData.lastActiveTime;
      this.sessionData.isActive = false;
    }
  }

  resumeSession() {
    if (!this.sessionData.isActive) {
      this.sessionData.lastActiveTime = Date.now();
      this.sessionData.isActive = true;
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.sessionData.isActive) {
        const now = Date.now();
        const activeMsSinceStart = this.sessionData.totalActiveTime + 
          (now - this.sessionData.lastActiveTime);
        
        this.sendMessage('ACTIVITY_PING', {
          sessionId: this.sessionData.sessionId,
          activeMsSinceStart: activeMsSinceStart,
          counters: this.sessionData.counters,
          timestamp: now
        });
      }
    }, 30000); // 30 second heartbeat
  }

  handlePageUnload() {
    this.endSession();
  }

  endSession() {
    const now = Date.now();
    
    if (this.sessionData.isActive) {
      this.sessionData.totalActiveTime += now - this.sessionData.lastActiveTime;
    }
    
    this.sessionData.endTime = now;
    this.sessionData.totalWallClockTime = now - this.sessionData.startTime;
    
    this.sendMessage('SESSION_END', {
      sessionId: this.sessionData.sessionId,
      totalActiveMs: this.sessionData.totalActiveTime,
      totalWallTime: this.sessionData.totalWallClockTime,
      finalVerdict: this.sessionData.finalVerdict,
      counters: this.sessionData.counters,
      timestamp: now
    });
    
    // Cleanup
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  sendMessage(type, data) {
    try {
      chrome.runtime.sendMessage({
        type: type,
        data: data
      });
      console.log('Session Event:', type, data);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  // Legacy method for backward compatibility
  sendToBackend(eventType, data) {
    this.sendMessage('BACKEND_EVENT', {
      eventType: eventType,
      data: data
    });
  }
}

// Initialize session tracker when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SessionTracker();
  });
} else {
  new SessionTracker();
}
