// Content script: detect problem metadata + user actions and notify background
// Keep this script UI-light; the background owns session state and timers.
console.log("[content] injected:", location.href)
(() => {
  // ---------------- Context + safe messaging ----------------
  let ctxAlive = true;

  function markDead() {
    ctxAlive = false;
  }

  function safeSend(type, data) {
    if (!ctxAlive) return;
    try {
      chrome.runtime.sendMessage({ type, data });
    } catch (_) {
      // Swallow to prevent "Extension context invalidated" noise
    }
  }

  // ---------------- Utilities ----------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const getPlatform = (host) => {
    if (!host) return "unknown";
    if (host.includes("leetcode.com")) return "leetcode";
    if (host.includes("geeksforgeeks.org")) return "geeksforgeeks";
    if (host.includes("hackerrank.com")) return "hackerrank";
    return "unknown";
  };

  function isProblemUrl(href) {
    return (
      /leetcode\.com\/problems\//.test(href) ||
      /geeksforgeeks\.org\/problems\//.test(href) ||
      /hackerrank\.com\/challenges\//.test(href)
    );
  }

  const platform = getPlatform(location.hostname);

  // Robust title readers per platform (with multiple fallbacks)
  const readers = {
    leetcode() {
      const sels = [
        'div[data-cy="question-title"] h1',
        'h1[data-cy="question-title"]',
        "h1",
        ".mr-2.text-label-1",
      ];
      for (const sel of sels) {
        const el = document.querySelector(sel);
        const t = el?.textContent?.trim();
        if (t) return t;
      }
      const dt = document.title?.replace(/ - LeetCode.*$/, "")?.trim();
      return dt || null;
    },
    geeksforgeeks() {
      const el = document.querySelector("h1.entry-title") || document.querySelector("h1");
      return el?.textContent?.trim() || document.title?.trim() || null;
    },
    hackerrank() {
      const el =
        document.querySelector('[data-attr1="challenge-name"]') ||
        document.querySelector(".ui-content-title") ||
        document.querySelector("h1");
      return el?.textContent?.trim() || document.title?.trim() || null;
    },
    unknown() {
      return document.title?.trim() || null;
    },
  };

  async function getProblemTitleWithRetry(maxTries = 25, delayMs = 200) {
    const reader = readers[platform] || readers.unknown;
    for (let i = 0; i < maxTries; i++) {
      if (!ctxAlive) return null;
      const t = reader();
      if (t && t.length > 0) return t;
      await sleep(delayMs);
    }
    return null;
  }

  function getProblemUrl() {
    return location.href;
  }

  // ---------------- Session bootstrap ----------------
  async function startSession() {
    const url = getProblemUrl();

    // Quick, optimistic start so background can run /detect immediately
    safeSend("SESSION_START", {
      platform,
      problemTitle: "(loading...)",
      problemUrl: url,
      timestamp: Date.now(),
    });

    // Upgrade with the real title when ready
    const title = await getProblemTitleWithRetry();
    if (title && ctxAlive) {
      safeSend("SESSION_START", {
        platform,
        problemTitle: title,
        problemUrl: url,
        timestamp: Date.now(),
      });
    }
  }

  // ---------------- Focus / visibility ----------------
  function setupFocusVisibility() {
    const notify = (focused) =>
      safeSend("FOCUS_CHANGE", { focused: !!focused, timestamp: Date.now() });

    const onFocus = () => notify(true);
    const onBlur = () => notify(false);
    const onVis = () => notify(!document.hidden);

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }

  // ---------------- User activity ----------------
  function setupActivity() {
    const ping = () => safeSend("ACTIVITY_PING", { timestamp: Date.now() });

    const onKey = (e) => ping(e);
    const onMouse = (e) => ping(e);
    const onTouch = (e) => ping(e);

    let lastMove = 0;
    const onMove = () => {
      const now = Date.now();
      if (now - lastMove > 2000) {
        lastMove = now;
        ping();
      }
    };
    const onScroll = onMove;

    document.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("mousedown", onMouse, { capture: true });
    document.addEventListener("touchstart", onTouch, { capture: true });
    document.addEventListener("mousemove", onMove, { capture: true });
    document.addEventListener("scroll", onScroll, { capture: true });

    return () => {
      document.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("mousedown", onMouse, { capture: true });
      document.removeEventListener("touchstart", onTouch, { capture: true });
      document.removeEventListener("mousemove", onMove, { capture: true });
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }

  // ---------------- Buttons and verdicts ----------------
  function findButtonByText(texts) {
    const btns = Array.from(document.querySelectorAll("button, a"));
    return btns.find((b) => {
      const t = (b.textContent || "").trim().toLowerCase();
      return texts.some((x) => t === x.toLowerCase());
    });
  }

  function attachOnce(el, event, handler) {
    if (!el) return;
    const key = `__pd_${event}_attached`;
    if (el[key]) return;
    el[key] = true;
    el.addEventListener(event, handler, true);
  }

  function setupRunSubmitHooks() {
    // Site-specific first
    const leetRun = document.querySelector('button[data-e2e-locator="console-run-button"]');
    const leetSubmit = document.querySelector('button[data-e2e-locator="console-submit-button"]');

    // Generic fallbacks
    const genericRun = findButtonByText(["Run", "Run Code"]);
    const genericSubmit = findButtonByText(["Submit", "Submit Code", "Run & Submit", "Judge"]);

    attachOnce(leetRun || genericRun, "click", () => {
      safeSend("RUN_CLICKED", { timestamp: Date.now() });
    });
    attachOnce(leetSubmit || genericSubmit, "click", () => {
      safeSend("SUBMIT_CLICKED", { timestamp: Date.now() });
    });
  }

  function scanVerdictOnce(root) {
    const verdicts = [
      "Accepted",
      "Wrong Answer",
      "Runtime Error",
      "Time Limit Exceeded",
      "Compilation Error",
      "Memory Limit Exceeded",
    ];
    const nodes = root
      ? Array.from(root.querySelectorAll("*"))
      : Array.from(document.querySelectorAll("*"));
    for (const n of nodes) {
      const txt = n.textContent || "";
      const hit = verdicts.find((v) => txt.includes(v));
      if (hit) {
        safeSend("VERDICT_DETECTED", { verdict: hit, timestamp: Date.now() });
        return true;
      }
    }
    return false;
  }

  function setupMutationObserver() {
    const obs = new MutationObserver((mutations) => {
      if (!ctxAlive) return;
      // Reattach in case buttons appear late
      setupRunSubmitHooks();
      // Scan for verdict text in newly added nodes
      for (const m of mutations) {
        for (const node of m.addedNodes || []) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (scanVerdictOnce(node)) return;
          }
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    return () => {
      try {
        obs.disconnect();
      } catch (_) {}
    };
  }

  // ---------------- Command channel (debug) ----------------
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "FORCE_SESSION_START") {
      const reader = readers[platform] || readers.unknown;
      const title = reader() || document.title || "(unknown)";
      safeSend("SESSION_START", {
        platform,
        problemTitle: title,
        problemUrl: location.href,
        timestamp: Date.now(),
      });
    }
  });

  // ---------------- Cleanup and SPA handling ----------------
  let cleanups = [];
  let urlPoll = null;

  function cleanup() {
    markDead();
    for (const fn of cleanups) {
      try {
        fn && fn();
      } catch (_) {}
    }
    cleanups = [];
    if (urlPoll) {
      clearInterval(urlPoll);
      urlPoll = null;
    }
    window.removeEventListener("beforeunload", onUnload);
  }

  function onUnload() {
    cleanup();
  }

  function setupSpaWatcher() {
    let lastUrl = location.href;
    urlPoll = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        cleanup();
        // Give DOM a moment to mount
        setTimeout(() => {
          try {
            bootstrap();
          } catch (_) {}
        }, 200);
      }
    }, 500);
    return () => {
      if (urlPoll) {
        clearInterval(urlPoll);
        urlPoll = null;
      }
    };
  }

  // ---------------- Bootstrap ----------------
  async function bootstrap() {
    // Each bootstrap is a fresh context
    ctxAlive = true;

    if (!isProblemUrl(location.href)) {
      // Not a problem page: keep SPA watcher to catch future navigations
      const stopSpa = setupSpaWatcher();
      cleanups.push(stopSpa);
      window.addEventListener("beforeunload", onUnload);
      return;
    }

    // Start session + hooks
    await startSession();

    const stopFocus = setupFocusVisibility();
    const stopActivity = setupActivity();
    const stopObs = setupMutationObserver();
    const stopSpa = setupSpaWatcher();

    cleanups.push(stopFocus, stopActivity, stopObs, stopSpa);
    window.addEventListener("beforeunload", onUnload);

    // One immediate verdict scan if page already shows results
    scanVerdictOnce(document);
    // Buttons that appear immediately
    setupRunSubmitHooks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
