const DEFAULTS = {
  backendUrl: "http://localhost:8082",
  apiKey: "",
  userId: "user123",
  idleMs: 60000,
  heartbeatMs: 30000
};

const els = {
  backendUrl: document.getElementById("backendUrl"),
  apiKey: document.getElementById("apiKey"),
  userId: document.getElementById("userId"),
  idleMs: document.getElementById("idleMs"),
  heartbeatMs: document.getElementById("heartbeatMs"),
  save: document.getElementById("save"),
  test: document.getElementById("test"),
  status: document.getElementById("status")
};

function setStatus(msg, ok = true) {
  els.status.textContent = msg;
  els.status.className = `hint ${ok ? "ok" : "err"}`;
}

function clearStatusSoon(ms = 2000) {
  setTimeout(() => setStatus(""), ms);
}

function load() {
  chrome.storage.sync.get(DEFAULTS, (cfg) => {
    els.backendUrl.value = cfg.backendUrl || DEFAULTS.backendUrl;
    els.apiKey.value = cfg.apiKey || DEFAULTS.apiKey;
    els.userId.value = cfg.userId || DEFAULTS.userId;
    els.idleMs.value = Number.isFinite(cfg.idleMs) ? cfg.idleMs : DEFAULTS.idleMs;
    els.heartbeatMs.value = Number.isFinite(cfg.heartbeatMs) ? cfg.heartbeatMs : DEFAULTS.heartbeatMs;
  });
}

function save() {
  const cfg = {
    backendUrl: (els.backendUrl.value || DEFAULTS.backendUrl).replace(/\/+$/, ""),
    apiKey: els.apiKey.value || "",
    userId: els.userId.value || DEFAULTS.userId,
    idleMs: Number(els.idleMs.value) || DEFAULTS.idleMs,
    heartbeatMs: Number(els.heartbeatMs.value) || DEFAULTS.heartbeatMs
  };
  chrome.storage.sync.set(cfg, () => {
    // Notify background to refresh live config
    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", settings: cfg });
    setStatus("Saved.", true);
    clearStatusSoon();
  });
}

async function testBackend() {
  const base = (els.backendUrl.value || DEFAULTS.backendUrl).replace(/\/+$/, "");
  try {
    const r = await fetch(`${base}/api/v1/problems/health`, { method: "GET" });
    if (!r.ok) {
      setStatus(`Health check failed: HTTP ${r.status}`, false);
      clearStatusSoon();
      return;
    }
    setStatus("Backend reachable.", true);
  } catch (e) {
    setStatus(`Cannot reach backend: ${e.message}`, false);
  }
  clearStatusSoon();
}

els.save.addEventListener("click", save);
els.test.addEventListener("click", testBackend);
document.addEventListener("DOMContentLoaded", load);
