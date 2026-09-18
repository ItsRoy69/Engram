// ── Element Refs ──────────────────────────────────────────────────────────────
const apiInput      = document.getElementById("api-base");
const tokenInput    = document.getElementById("api-token");
const refreshInput  = document.getElementById("refresh-token");
const toggle        = document.getElementById("enabled-toggle");
const saveBtn       = document.getElementById("save-btn");
const saveMsg       = document.getElementById("save-msg");
const statusDot     = document.getElementById("status-dot");
const statusText    = document.getElementById("status-text");
const memoryCount   = document.getElementById("memory-count");
const testBtn       = document.getElementById("test-btn");

const loginBtn      = document.getElementById("login-btn");
const logoutBtn     = document.getElementById("logout-btn");
const loginEmail    = document.getElementById("login-email");
const loginPass     = document.getElementById("login-password");
const loginUsername = document.getElementById("login-username");
const loginMsg      = document.getElementById("login-msg");
const toggleAuthMode = document.getElementById("toggle-auth-mode");
const signupWrap    = document.getElementById("signup-username-wrap");
const authFormLabel = document.getElementById("auth-form-label");

const authSignedIn  = document.getElementById("auth-signed-in");
const authSignedOut = document.getElementById("auth-signed-out");
const userAvatar    = document.getElementById("user-avatar");
const userName      = document.getElementById("user-name");
const userEmail     = document.getElementById("user-email");

const stashBtn      = document.getElementById("stash-btn");
const stashText     = document.getElementById("stash-text");
const stashTags     = document.getElementById("stash-tags");
const stashMsg      = document.getElementById("stash-msg");
const captureTabBtn = document.getElementById("capture-tab-btn");

const openChatBtn   = document.getElementById("open-chat-btn");
const footerLink    = document.getElementById("footer-chat-link");

// ── Tab Navigation ────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ── Storage Defaults ──────────────────────────────────────────────────────────
const SYNC_DEFAULTS = {
  apiBase:      "http://localhost:8000",
  apiToken:     "",
  refreshToken: "",
  enabled:      true,
  userId:       "",
  email:        "",
  username:     "",
};

function getSync() {
  return new Promise((resolve) => chrome.storage.sync.get(SYNC_DEFAULTS, resolve));
}

function setSync(patch) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(SYNC_DEFAULTS, (existing) => {
      chrome.storage.sync.set({ ...existing, ...patch }, resolve);
    });
  });
}

function baseUrl() {
  return (apiInput.value.trim() || SYNC_DEFAULTS.apiBase).replace(/\/$/, "");
}

// ── Feedback Helpers ──────────────────────────────────────────────────────────
function setMsg(el, text, type = "success") {
  el.textContent = text;
  el.className = `feedback-msg ${type}`;
  if (text) setTimeout(() => { el.textContent = ""; }, 3500);
}

// ── Auth UI ───────────────────────────────────────────────────────────────────
function updateAuthUI(cfg) {
  const loggedIn = !!cfg.apiToken;
  if (loggedIn) {
    authSignedIn.style.display  = "";
    authSignedOut.style.display = "none";
    const displayName = cfg.username || cfg.email || "User";
    const letter = displayName[0]?.toUpperCase() ?? "U";
    userAvatar.textContent = letter;
    userName.textContent   = cfg.username || "Engram User";
    userEmail.textContent  = cfg.email || "";
    if (loginEmail) loginEmail.value = cfg.email || "";
  } else {
    authSignedIn.style.display  = "none";
    authSignedOut.style.display = "";
  }
}

let authMode = "signin";

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  if (signupWrap) signupWrap.style.display = signup ? "" : "none";
  if (authFormLabel) authFormLabel.textContent = signup ? "Create an Engram account" : "Sign in to Engram";
  if (loginBtn) loginBtn.textContent = signup ? "Create account →" : "Sign in to sync memories →";
  if (toggleAuthMode) toggleAuthMode.textContent = signup ? "Already have an account? Sign in" : "Create an account";
}

// ── Sign In / Register ────────────────────────────────────────────────────────
async function login() {
  const email = loginEmail.value.trim();
  const pass  = loginPass.value;
  const username = (loginUsername?.value || "").trim();
  if (!email || !pass) {
    setMsg(loginMsg, "Enter email and password", "error");
    return;
  }
  if (authMode === "signup" && username.length < 3) {
    setMsg(loginMsg, "Username must be at least 3 characters", "error");
    return;
  }
  if (authMode === "signup" && pass.length < 8) {
    setMsg(loginMsg, "Password must be at least 8 characters", "error");
    return;
  }
  loginBtn.disabled = true;
  setMsg(loginMsg, authMode === "signup" ? "Creating account…" : "Signing in…", "info");
  try {
    const path = authMode === "signup" ? "/auth/register" : "/auth/login";
    const body = authMode === "signup"
      ? { email, username, password: pass }
      : { email, password: pass };
    const resp = await fetch(`${baseUrl()}${path}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    if (!resp.ok) {
      const payload = await resp.json().catch(() => null);
      throw new Error(payload?.detail || payload?.error || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    await setSync({
      apiToken:     data.access_token,
      refreshToken: data.refresh_token,
      userId:       data.user_id,
      email:        data.email,
      username:     data.username,
    });
    loginPass.value = "";
    updateAuthUI({ apiToken: data.access_token, email: data.email, username: data.username });
    setMsg(loginMsg, `Signed in as ${data.email}`, "success");
    checkHealth(baseUrl());
  } catch (e) {
    setMsg(loginMsg, `${authMode === "signup" ? "Sign-up" : "Sign-in"} failed: ${e.message}`, "error");
  } finally {
    loginBtn.disabled = false;
  }
}

// ── Sign Out ──────────────────────────────────────────────────────────────────
async function logout() {
  const cfg = await getSync();
  if (cfg.refreshToken) {
    try {
      await fetch(`${cfg.apiBase.replace(/\/$/, "")}/auth/logout`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ refresh_token: cfg.refreshToken }),
      });
    } catch {}
  }
  await setSync({ apiToken: "", refreshToken: "", userId: "", email: "", username: "" });
  updateAuthUI({ apiToken: "" });
}

// ── Health Check ──────────────────────────────────────────────────────────────
async function checkHealth(base) {
  const authed = (tokenInput.value || "").trim() !== "";
  try {
    const resp = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3500) });
    if (resp.ok) {
      const data  = await resp.json();
      const graph = (data && data.graph) || {};
      const n     = typeof graph.nodes === "number" ? graph.nodes : null;

      if (n !== null) {
        memoryCount.textContent = `Memories: ${n}`;
        memoryCount.style.color = "#818cf8";
      } else {
        memoryCount.textContent = "Memories: —";
        memoryCount.style.color = "#6b7280";
      }

      statusDot.className    = authed ? "dot online" : "dot degraded";
      statusText.textContent = authed ? "Graph online" : "API online — sign in";
    } else {
      throw new Error("non-ok");
    }
  } catch {
    statusDot.className     = "dot offline";
    statusText.textContent  = "API offline";
    memoryCount.textContent = "Memories: —";
    memoryCount.style.color = "#6b7280";
  }
}

// ── Quick Stash (save memory directly from popup) ─────────────────────────────
async function stashMemory() {
  const content = stashText.value.trim();
  if (!content) {
    setMsg(stashMsg, "Please write something to remember", "error");
    return;
  }
  stashBtn.disabled = true;
  stashBtn.textContent = "Indexing fact…";
  setMsg(stashMsg, "", "info");

  const cfg = await getSync();
  if (!cfg.apiToken) {
    setMsg(stashMsg, "Sign in first (Overview tab)", "error");
    stashBtn.disabled = false;
    stashBtn.textContent = "Save Fact to Graph";
    return;
  }

  const tags = stashTags.value
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);

  try {
    const resp = await fetch(`${cfg.apiBase.replace(/\/$/, "")}/memory/store`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${cfg.apiToken}`,
      },
      body: JSON.stringify({ content, tags }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      const payload = await resp.json().catch(() => null);
      throw new Error(payload?.detail || payload?.error || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    stashText.value = "";
    stashTags.value = "";
    setMsg(stashMsg, `Saved — ${data.stored ?? 1} fact(s) indexed`, "success");
    checkHealth(cfg.apiBase);
  } catch (e) {
    setMsg(stashMsg, `Error: ${e.message}`, "error");
  } finally {
    stashBtn.disabled    = false;
    stashBtn.textContent = "Save Fact to Graph";
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
getSync().then((cfg) => {
  apiInput.value      = cfg.apiBase;
  tokenInput.value    = cfg.apiToken;
  refreshInput.value  = cfg.refreshToken;
  toggle.checked      = cfg.enabled;
  updateAuthUI(cfg);
  checkHealth(cfg.apiBase);
});

// ── Event Listeners ───────────────────────────────────────────────────────────
saveBtn.addEventListener("click", () => {
  getSync().then((existing) => {
    const cfg = {
      apiBase:      baseUrl(),
      apiToken:     tokenInput.value.trim()   || existing.apiToken,
      refreshToken: refreshInput.value.trim() || existing.refreshToken,
      enabled:      toggle.checked,
    };
    setSync(cfg).then(() => {
      setMsg(saveMsg, "Settings saved ✓", "success");
      checkHealth(cfg.apiBase);
    });
  });
});

apiInput.addEventListener("change", () => checkHealth(baseUrl()));

loginBtn.addEventListener("click", login);
loginPass.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
toggleAuthMode?.addEventListener("click", () => {
  setAuthMode(authMode === "signin" ? "signup" : "signin");
  setMsg(loginMsg, "", "info");
});

toggle.addEventListener("change", () => {
  setSync({ enabled: toggle.checked });
});

logoutBtn.addEventListener("click", logout);

testBtn.addEventListener("click", () => checkHealth(baseUrl()));

stashBtn.addEventListener("click", stashMemory);
stashText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) stashMemory();
});

captureTabBtn?.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const t = tabs[0];
    if (!t) return;
    const snippet = [t.title, t.url].filter(Boolean).join("\n");
    stashText.value = stashText.value ? `${stashText.value.trim()}\n${snippet}` : snippet;
  });
});

// Open chat UI
function openChatUI() {
  getSync().then((cfg) => {
    const base = cfg.apiBase.replace(/:8000\/?$/, ":3000");
    chrome.tabs.create({ url: base });
  });
}

openChatBtn.addEventListener("click", openChatUI);
footerLink.addEventListener("click", openChatUI);

// Sync when another tab saves
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.apiToken)     tokenInput.value   = changes.apiToken.newValue   || "";
  if (changes.refreshToken) refreshInput.value = changes.refreshToken.newValue || "";
  getSync().then(updateAuthUI);
});
