const apiInput     = document.getElementById("api-base");
const tokenInput   = document.getElementById("api-token");
const refreshInput = document.getElementById("refresh-token");
const toggle       = document.getElementById("enabled-toggle");
const saveBtn      = document.getElementById("save-btn");
const saveMsg      = document.getElementById("save-msg");
const statusDot    = document.getElementById("status-dot");
const statusText   = document.getElementById("status-text");

const loginBtn     = document.getElementById("login-btn");
const logoutBtn    = document.getElementById("logout-btn");
const loginEmail   = document.getElementById("login-email");
const loginPass    = document.getElementById("login-password");
const loginMsg     = document.getElementById("login-msg");

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

function setLoginMsg(text, color) {
  loginMsg.textContent = text;
  loginMsg.style.color = color || "#40c080";
}

function updateAuthUI(cfg) {
  const loggedIn = !!cfg.apiToken;
  loginBtn.style.display   = loggedIn ? "none" : "";
  logoutBtn.style.display  = loggedIn ? "" : "none";
  loginEmail.disabled      = loggedIn;
  loginPass.disabled       = loggedIn;
  if (loggedIn) loginEmail.value = cfg.email || "";
  setLoginMsg(
    loggedIn ? `Signed in as ${cfg.email || cfg.username || "user"}` : "",
    "#40c080"
  );
}

async function login() {
  const email = loginEmail.value.trim();
  const pass  = loginPass.value;
  if (!email || !pass) {
    setLoginMsg("Enter email and password", "#c04040");
    return;
  }
  loginBtn.disabled = true;
  setLoginMsg("Signing in…", "#6060aa");
  try {
    const resp = await fetch(`${baseUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass }),
    });
    if (!resp.ok) {
      const payload = await resp.json().catch(() => null);
      throw new Error(payload?.detail || (payload && payload.error) || `HTTP ${resp.status}`);
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
    updateAuthUI({ apiToken: data.access_token, email: data.email });
    setLoginMsg(`Signed in as ${data.email}`, "#40c080");
  } catch (e) {
    setLoginMsg(`Sign-in failed: ${e.message}`, "#c04040");
  } finally {
    loginBtn.disabled = false;
  }
}

async function logout() {
  const cfg = await getSync();
  if (cfg.refreshToken) {
    try {
      await fetch(`${cfg.apiBase.replace(/\/$/, "")}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: cfg.refreshToken }),
      });
    } catch {}
  }
  await setSync({
    apiToken: "", refreshToken: "", userId: "", email: "", username: "",
  });
  updateAuthUI({ apiToken: "" });
  setLoginMsg("Signed out", "#6060aa");
}

getSync().then((cfg) => {
  apiInput.value    = cfg.apiBase;
  tokenInput.value  = cfg.apiToken;
  refreshInput.value = cfg.refreshToken;
  toggle.checked    = cfg.enabled;
  updateAuthUI(cfg);
  checkHealth(cfg.apiBase);
});

async function checkHealth(base) {
  try {
    const resp = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      statusDot.className   = "dot online";
      statusText.textContent = "API online";
    } else {
      throw new Error();
    }
  } catch {
    statusDot.className   = "dot offline";
    statusText.textContent = "API offline — is uvicorn running?";
  }
}

saveBtn.addEventListener("click", () => {
  getSync().then((existing) => {
    const cfg = {
      apiBase:      baseUrl(),
      apiToken:     tokenInput.value.trim()   || existing.apiToken,
      refreshToken: refreshInput.value.trim() || existing.refreshToken,
      enabled:      toggle.checked,
    };
    setSync(cfg).then(() => {
      saveMsg.textContent = "Saved ✓";
      setTimeout(() => { saveMsg.textContent = ""; }, 2000);
      checkHealth(cfg.apiBase);
    });
  });
});

apiInput.addEventListener("change", () => checkHealth(baseUrl()));

loginBtn.addEventListener("click", login);
loginPass.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});

logoutBtn.addEventListener("click", logout);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.apiToken)     tokenInput.value   = changes.apiToken.newValue || "";
  if (changes.refreshToken) refreshInput.value = changes.refreshToken.newValue || "";
  if (changes.apiToken)     showSaved();
  getSync().then(updateAuthUI);
});

function showSaved() {
  saveMsg.textContent = "Synced ✓";
  setTimeout(() => { saveMsg.textContent = ""; }, 2000);
}