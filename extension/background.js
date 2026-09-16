const DEFAULT_API = "http://localhost:8000";

let _refreshing = null;

function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { apiBase: DEFAULT_API, apiToken: "", refreshToken: "", enabled: true },
      resolve
    );
  });
}

function saveConfig(cfg) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(cfg, resolve);
  });
}

function decodeJwtPayload(token) {
  try {
    const [, body] = token.split(".");
    if (!body) return null;
    const pad = 4 - (body.length % 4);
    const b64 = (body + "=".repeat(pad === 4 ? 0 : pad)).replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function tokenNearExpiry(token, graceSeconds = 60) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;
  return payload.exp - (Date.now() / 1000) < graceSeconds;
}

async function doRefresh(cfg) {
  try {
    const resp = await fetch(`${cfg.apiBase}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: cfg.refreshToken }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.access_token) return null;
    const updated = { ...cfg, apiToken: data.access_token };
    await saveConfig(updated);
    console.log("[Engram] Access token refreshed");
    return updated;
  } catch (e) {
    console.error("[Engram] token refresh failed:", e.message);
    return null;
  }
}

function refreshAccessToken(cfg) {
  if (!_refreshing) {
    _refreshing = doRefresh(cfg).finally(() => { _refreshing = null; });
  }
  return _refreshing;
}

async function ensureAccessToken() {
  const cfg = await getConfig();
  if (!cfg.apiToken || !cfg.refreshToken) return cfg;
  if (tokenNearExpiry(cfg.apiToken)) {
    const refreshed = await refreshAccessToken(cfg);
    if (refreshed) return refreshed;
  }
  return cfg;
}

async function request(path, body) {
  let cfg = await ensureAccessToken();
  if (!cfg.apiToken) throw new Error("No API token configured");

  const doFetch = (token) =>
    fetch(`${cfg.apiBase}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

  let resp = await doFetch(cfg.apiToken);

  if (resp.status === 401 && cfg.refreshToken) {
    const refreshed = await refreshAccessToken(cfg);
    if (refreshed && refreshed.apiToken) {
      cfg = refreshed;
      resp = await doFetch(cfg.apiToken);
    }
  }

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function storeMemory(content) {
  try {
    return await request("/memory/store", { content });
  } catch (e) {
    console.error("[Engram] store failed:", e.message);
    return null;
  }
}

async function recallMemories(query) {
  try {
    return await request("/memory/recall", { query });
  } catch (e) {
    console.error("[Engram] recall failed:", e.message);
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "SYNC_TOKENS") {
      if (message.apiToken) {
        const cfg = await getConfig();
        const updated = {
          ...cfg,
          apiToken: message.apiToken,
          refreshToken: message.refreshToken || cfg.refreshToken,
        };
        if (message.userId) updated.userId = message.userId;
        await saveConfig(updated);
        console.log("[Engram] Tokens synced from chat-ui login");
      }
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "GET_TOKEN") {
      const cfg = await ensureAccessToken();
      sendResponse({ ok: !!cfg.apiToken, token: cfg.apiToken || "" });
      return;
    }

    const { enabled } = await getConfig();

    if (!enabled) {
      sendResponse({ ok: false, reason: "Engram is disabled" });
      return;
    }

    if (message.type === "RECALL") {
      const result = await recallMemories(message.query);
      sendResponse({ ok: !!result, data: result });

    } else if (message.type === "STORE") {
      const result = await storeMemory(message.content);
      sendResponse({ ok: !!result, data: result });

    } else {
      sendResponse({ ok: false, reason: "Unknown message type" });
    }
  })();

  return true;
});