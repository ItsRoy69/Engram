(function () {
  "use strict";

  const VERSION = "v3 (relay + direct fallback)";
  console.log("[Engram]", VERSION, "loaded on", location.hostname);

  const SITE = window.location.hostname.includes("claude.ai")
    ? "claude"
    : window.location.hostname.includes("chatgpt.com")
      ? "chatgpt"
      : "chatui";

  if (SITE === "chatui") {
    startChatUiTokenSync();
    return;
  }

  const ENGRA_MEMORY_RE = /\[Engram memories\][\s\S]*?\[End of memories\]\n\n/;

  const SELECTORS = {
    claude: {
      input: [
        '[data-testid="chat-input"]',
        'div[contenteditable="true"]',
      ],
      sendBtn: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send Message"]',
      ],
      response: [
        '[data-testid="chat-message-content"]',
        '.font-claude-message',
      ],
      humanTurn: ['[data-testid="human-turn"]'],
    },
    chatgpt: {
      input: [
        'textarea#prompt-textarea',
        'div#prompt-textarea[contenteditable="true"]',
        'div[contenteditable="true"][data-id="root"]',
        'div[role="textbox"][contenteditable="true"]',
        'textarea[placeholder*="Message ChatGPT"]',
        'form div[contenteditable="true"]',
      ],
      sendBtn: [
        '#composer-submit-button',
        'button[data-testid="send-button"]',
        'button[aria-label*="Send prompt"]',
      ],
      response: [
        '[data-message-author-role="assistant"] .markdown',
        '[data-message-author-role="assistant"]',
      ],
      humanTurn: ['[data-message-author-role="user"]'],
    },
  };

  const sel = SELECTORS[SITE];

  let lastInjectedMemoryBlock = null;
  let isInjecting = false;
  let sendInProgress = false;
  let lastStoredTurn = "";

  function queryOne(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function queryAllFirst(selectors) {
    for (const s of selectors) {
      const els = document.querySelectorAll(s);
      if (els.length) return els;
    }
    return null;
  }

  function getInputEl() {
    return queryOne(sel.input);
  }

  function getSendBtn() {
    return queryOne(sel.sendBtn);
  }

  function getInputText(el) {
    if (!el) return "";
    return el.value !== undefined ? el.value : el.innerText || el.textContent || "";
  }

  function setInputText(el, text) {
    if (!el) return;
    if (el.value !== undefined || el.tagName === "TEXTAREA") {
      const proto = el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, text);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
  }

  const DEFAULTS = { apiBase: "http://localhost:8000", apiToken: "", refreshToken: "", enabled: true };

  function getConfig() {
    return new Promise((resolve) => {
      try {
        if (!chrome.storage?.sync) {
          resolve(DEFAULTS);
          return;
        }
        chrome.storage.sync.get(DEFAULTS, resolve);
      } catch {
        resolve(DEFAULTS);
      }
    });
  }

  function sendMessage(type, payload) {
    return new Promise((resolve) => {
      try {
        if (!chrome.runtime?.sendMessage) {
          resolve(null);
          return;
        }
        chrome.runtime.sendMessage({ type, ...payload }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn("[Engram] messaging failed:", chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch {
        resolve(null);
      }
    });
  }

  function startChatUiTokenSync() {
    const ACCESS_KEY  = "engram_token";
    const REFRESH_KEY = "engram_refresh_token";
    const USER_KEY    = "engram_user";
    let lastToken   = null;
    let lastRefresh = null;

    function readToken(key) {
      try {
        return localStorage.getItem(key) || "";
      } catch (e) {
        return null;
      }
    }

    function syncNow() {
      const token   = readToken(ACCESS_KEY);
      const refresh = readToken(REFRESH_KEY);
      if (!token) return;

      if (token === lastToken && refresh === lastRefresh) return;
      lastToken   = token;
      lastRefresh = refresh;

      let userId = "";
      const rawUser = readToken(USER_KEY);
      if (rawUser) {
        try { userId = JSON.parse(rawUser).user_id || ""; } catch { userId = ""; }
      }

      sendMessage("SYNC_TOKENS", { apiToken: token, refreshToken: refresh, userId })
        .then((resp) => {
          if (resp && resp.ok) console.log("[Engram] Tokens synced from chat-ui login");
        });
    }

    console.log("[Engram] Token auto-sync active on", location.hostname);
    syncNow();
    setInterval(syncNow, 2000);
  }

  async function postEngram(path, body, cfg) {
    const getToken = async () => {
      const resp = await sendMessage("GET_TOKEN", {});
      return resp && resp.ok && resp.token ? resp.token : cfg.apiToken || "";
    };

    let token = await getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const doFetch = () =>
      fetch(`${cfg.apiBase}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

    let resp = await doFetch();

    if (resp.status === 401 && token) {
      const fresh = await getToken();
      if (fresh && fresh !== token) {
        token = fresh;
        headers["Authorization"] = `Bearer ${token}`;
        resp = await doFetch();
      }
    }

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  async function recallMemories(query) {
    const cfg = await getConfig();
    if (!cfg.enabled) return null;

    const relayed = await sendMessage("RECALL", { query });
    if (relayed && relayed.ok && relayed.data) return relayed.data;

    try {
      return await postEngram("/memory/recall", { query }, cfg);
    } catch (e) {
      console.error("[Engram] recall failed:", e.message);
      return null;
    }
  }

  async function storeMemory(content) {
    const cfg = await getConfig();
    if (!cfg.enabled) return null;

    const relayed = await sendMessage("STORE", { content });
    if (relayed && relayed.ok && relayed.data) return relayed.data;

    try {
      return await postEngram("/memory/store", { content }, cfg);
    } catch (e) {
      console.error("[Engram] store failed:", e.message);
      return null;
    }
  }

  function formatMemoryBlock(memories) {
    if (!memories || memories.length === 0) return "";
    const lines = memories.map((m, i) => `${i + 1}. ${m.content}`).join("\n");
    return `[Engram memories]\n${lines}\n[End of memories]\n\n`;
  }

  function showIndicator(text) {
    let el = document.getElementById("engram-indicator");
    if (!el) {
      el = document.createElement("div");
      el.id = "engram-indicator";
      el.style.cssText = [
        "position:fixed", "bottom:80px", "right:20px",
        "background:#1a1a2e", "color:#e0e0ff", "padding:8px 14px",
        "border-radius:8px", "font-size:13px", "font-family:system-ui",
        "z-index:99999", "box-shadow:0 2px 12px rgba(0,0,0,0.4)",
        "border:1px solid #3a3a6e", "transition:opacity 0.3s",
        "pointer-events:none"
      ].join(";");
      document.body.appendChild(el);
    }
    el.textContent = "🧠 " + text;
    el.style.opacity = "1";
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.opacity = "0"; }, 3000);
  }

  async function injectMemories(inputEl) {
    if (isInjecting) return;
    const raw = getInputText(inputEl).trim();
    const cleanQuery = raw.replace(ENGRA_MEMORY_RE, "").trim();
    if (!cleanQuery) return;

    isInjecting = true;
    showIndicator("Recalling memories…");

    try {
      const response = await recallMemories(cleanQuery);
      if (!response) {
        showIndicator("Engram offline");
        return;
      }

      const memories = response.memories || [];
      if (memories.length === 0) {
        showIndicator("No relevant memories");
        return;
      }

      const memoryBlock = formatMemoryBlock(memories);
      lastInjectedMemoryBlock = memoryBlock;
      setInputText(inputEl, memoryBlock + cleanQuery);
      showIndicator(`${memories.length} memor${memories.length === 1 ? "y" : "ies"} injected`);
    } catch (e) {
      console.error("[Engram] inject error:", e);
      showIndicator("Engram error");
    } finally {
      isInjecting = false;
    }
  }

  function realSend() {
    sendInProgress = true;
    const inputEl = getInputEl();
    setTimeout(() => {
      const btn = getSendBtn();
      if (btn && !btn.disabled) {
        btn.click();
      } else if (inputEl) {
        inputEl.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13,
          bubbles: true, cancelable: true
        }));
      }
    }, 80);
    setTimeout(() => { sendInProgress = false; }, 1500);
  }

  function interceptSubmit(e) {
    if (sendInProgress || isInjecting) return;
    const inputEl = getInputEl();
    if (!inputEl) return;

    const text = getInputText(inputEl).trim();
    if (!text) return;

    if (ENGRA_MEMORY_RE.test(text)) return;

    const isEnter = e.type === "keydown" && e.key === "Enter" && !e.shiftKey;
    const isClick = e.type === "click";
    if (!isEnter && !isClick) return;

    e.preventDefault();
    e.stopPropagation();

    injectMemories(inputEl).then(() => realSend());
  }

  async function storeConversationTurn() {
    const humanTurns = queryAllFirst(sel.humanTurn);
    const aiResponses = queryAllFirst(sel.response);

    if (!humanTurns || !aiResponses) return;

    const lastHuman = humanTurns[humanTurns.length - 1];
    const lastAI = aiResponses[aiResponses.length - 1];

    let humanText = (lastHuman.innerText || lastHuman.textContent || "").trim();
    humanText = humanText.replace(ENGRA_MEMORY_RE, "").trim();
    const aiText = (lastAI.innerText || lastAI.textContent || "").trim();

    if (!humanText || !aiText) return;

    const turnContent = `User said: ${humanText}\nAssistant responded: ${aiText}`;

    if (turnContent === lastStoredTurn) return;
    lastStoredTurn = turnContent;

    const response = await storeMemory(turnContent);
    if (response) {
      const stored = response.stored || 0;
      if (stored > 0) {
        showIndicator(`${stored} fact${stored === 1 ? "" : "s"} remembered`);
      }
    }
  }

  let storeTimer = null;

  function watchForResponses() {
    const observer = new MutationObserver(() => {
      clearTimeout(storeTimer);
      storeTimer = setTimeout(storeConversationTurn, 2000);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function bindEvents() {
    const inputEl = getInputEl();
    if (!inputEl) return false;

    inputEl.addEventListener("keydown", interceptSubmit, true);

    const sendBtn = getSendBtn();
    if (sendBtn) {
      sendBtn.addEventListener("click", interceptSubmit, true);
    }

    return true;
  }

  function tryBind(attempts = 0) {
    if (bindEvents()) {
      console.log("[Engram] Attached to", SITE);
      if (!window.__engramReadyShown) {
        window.__engramReadyShown = true;
        showIndicator("Engram ready");
      }
      return;
    }
    if (attempts < 40) {
      setTimeout(() => tryBind(attempts + 1), 500);
    } else {
      console.warn("[Engram] Could not find the input box on", SITE);
    }
  }

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => tryBind(), 500);
    }
  }).observe(document, { subtree: true, childList: true });

  tryBind();
  watchForResponses();

})();
