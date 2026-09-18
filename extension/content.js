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
        "position:fixed", "bottom:78px", "right:18px",
        "background:rgba(13,15,23,0.90)",
        "backdrop-filter:blur(12px)",
        "-webkit-backdrop-filter:blur(12px)",
        "color:#a5b4fc",
        "padding:6px 12px 6px 10px",
        "border-radius:20px",
        "font-size:12px",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        "font-weight:500",
        "z-index:99999",
        "box-shadow:0 4px 18px rgba(0,0,0,0.4),0 0 0 1px rgba(99,102,241,0.35)",
        "border:1px solid rgba(99,102,241,0.35)",
        "transition:opacity 0.22s ease",
        "display:flex", "align-items:center", "gap:6px",
        "pointer-events:none"
      ].join(";");
      document.body.appendChild(el);
    }
    el.innerHTML = "⚡ <span>" + text + "</span>";
    el.style.opacity = "1";
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.opacity = "0"; }, 3000);
  }

  async function showMemoryToast(memories) {
  const dup = document.getElementById("engram-toast");
  if (dup) dup.remove();

  const toast = document.createElement("div");
  toast.id = "engram-toast";
  Object.assign(toast.style, {
    position:         "fixed",
    right:            "18px",
    bottom:           "18px",
    zIndex:           "2147483647",
    background:       "rgba(13, 15, 23, 0.92)",
    backdropFilter:   "blur(14px)",
    webkitBackdropFilter: "blur(14px)",
    border:           "1px solid rgba(99, 102, 241, 0.4)",
    borderRadius:     "14px",
    padding:          "10px 14px",
    font:             "13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxShadow:        "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset",
    cursor:           "pointer",
    maxWidth:         "340px",
    opacity:          "0",
    transform:        "translateY(10px)",
    transition:       "opacity 0.22s cubic-bezier(0.16,1,0.3,1), transform 0.22s cubic-bezier(0.16,1,0.3,1)",
    userSelect:       "none",
  });

  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;gap:7px;";

  const iconEl = document.createElement("span");
  iconEl.textContent = "⚡";
  iconEl.style.fontSize = "13px";

  const labelEl = document.createElement("span");
  labelEl.style.cssText = "font-size:12px;font-weight:600;color:#ffffff;";
  labelEl.textContent = `${memories.length} memor${memories.length === 1 ? "y" : "ies"} recalled`;

  const pillEl = document.createElement("span");
  pillEl.style.cssText = "font-size:10px;padding:2px 7px;border-radius:20px;background:rgba(99,102,241,0.18);border:1px solid rgba(99,102,241,0.35);color:#a5b4fc;font-family:monospace;margin-left:auto;";
  pillEl.textContent = "Engram";

  header.appendChild(iconEl);
  header.appendChild(labelEl);
  header.appendChild(pillEl);
  toast.appendChild(header);

  const list = document.createElement("div");
  list.style.cssText = "display:none;margin-top:8px;border-top:1px solid rgba(255,255,255,0.07);padding-top:8px;";

  memories.slice(0, 10).forEach((m) => {
    const v = typeof m === "string" ? m : (m.text || m.content || JSON.stringify(m));
    const row = document.createElement("div");
    row.style.cssText = "font-size:11px;color:#9ca3af;margin-bottom:3px;line-height:1.4;";
    row.textContent = "\u00b7 " + String(v).replace(/\s+/g, " ").slice(0, 100);
    list.appendChild(row);
  });

  if (memories.length > 10) {
    const more = document.createElement("div");
    more.style.cssText = "font-size:10px;color:#6366f1;margin-top:3px;";
    more.textContent = "+" + (memories.length - 10) + " more memories";
    list.appendChild(more);
  }

  const hint = document.createElement("div");
  hint.style.cssText = "font-size:10px;color:#4b5563;margin-top:5px;";
  hint.textContent = "Click to expand";
  toast.appendChild(hint);
  toast.appendChild(list);

  toast.addEventListener("click", () => {
    const expanded = list.style.display !== "none";
    list.style.display = expanded ? "none" : "block";
    hint.style.display = expanded ? "" : "none";
  });

  document.documentElement.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 240);
  }, 5000);
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
      showMemoryToast(memories);
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
