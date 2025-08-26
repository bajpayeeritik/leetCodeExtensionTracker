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
      events: []
    };
    
    this.idleTimeout = null;
    this.idleThreshold = 30000; // 30 seconds
    this.heartbeatInterval = null;
    this.lastUserActivity = Date.now();
    
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

  init() {
    this.setupEventListeners();
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
    
    // Code editor changes (platform-specific)
    this.setupPlatformSpecificListeners();
    
    // Navigation events
    window.addEventListener('beforeunload', this.handlePageUnload.bind(this));
    
    // Mutation observer for dynamic content
    this.setupMutationObserver();
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
    // Monitor code editor changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          const codeEditor = document.querySelector('.monaco-editor');
          if (codeEditor) {
            this.trackCodeEdit();
          }
        }
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Monitor submit button clicks
    document.addEventListener('click', (e) => {
      if (e.target.textContent === 'Submit' || e.target.textContent === 'Run') {
        this.trackSubmission(e.target.textContent);
      }
    });
  }

  setupGFGListeners() {
    // Monitor code editor changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          const codeEditor = document.querySelector('.CodeMirror');
          if (codeEditor) {
            this.trackCodeEdit();
          }
        }
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Monitor submit button clicks
    document.addEventListener('click', (e) => {
      if (e.target.textContent === 'Submit' || e.target.textContent === 'Run') {
        this.trackSubmission(e.target.textContent);
      }
    });
  }

  setupHackerRankListeners() {
    // Monitor code editor changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          const codeEditor = document.querySelector('.monaco-editor');
          if (codeEditor) {
            this.trackCodeEdit();
          }
        }
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Monitor submit button clicks
    document.addEventListener('click', (e) => {
      if (e.target.textContent === 'Submit' || e.target.textContent === 'Run Code') {
        this.trackSubmission(e.target.textContent);
      }
    });
  }

  setupMutationObserver() {
    // Monitor for submission results
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          this.checkForSubmissionResults();
        }
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }

  checkForSubmissionResults() {
    // Check for success/error messages
    const successElements = document.querySelectorAll('[class*="success"], [class*="accepted"], [class*="correct"]');
    const errorElements = document.querySelectorAll('[class*="error"], [class*="wrong"], [class*="failed"]');
    
    if (successElements.length > 0) {
      this.trackSubmissionResult('accepted');
    } else if (errorElements.length > 0) {
      this.trackSubmissionResult('wrong_answer');
    }
  }

  startSession() {
    this.sessionData.sessionId = this.generateSessionId();
    this.sessionData.startTime = Date.now();
    this.sessionData.lastActiveTime = Date.now();
    this.sessionData.isActive = true;
    
    this.logEvent('ProblemSessionStarted', {
      sessionId: this.sessionData.sessionId,
      platform: this.sessionData.platform,
      problemId: this.sessionData.problemId,
      timestamp: this.sessionData.startTime
    });
    
    this.sendToBackend('ProblemSessionStarted', this.sessionData);
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
  }

  handleWindowBlur() {
    this.pauseSession();
  }

  handleUserActivity() {
    this.lastUserActivity = Date.now();
    
    if (!this.sessionData.isActive) {
      this.resumeSession();
    }
    
    // Reset idle timeout
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }
    
    this.idleTimeout = setTimeout(() => {
      this.pauseSession();
    }, this.idleThreshold);
  }

  pauseSession() {
    if (this.sessionData.isActive) {
      const now = Date.now();
      this.sessionData.totalActiveTime += now - this.sessionData.lastActiveTime;
      this.sessionData.isActive = false;
      
      this.logEvent('SessionPaused', {
        timestamp: now,
        activeTime: this.sessionData.totalActiveTime
      });
    }
  }

  resumeSession() {
    if (!this.sessionData.isActive) {
      this.sessionData.lastActiveTime = Date.now();
      this.sessionData.isActive = true;
      
      this.logEvent('SessionResumed', {
        timestamp: this.sessionData.lastActiveTime
      });
    }
  }

  trackCodeEdit() {
    this.logEvent('CodeEdit', {
      timestamp: Date.now(),
      activeTime: this.sessionData.totalActiveTime
    });
  }

  trackSubmission(action) {
    this.logEvent('CodeSubmission', {
      action: action,
      timestamp: Date.now(),
      activeTime: this.sessionData.totalActiveTime
    });
    
    this.sendToBackend('ProblemSubmitted', {
      sessionId: this.sessionData.sessionId,
      action: action,
      timestamp: Date.now(),
      activeTime: this.sessionData.totalActiveTime
    });
  }

  trackSubmissionResult(result) {
    this.logEvent('SubmissionResult', {
      result: result,
      timestamp: Date.now(),
      activeTime: this.sessionData.totalActiveTime
    });
    
    this.sendToBackend('ProblemProgress', {
      sessionId: this.sessionData.sessionId,
      event: 'submission_result',
      result: result,
      timestamp: Date.now(),
      activeTime: this.sessionData.totalActiveTime
    });
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.sessionData.isActive) {
        this.sendToBackend('ProblemProgress', {
          sessionId: this.sessionData.sessionId,
          event: 'heartbeat',
          timestamp: Date.now(),
          activeTime: this.sessionData.totalActiveTime,
          wallClockTime: Date.now() - this.sessionData.startTime
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
    
    this.logEvent('ProblemSessionEnded', {
      sessionId: this.sessionData.sessionId,
      totalActiveTime: this.sessionData.totalActiveTime,
      totalWallClockTime: this.sessionData.totalWallClockTime,
      timestamp: now
    });
    
    this.sendToBackend('ProblemSessionEnded', {
      sessionId: this.sessionData.sessionId,
      platform: this.sessionData.platform,
      problemId: this.sessionData.problemId,
      startTime: this.sessionData.startTime,
      endTime: this.sessionData.endTime,
      totalActiveTime: this.sessionData.totalActiveTime,
      totalWallClockTime: this.sessionData.totalWallClockTime,
      events: this.sessionData.events
    });
    
    // Cleanup
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }
  }

  logEvent(eventType, data) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      data: data
    };
    
    this.sessionData.events.push(event);
    console.log('Session Event:', event);
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  sendToBackend(eventType, data) {
    // Send to background script for backend communication
    chrome.runtime.sendMessage({
      type: 'BACKEND_EVENT',
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
