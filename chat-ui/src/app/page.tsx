"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api, Memory, HealthResult, friendlyError } from "@/lib/api";
import { getUser, logout, isLoggedIn, type User } from "@/lib/auth";
import MemoryCard from "@/components/MemoryCard";
import EmptyState from "@/components/EmptyState";
import GraphView from "@/components/GraphView";
import LoadingSkeleton from "@/components/LoadingSkeleton";

type Role = "user" | "assistant";
interface Message {
  id: string;
  role: Role;
  content: string;
  memoriesUsed?: number;
  isThinking?: boolean;
  isError?: boolean;
}
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}
type Panel = "chat" | "vault" | "graph";

const OB_QUESTIONS = [
  "What is your full name and what do you do professionally?",
  "What are your main technical skills, languages, or areas of expertise?",
  "What projects are you currently developing or managing?",
  "What are your long-term goals — personal and professional?",
  "What are your strong preferences or dislikes (tools, foods, workflow)?",
  "Who are the key people, collaborators, or teammates in your life?",
  "What development tools, IDEs, or frameworks do you use daily?",
  "What topics or technologies are you actively exploring right now?",
  "Any recurring routines, commitments, or constraints I should know?",
  "Anything else fundamental you want Engram to always keep in mind?",
];

const PROMPT_STARTERS = [
  {
    icon: "💻",
    title: "Technical Stack & Tools",
    prompt:
      "What is my current technical stack, preferred tools, and engineering habits?",
  },
  {
    icon: "🚀",
    title: "Active Projects",
    prompt:
      "Summarize the active projects and goals you know I am currently working on.",
  },
  {
    icon: "⚙️",
    title: "Routines & Preferences",
    prompt:
      "What do you remember about my daily routines, constraints, and work preferences?",
  },
  {
    icon: "🧠",
    title: "Full Knowledge Briefing",
    prompt:
      "Give me a structured briefing of everything you remember across my memories.",
  },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function timeAgo(iso: string) {
  if (!iso) return "recently";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function renderMd(t: string) {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```([\w]*)\n?([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^[*-] (.+)$/gm, "<li>$1</li>")
    .replace(
      /(<li>[\s\S]*?<\/li>)(?:\s*<br>\s*(<li>[\s\S]*?<\/li>))*/g,
      (block) => `<ul>${block.replace(/<br>/g, "")}</ul>`,
    )
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function titleFrom(msg: string) {
  return msg.slice(0, 36) + (msg.length > 36 ? "…" : "");
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1 px-1">
      <span
        className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse-dot"
        style={{ animationDelay: "0s" }}
      />
      <span
        className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse-dot"
        style={{ animationDelay: "0.2s" }}
      />
      <span
        className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse-dot"
        style={{ animationDelay: "0.4s" }}
      />
    </div>
  );
}

function KnowledgeGraphView({
  memories,
  onOpen,
}: {
  memories: Memory[];
  onOpen: (m: Memory) => void;
}) {
  const nodes = memories.slice(0, 42);
  const tags = Array.from(
    new Set(nodes.flatMap((m) => m.tags || []).filter(Boolean)),
  ).slice(0, 8);
  const w = 760;
  const h = 460;
  const cx = w / 2;
  const cy = h / 2;
  const tagR = 92;
  const memR = 188;

  const tagPos = tags.map((tag, i) => {
    const a = (i / Math.max(tags.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { tag, x: cx + Math.cos(a) * tagR, y: cy + Math.sin(a) * tagR };
  });

  const memPos = nodes.map((m, i) => {
    const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      m,
      x: cx + Math.cos(a) * memR,
      y: cy + Math.sin(a) * memR,
      tag: m.tags?.[0],
    };
  });

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[360px] text-center px-6">
        <p className="text-sm font-medium text-white mb-1">
          No graph nodes yet
        </p>
        <p className="text-xs text-txt-3 max-w-sm">
          Save memories from chat or the vault and they will appear here as
          connected facts.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0d16]">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto max-h-[min(460px,58vh)]"
      >
        <defs>
          <radialGradient id="graphGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(99,102,241,0.18)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0)" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r="210" fill="url(#graphGlow)" />
        {memPos.map((node, i) => {
          const t = tagPos.find((p) => p.tag === node.tag);
          const x2 = t ? t.x : cx;
          const y2 = t ? t.y : cy;
          return (
            <line
              key={`e-${i}`}
              x1={node.x}
              y1={node.y}
              x2={x2}
              y2={y2}
              stroke="rgba(129,140,248,0.22)"
              strokeWidth="1"
            />
          );
        })}
        {tagPos.map((t) => (
          <g key={t.tag}>
            <circle
              cx={t.x}
              cy={t.y}
              r="18"
              fill="#1a1338"
              stroke="rgba(167,139,250,0.55)"
              strokeWidth="1.4"
            />
            <text
              x={t.x}
              y={t.y + 3}
              textAnchor="middle"
              fill="#c4b5fd"
              fontSize="8"
              fontFamily="ui-monospace, monospace"
            >
              #{t.tag.slice(0, 8)}
            </text>
          </g>
        ))}
        <circle
          cx={cx}
          cy={cy}
          r="22"
          fill="#11141f"
          stroke="rgba(99,102,241,0.7)"
          strokeWidth="1.6"
        />
        <text
          x={cx}
          y={cy + 3}
          textAnchor="middle"
          fill="#a5b4fc"
          fontSize="9"
          fontWeight="600"
        >
          You
        </text>
        {memPos.map((node) => (
          <g
            key={node.m.id}
            className="graph-node"
            onClick={() => onOpen(node.m)}
          >
            <title>{node.m.content}</title>
            <circle
              cx={node.x}
              cy={node.y}
              r="7"
              fill="#6366f1"
              stroke="#c7d2fe"
              strokeWidth="1"
            />
            <text
              x={node.x}
              y={node.y + 16}
              textAnchor="middle"
              fill="#9ca3af"
              fontSize="7"
            >
              {node.m.content.replace(/\s+/g, " ").slice(0, 16)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [healthData, setHealthData] = useState<HealthResult | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [panel, setPanel] = useState<Panel>("chat");
  const [sidebarOpen, setSidebar] = useState(true);
  const [showOb, setShowOb] = useState(false);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [searchConv, setSearchConv] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Memories & Vault
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memSearch, setMemSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [loadingMem, setLoadingMem] = useState(false);

  // Add Memory Modal
  const [showAddMem, setShowAddMem] = useState(false);
  const [newMemText, setNewMemText] = useState("");
  const [newMemTags, setNewMemTags] = useState("");
  const [savingMem, setSavingMem] = useState(false);

  // Lineage / History Modal (HydraDB feature)
  const [inspectMem, setInspectMem] = useState<Memory | null>(null);
  const [memHistory, setMemHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHist] = useState(false);

  // Onboarding wizard
  const [obStep, setObStep] = useState(0);
  const [obAnswers, setObAnswers] = useState<string[]>(
    Array(OB_QUESTIONS.length).fill(""),
  );
  const [obSaving, setObSaving] = useState(false);
  const [obDone, setObDone] = useState(false);

  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeConv = convs.find((c) => c.id === activeId);
  const messages = activeConv?.messages ?? [];

  const checkHealth = useCallback(async () => {
    try {
      const data = await api.health();
      setHealthData(data);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    const u = getUser();
    if (!u || !isLoggedIn()) {
      window.location.href = "/auth";
      return;
    }
    setUser(u);
    try {
      const saved = localStorage.getItem(`engram_convs_${u.user_id}`);
      if (saved) {
        const p: Conversation[] = JSON.parse(saved);
        setConvs(p);
        if (p.length > 0) setActiveId(p[0].id);
      } else {
        const c: Conversation = {
          id: uid(),
          title: "Welcome chat",
          messages: [],
          createdAt: Date.now(),
        };
        setConvs([c]);
        setActiveId(c.id);
      }
    } catch {
      const c: Conversation = {
        id: uid(),
        title: "Welcome chat",
        messages: [],
        createdAt: Date.now(),
      };
      setConvs([c]);
      setActiveId(c.id);
    }
    checkHealth();

    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setSidebar(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [checkHealth]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!user || convs.length === 0) return;
    localStorage.setItem(`engram_convs_${user.user_id}`, JSON.stringify(convs));
  }, [convs, user]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height =
      Math.min(inputRef.current.scrollHeight, 180) + "px";
  }, [input]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setShowAddMem(false);
      setInspectMem(null);
      setShowOb(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function newConv(initial = false) {
    const c: Conversation = {
      id: uid(),
      title: "New conversation",
      messages: [],
      createdAt: Date.now(),
    };
    setConvs((p) => [c, ...p]);
    setActiveId(c.id);
    setPanel("chat");
    if (!initial) setTimeout(() => inputRef.current?.focus(), 50);
  }

  function delConv(id: string) {
    setConvs((p) => {
      const n = p.filter((c) => c.id !== id);
      if (activeId === id) setActiveId(n[0]?.id ?? "");
      return n;
    });
  }

  function clearActiveChat() {
    if (!activeId) return;
    if (confirm("Are you sure you want to clear messages in this chat?")) {
      upd(activeId, (c) => ({ ...c, messages: [] }));
    }
  }

  function upd(id: string, fn: (c: Conversation) => Conversation) {
    setConvs((p) => p.map((c) => (c.id === id ? fn(c) : c)));
  }

  const sendMessageWithText = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || sending) return;

      let cid = activeId;
      if (!cid) {
        const c: Conversation = {
          id: uid(),
          title: titleFrom(text),
          messages: [],
          createdAt: Date.now(),
        };
        setConvs((p) => [c, ...p]);
        setActiveId(c.id);
        cid = c.id;
      }

      const uid1 = uid();
      const uid2 = uid();
      const userMsg: Message = { id: uid1, role: "user", content: text };
      const thinkMsg: Message = {
        id: uid2,
        role: "assistant",
        content: "",
        isThinking: true,
      };

      upd(cid, (c) => ({
        ...c,
        title: c.messages.length === 0 ? titleFrom(text) : c.title,
        messages: [...c.messages, userMsg, thinkMsg],
      }));

      setInput("");
      setSending(true);
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      const hist = (convs.find((c) => c.id === cid)?.messages ?? [])
        .filter((m) => !m.isThinking)
        .map((m) => ({ role: m.role, content: m.content }));

      let acc = "";
      try {
        let usedCount: number | undefined = undefined;

        await api
          .streamChat(
            text,
            hist,
            (tok) => {
              acc += tok;
              upd(cid, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === uid2
                    ? {
                        ...m,
                        content: acc,
                        isThinking: false,
                        memoriesUsed: usedCount,
                      }
                    : m,
                ),
              }));
            },
            (info) => {
              usedCount = info.memoriesUsed;
              upd(cid, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === uid2 ? { ...m, memoriesUsed: usedCount } : m,
                ),
              }));
            },
            signal,
          )
          .catch(async (err) => {
            if ((err as { name?: string })?.name === "AbortError") throw err;
            const res = await api.chat(text, hist);
            upd(cid, (c) => ({
              ...c,
              messages: c.messages.map((m) =>
                m.id === uid2
                  ? {
                      ...m,
                      content: res.response,
                      isThinking: false,
                      memoriesUsed: res.memories_used,
                    }
                  : m,
              ),
            }));
          });

        await new Promise((r) => setTimeout(r, 80));
        upd(cid, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === uid2
              ? {
                  ...m,
                  content: acc || m.content,
                  isThinking: false,
                  memoriesUsed: usedCount ?? m.memoriesUsed,
                }
              : m,
          ),
        }));
        checkHealth();
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") {
          upd(cid, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === uid2
                ? {
                    ...m,
                    isThinking: false,
                    content: acc || m.content || "Stopped.",
                  }
                : m,
            ),
          }));
        } else {
          upd(cid, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === uid2
                ? {
                    ...m,
                    content: friendlyError(e),
                    isThinking: false,
                    isError: true,
                  }
                : m,
            ),
          }));
        }
      } finally {
        abortRef.current = null;
        setSending(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [sending, activeId, convs, checkHealth],
  );

  const sendMessage = useCallback(() => {
    sendMessageWithText(input);
  }, [input, sendMessageWithText]);

  function stopSending() {
    abortRef.current?.abort();
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadMems = useCallback(async () => {
    setLoadingMem(true);
    try {
      const data = await api.list(200);
      setMemories(data);
    } catch {
      setMemories([]);
    } finally {
      setLoadingMem(false);
    }
  }, []);

  useEffect(() => {
    if (panel === "vault" || panel === "graph") loadMems();
    if (panel === "graph") checkHealth();
  }, [panel, loadMems, checkHealth]);

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemText.trim() || savingMem) return;
    setSavingMem(true);
    try {
      const tags = newMemTags
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);
      await api.store(newMemText.trim(), tags);
      setNewMemText("");
      setNewMemTags("");
      setShowAddMem(false);
      await loadMems();
      await checkHealth();
    } catch (err) {
      alert(friendlyError(err));
    } finally {
      setSavingMem(false);
    }
  };

  const openLineage = async (m: Memory) => {
    setInspectMem(m);
    setLoadingHist(true);
    try {
      const res = await api.history(m.id);
      setMemHistory(res.history || []);
    } catch {
      setMemHistory([]);
    } finally {
      setLoadingHist(false);
    }
  };

  const allTags = Array.from(
    new Set(memories.flatMap((m) => m.tags || []).filter(Boolean)),
  );

  const filteredMems = memories.filter((m) => {
    const matchesSearch =
      m.content.toLowerCase().includes(memSearch.toLowerCase()) ||
      (m.tags &&
        m.tags.some((t) => t.toLowerCase().includes(memSearch.toLowerCase())));
    const matchesTag =
      selectedTag === "all" || (m.tags && m.tags.includes(selectedTag));
    return matchesSearch && matchesTag;
  });

  const filteredConvs = convs.filter((c) =>
    c.title.toLowerCase().includes(searchConv.toLowerCase()),
  );

  const saveOb = async () => {
    const ans = obAnswers[obStep].trim();
    if (!ans) return;
    setObSaving(true);
    try {
      await api.store(`${OB_QUESTIONS[obStep]}\n${ans}`, ["onboarding"]);
    } catch {}
    setObSaving(false);
    if (obStep < OB_QUESTIONS.length - 1) setObStep((s) => s + 1);
    else {
      setObDone(true);
      checkHealth();
    }
  };

  function selectPanel(id: Panel) {
    setPanel(id);
    if (typeof window !== "undefined" && window.innerWidth < 768)
      setSidebar(false);
  }

  async function deleteMemory(id: string) {
    if (!confirm("Delete this memory from graph?")) return;
    try {
      await api.delete(id);
      setMemories((p) => p.filter((x) => x.id !== id));
      checkHealth();
    } catch (err) {
      alert(friendlyError(err));
    }
  }

  return (
    <div className="flex h-screen bg-bg text-txt overflow-hidden font-sans antialiased">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 bg-black/55 z-20 md:hidden"
          onClick={() => setSidebar(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed md:static inset-y-0 left-0 flex flex-col bg-[#0b0d14] border-r border-white/[0.07] transition-all duration-200 shrink-0 z-30 ${
          sidebarOpen
            ? "w-[280px] translate-x-0"
            : "-translate-x-full w-[280px] md:translate-x-0 md:w-0 md:overflow-hidden md:border-none"
        }`}
      >
        {/* Brand Header */}
        <div className="p-3.5 px-4 border-b border-white/[0.07] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 p-[1px] shadow-sm">
              <div className="w-full h-full bg-[#0d0f17] rounded-[7px] flex items-center justify-center">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className="text-indigo-400"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5 5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z" />
                  <path d="M2 18a10 10 0 0 1 20 0" />
                </svg>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-white font-sans">
                  Engram
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/10 text-accent-3 border border-indigo-500/20">
                  PRO
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => newConv()}
            title="New Chat"
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/[0.06] text-txt-2 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* View Switcher Pills */}
        <div className="p-2.5 px-3 shrink-0">
          <div className="flex p-1 bg-black/40 border border-white/[0.06] rounded-xl">
            {(
              [
                { id: "chat", label: "Chats", icon: "💬" },
                { id: "vault", label: "Vault", icon: "🧠" },
                { id: "graph", label: "Graph", icon: "🕸️" },
              ] as { id: Panel; label: string; icon: string }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => selectPanel(t.id)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  panel === t.id
                    ? "bg-[#181d2a] text-white shadow-sm border border-white/[0.08]"
                    : "text-txt-3 hover:text-txt-2"
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list — always visible so vault/graph don't hide chats */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="space-y-1">
            {(convs.length > 2 || searchConv) && (
              <div className="relative mb-2 px-1">
                <input
                  type="text"
                  value={searchConv}
                  onChange={(e) => setSearchConv(e.target.value)}
                  placeholder="Search chats…"
                  className="w-full bg-[#11141c] border border-white/[0.06] focus:border-indigo-500/50 rounded-lg px-2.5 py-1.5 text-xs text-txt placeholder:text-txt-4 outline-none transition-all"
                />
              </div>
            )}

            {filteredConvs.length === 0 && (
              <div className="text-center text-txt-3 text-xs py-8">
                No conversations yet
              </div>
            )}

            {filteredConvs.map((conv) => {
              const isActive = activeId === conv.id && panel === "chat";
              const userMsgCount = conv.messages.filter(
                (m) => m.role === "user",
              ).length;
              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    setActiveId(conv.id);
                    selectPanel("chat");
                  }}
                  className={`group relative flex items-center justify-between p-2.5 px-3 rounded-xl cursor-pointer transition-all border ${
                    isActive
                      ? "bg-[#141824] border-indigo-500/30 text-white shadow-sm"
                      : "bg-transparent hover:bg-white/[0.03] border-transparent text-txt-2"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p
                      className={`text-xs font-medium truncate ${isActive ? "text-white" : "text-txt-2 group-hover:text-txt"}`}
                    >
                      {conv.title || "New conversation"}
                    </p>
                    <p className="text-[10px] text-txt-3 mt-0.5 flex items-center gap-1.5">
                      <span>
                        {userMsgCount} msg{userMsgCount === 1 ? "" : "s"}
                      </span>
                      <span>·</span>
                      <span>
                        {conv.createdAt
                          ? timeAgo(new Date(conv.createdAt).toISOString())
                          : "recent"}
                      </span>
                    </p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      delConv(conv.id);
                    }}
                    title="Delete chat"
                    className="w-6 h-6 rounded-md hover:bg-red-500/20 text-txt-3 hover:text-red-300 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all shrink-0"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    >
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* SIDEBAR FOOTER */}
        <div className="p-3 border-t border-white/[0.07] shrink-0 space-y-2 bg-[#0d0f17]">
          <button
            onClick={() => setShowOb(true)}
            className="w-full py-2 px-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] text-txt-2 hover:text-white text-xs font-medium flex items-center justify-between transition-all cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <span>✦</span>
              <span>Memory Wizard</span>
            </span>
            <span className="text-[10px] text-txt-3 font-mono">10 Qs</span>
          </button>

          {user && (
            <div className="flex items-center justify-between pt-1 px-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold shrink-0 shadow-sm">
                  {user.username?.[0]?.toUpperCase() ?? "U"}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-txt truncate">
                    {user.username}
                  </p>
                  <p className="text-[10px] text-txt-3 truncate">
                    {user.email || "Active User"}
                  </p>
                </div>
              </div>

              <button
                onClick={logout}
                title="Sign out"
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-txt-3 hover:text-red-400 transition-colors cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-bg relative">
        {/* Top Navbar */}
        <header className="h-14 border-b border-white/[0.07] px-4 flex items-center justify-between shrink-0 glass-panel">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebar((s) => !s)}
              className="w-8 h-8 rounded-lg hover:bg-white/[0.06] border border-white/[0.06] text-txt-2 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                {sidebarOpen ? (
                  <path d="M15 18l-6-6 6-6" />
                ) : (
                  <path d="M3 6h18M3 12h18M3 18h18" />
                )}
              </svg>
            </button>

            <div className="min-w-0">
              <h1 className="text-xs font-semibold text-white truncate font-sans">
                {panel === "vault"
                  ? "Memory Vault"
                  : panel === "graph"
                    ? "Knowledge Graph"
                    : activeConv?.title || "Engram Intelligence"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-[11px] text-txt-3">
              <span
                className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400 animate-pulse-dot" : "bg-red-400"}`}
              />
              <span>{online ? "Graph Connected" : "Connecting API"}</span>
              {healthData?.graph?.nodes !== undefined && (
                <>
                  <span>·</span>
                  <span className="font-mono text-txt-2">
                    {healthData.graph.nodes} nodes
                  </span>
                </>
              )}
            </div>

            {panel === "chat" && messages.length > 0 && (
              <button
                onClick={clearActiveChat}
                title="Clear current conversation"
                className="text-xs text-txt-3 hover:text-txt-2 px-2.5 py-1 rounded-lg hover:bg-white/[0.05] transition-all cursor-pointer"
              >
                Clear
              </button>
            )}

            <button
              onClick={() => setShowAddMem(true)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <span>+</span>
              <span>Remember</span>
            </button>
          </div>
        </header>

        {/* Messages Stream Container */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {panel === "vault" && (
            <div className="max-w-4xl mx-auto animate-fade-in space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <input
                  type="text"
                  value={memSearch}
                  onChange={(e) => setMemSearch(e.target.value)}
                  placeholder="Search memory vault…"
                  className="flex-1 bg-[#11141c] border border-white/[0.07] focus:border-indigo-500/50 rounded-xl px-3.5 py-2.5 text-sm text-txt placeholder:text-txt-4 outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadMems}
                    className="px-3 py-2 text-xs rounded-xl border border-white/[0.07] text-txt-2 hover:text-white hover:bg-white/[0.04]"
                  >
                    {loadingMem ? "Syncing…" : "Refresh"}
                  </button>
                  <button
                    onClick={() => setShowAddMem(true)}
                    className="px-3.5 py-2 text-xs font-medium rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                  >
                    + Add memory
                  </button>
                </div>
              </div>

              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedTag("all")}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${
                      selectedTag === "all"
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "bg-white/[0.03] text-txt-3 hover:text-txt-2 border border-transparent"
                    }`}
                  >
                    All ({memories.length})
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(tag)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${
                        selectedTag === tag
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                          : "bg-white/[0.03] text-txt-3 hover:text-txt-2 border border-transparent"
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}

              {loadingMem ? (
                <LoadingSkeleton count={4} />
              ) : filteredMems.length === 0 ? (
                <EmptyState
                  icon="🧠"
                  title={
                    memSearch ? "No matches in vault" : "No memories saved yet"
                  }
                  description={
                    memSearch
                      ? "Try a different search term."
                      : "Chat with Engram or add memories manually to start building your knowledge graph."
                  }
                  actionLabel={!memSearch ? "+ Add memory" : undefined}
                  onAction={!memSearch ? () => setShowAddMem(true) : undefined}
                />
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredMems.map((m) => (
                  <MemoryCard
                    key={m.id}
                    memory={m}
                    onInspect={openLineage}
                    onDelete={deleteMemory}
                  />
                ))}
              </div>
            </div>
          )}

          {panel === "graph" && (
            <div className="max-w-4xl mx-auto animate-fade-in space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  {
                    label: "Entities",
                    value: healthData?.graph?.nodes ?? memories.length,
                  },
                  { label: "Relations", value: healthData?.graph?.edges ?? 0 },
                  { label: "Updates", value: healthData?.graph?.updates ?? 0 },
                  { label: "Extends", value: healthData?.graph?.extends ?? 0 },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-[#11141e] border border-white/[0.07] rounded-xl p-3 text-center"
                  >
                    <p className="text-lg font-bold font-mono text-white">
                      {stat.value}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-txt-3 mt-0.5">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-[11px] text-txt-3 px-1">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`}
                  />
                  {online ? "Graph online" : "API offline"}
                  {healthData?.model ? ` · ${healthData.model}` : ""}
                </span>
                <span>Click a node to inspect lineage</span>
              </div>

              <GraphView
                memories={filteredMems}
                onOpen={openLineage}
                stats={healthData?.graph}
                online={online}
                model={healthData?.model}
              />

              <div className="p-4 bg-gradient-to-br from-indigo-950/20 to-purple-950/20 border border-indigo-500/20 rounded-2xl">
                <h4 className="text-xs font-semibold text-indigo-300 mb-1">
                  Temporal Knowledge Graph
                </h4>
                <p className="text-[12px] text-txt-3 leading-relaxed">
                  Facts cluster by tag around you. Updates replace stale nodes,
                  extends keep both, and derivations link related topics — older
                  versions stay in lineage.
                </p>
              </div>
            </div>
          )}

          {panel === "chat" && (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* EMPTY STATE / WELCOME HERO */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-[56vh] text-center max-w-xl mx-auto animate-fade-in py-8">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full" />
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-[1px] shadow-xl shadow-indigo-500/20">
                      <div className="w-full h-full bg-[#0c0e16] rounded-[15px] flex items-center justify-center">
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          className="text-indigo-400"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 2a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5 5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z" />
                          <path d="M2 18a10 10 0 0 1 20 0" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <h2 className="text-2xl font-bold tracking-tight text-white mb-2 font-sans">
                    Good{" "}
                    {new Date().getHours() < 12
                      ? "morning"
                      : new Date().getHours() < 18
                        ? "afternoon"
                        : "evening"}
                    {user?.username ? `, ${user.username}` : ""}
                  </h2>
                  <p className="text-sm text-txt-3 max-w-md leading-relaxed mb-8">
                    Your persistent AI memory vault is ready. Ask questions,
                    explore what is remembered, or save new knowledge.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                    {PROMPT_STARTERS.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => sendMessageWithText(item.prompt)}
                        className="p-3.5 rounded-xl bg-[#11141e] hover:bg-[#161a28] border border-white/[0.06] hover:border-indigo-500/30 transition-all text-left group cursor-pointer shadow-sm"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base">{item.icon}</span>
                          <span className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-txt-3 line-clamp-2 leading-relaxed">
                          {item.prompt}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* MESSAGES LIST */}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 animate-fade-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        className="text-indigo-400"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 2a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5 5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z" />
                        <path d="M2 18a10 10 0 0 1 20 0" />
                      </svg>
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] ${msg.role === "user" ? "max-w-[78%]" : "flex-1 min-w-0"}`}
                  >
                    {msg.role === "assistant" &&
                      !msg.isThinking &&
                      msg.memoriesUsed !== undefined &&
                      msg.memoriesUsed > 0 && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-mono mb-2 shadow-sm">
                          <span className="text-indigo-400">⚡</span>
                          <span>
                            {msg.memoriesUsed} memor
                            {msg.memoriesUsed === 1 ? "y" : "ies"} recalled for
                            context
                          </span>
                        </div>
                      )}

                    <div
                      className={`rounded-2xl p-4 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#181c28] border border-white/[0.1] text-txt rounded-br-sm shadow-md font-sans select-text whitespace-pre-wrap"
                          : "bg-[#10131c] border border-white/[0.06] text-txt rounded-tl-sm shadow-sm select-text"
                      }`}
                    >
                      {msg.isThinking ? (
                        <ThinkingDots />
                      ) : msg.isError ? (
                        <div className="flex items-start gap-2 text-amber-300 text-xs">
                          <span className="font-bold">⚠</span>
                          <p>{msg.content}</p>
                        </div>
                      ) : msg.role === "user" ? (
                        msg.content
                      ) : (
                        <div
                          className="prose"
                          dangerouslySetInnerHTML={{
                            __html: `<p>${renderMd(msg.content)}</p>`,
                          }}
                        />
                      )}
                    </div>

                    {msg.role === "assistant" &&
                      !msg.isThinking &&
                      !msg.isError && (
                        <div className="flex items-center gap-3 mt-1.5 px-1 text-[11px] text-txt-3">
                          <button
                            onClick={() => copyToClipboard(msg.content, msg.id)}
                            className="hover:text-txt-2 flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <span className="text-emerald-400">✓</span>
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <svg
                                  width="11"
                                  height="11"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <rect
                                    x="9"
                                    y="9"
                                    width="13"
                                    height="13"
                                    rx="2"
                                    ry="2"
                                  ></rect>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              ))}
              <div ref={messagesEnd} className="h-6" />
            </div>
          )}
        </div>

        {/* BOTTOM COMPOSER */}
        {panel === "chat" && (
          <div className="p-4 pt-2 shrink-0 max-w-3xl w-full mx-auto">
            <div className="glass-card rounded-2xl p-2.5 px-3 border border-white/[0.09] focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all shadow-xl">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask Engram anything, or teach it a new memory…"
                rows={1}
                disabled={sending}
                className="w-full bg-transparent border-none outline-none resize-none text-sm text-txt placeholder:text-txt-4 font-sans leading-relaxed min-h-[28px] max-h-[160px] overflow-y-auto px-1 pt-1"
              />

              <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/[0.04]">
                <div className="flex items-center gap-2 text-[10px] text-txt-3">
                  <span className="hidden sm:inline">
                    Return to send · Shift+Return for newline
                  </span>
                </div>

                {sending ? (
                  <button
                    type="button"
                    onClick={stopSending}
                    className="h-8 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-xs text-txt-2 hover:text-white cursor-pointer"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim()}
                    className="w-8 h-8 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-30 text-white flex items-center justify-center transition-all shadow-md shadow-indigo-600/20 active:scale-95 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* QUICK ADD MEMORY MODAL */}
      {showAddMem && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card bg-[#0e111a] rounded-2xl w-full max-w-lg border border-white/[0.1] shadow-2xl p-6 relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">🧠</span>
                <h3 className="text-sm font-bold text-white">
                  Add to Memory Vault
                </h3>
              </div>
              <button
                onClick={() => setShowAddMem(false)}
                className="text-txt-3 hover:text-white text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMemory} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-txt-3 uppercase tracking-wider mb-1.5">
                  Fact / Memory Content
                </label>
                <textarea
                  value={newMemText}
                  onChange={(e) => setNewMemText(e.target.value)}
                  placeholder="e.g., I live in Seattle, prefer TypeScript over Python, and run 5k on Tuesday mornings."
                  required
                  rows={4}
                  className="w-full bg-[#141724] border border-white/[0.08] focus:border-indigo-500/60 rounded-xl p-3 text-xs text-txt placeholder:text-txt-4 outline-none resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-txt-3 uppercase tracking-wider mb-1.5">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={newMemTags}
                  onChange={(e) => setNewMemTags(e.target.value)}
                  placeholder="profile, tech, routine"
                  className="w-full bg-[#141724] border border-white/[0.08] focus:border-indigo-500/60 rounded-xl p-2.5 text-xs text-txt placeholder:text-txt-4 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMem(false)}
                  className="px-4 py-2 text-xs text-txt-2 hover:text-white rounded-xl hover:bg-white/[0.05] transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMem || !newMemText.trim()}
                  className="px-5 py-2 text-xs font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-40 transition-all cursor-pointer"
                >
                  {savingMem ? "Indexing Fact…" : "Save to Graph →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEMPORAL LINEAGE / INSPECT MODAL (HydraDB feature) */}
      {inspectMem && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card bg-[#0e111a] rounded-2xl w-full max-w-lg border border-white/[0.1] shadow-2xl p-6 relative max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.07] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-base">🕸️</span>
                <h3 className="text-sm font-bold text-white">
                  Temporal Fact Lineage
                </h3>
              </div>
              <button
                onClick={() => setInspectMem(null)}
                className="text-txt-3 hover:text-white text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              <div className="p-3.5 bg-[#141724] rounded-xl border border-indigo-500/20">
                <span className="text-[10px] text-indigo-400 font-mono uppercase tracking-wider block mb-1">
                  Active Memory Node
                </span>
                <p className="text-xs text-txt leading-relaxed font-sans">
                  {inspectMem.content}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-txt-2 uppercase tracking-wider mb-2">
                  Supersession History
                </h4>
                {loadingHistory ? (
                  <p className="text-xs text-txt-3 py-4 text-center">
                    Tracing graph lineage…
                  </p>
                ) : memHistory.length === 0 ? (
                  <p className="text-xs text-txt-3 py-4 text-center">
                    This is an original root fact (no previous superseded
                    versions).
                  </p>
                ) : (
                  <div className="space-y-2 border-l-2 border-indigo-500/30 pl-3 ml-2">
                    {memHistory.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-[#121520] p-3 rounded-xl border border-white/[0.05] space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px] text-txt-3">
                          <span className="font-mono text-indigo-300">
                            v{item.version || idx + 1}
                          </span>
                          <span>
                            {item.created_at ? timeAgo(item.created_at) : ""}
                          </span>
                        </div>
                        <p className="text-xs text-txt-2">{item.content}</p>
                        {item.supersession_reason && (
                          <p className="text-[10px] text-amber-400 italic">
                            Replaced: {item.supersession_reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-white/[0.07] flex justify-end shrink-0">
              <button
                onClick={() => setInspectMem(null)}
                className="px-4 py-1.5 text-xs text-txt-2 hover:text-white rounded-xl bg-white/[0.05] hover:bg-white/[0.1] transition-all cursor-pointer"
              >
                Close Lineage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ONBOARDING WIZARD MODAL */}
      {showOb && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass-card bg-[#0e111a] rounded-2xl w-full max-w-lg border border-white/[0.1] shadow-2xl p-6 sm:p-7 relative overflow-hidden">
            {obDone ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xl mx-auto mb-4">
                  ✓
                </div>
                <h3 className="text-base font-bold text-white mb-2">
                  Memory Graph Seeded
                </h3>
                <p className="text-xs text-txt-3 max-w-xs mx-auto leading-relaxed mb-6">
                  Engram has integrated your preferences, tech stack, and
                  background into its graph.
                </p>
                <button
                  onClick={() => {
                    setShowOb(false);
                    setObDone(false);
                    setObStep(0);
                  }}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  Start Exploring →
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Seed Your Knowledge Graph
                    </h3>
                    <p className="text-[11px] text-txt-3">
                      Question {obStep + 1} of {OB_QUESTIONS.length}
                    </p>
                  </div>
                  <div className="w-24 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${((obStep + 1) / OB_QUESTIONS.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <p className="text-xs text-txt font-medium leading-relaxed mb-3">
                  {OB_QUESTIONS[obStep]}
                </p>

                <textarea
                  value={obAnswers[obStep]}
                  onChange={(e) => {
                    const n = [...obAnswers];
                    n[obStep] = e.target.value;
                    setObAnswers(n);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveOb();
                  }}
                  placeholder="Your answer…"
                  rows={4}
                  className="w-full bg-[#141724] border border-white/[0.08] focus:border-indigo-500/60 rounded-xl p-3 text-xs text-txt placeholder:text-txt-4 outline-none resize-none leading-relaxed mb-4"
                />

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setObStep((s) => Math.max(0, s - 1))}
                    disabled={obStep === 0}
                    className="text-xs text-txt-3 hover:text-txt-2 disabled:opacity-20 cursor-pointer"
                  >
                    ← Back
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowOb(false)}
                      className="px-3 py-1.5 text-xs text-txt-3 hover:text-white cursor-pointer"
                    >
                      Skip
                    </button>
                    <button
                      onClick={saveOb}
                      disabled={!obAnswers[obStep].trim() || obSaving}
                      className="px-5 py-2 text-xs font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-40 transition-all cursor-pointer"
                    >
                      {obSaving
                        ? "Saving…"
                        : obStep === OB_QUESTIONS.length - 1
                          ? "Finish Setup →"
                          : "Next →"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
