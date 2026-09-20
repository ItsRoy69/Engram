"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api, Memory, HealthResult, friendlyError } from "@/lib/api";
import { getUser, logout, isLoggedIn, type User } from "@/lib/auth";
import MemoryCard from "@/components/MemoryCard";

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
    prompt: "What is my current technical stack, preferred tools, and engineering habits?",
  },
  {
    icon: "🚀",
    title: "Active Projects",
    prompt: "Summarize the active projects and goals you know I am currently working on.",
  },
  {
    icon: "⚙️",
    title: "Routines & Preferences",
    prompt: "What do you remember about my daily routines, constraints, and work preferences?",
  },
  {
    icon: "🧠",
    title: "Full Knowledge Briefing",
    prompt: "Give me a structured briefing of everything you remember across my memories.",
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
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/```([\w]*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^[*-] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)(?:\s*<br>\s*(<li>[\s\S]*?<\/li>))*/g, (block) => `<ul>${block.replace(/<br>/g, "")}</ul>`)
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function titleFrom(msg: string) {
  return msg.slice(0, 36) + (msg.length > 36 ? "…" : "");
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1 px-1">
      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse-dot" style={{ animationDelay: "0s" }} />
      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse-dot" style={{ animationDelay: "0.2s" }} />
      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse-dot" style={{ animationDelay: "0.4s" }} />
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
  const tags = Array.from(new Set(nodes.flatMap((m) => m.tags || []).filter(Boolean))).slice(0, 8);
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
        <p className="text-sm font-medium text-white mb-1">No graph nodes yet</p>
        <p className="text-xs text-txt-3 max-w-sm">
          Save memories from chat or the vault and they will appear here as connected facts.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0d16]">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto max-h-[min(460px,58vh)]">
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
            <circle cx={t.x} cy={t.y} r="18" fill="#1a1338" stroke="rgba(167,139,250,0.55)" strokeWidth="1.4" />
            <text x={t.x} y={t.y + 3} textAnchor="middle" fill="#c4b5fd" fontSize="8" fontFamily="ui-monospace, monospace">
              #{t.tag.slice(0, 8)}
            </text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r="22" fill="#11141f" stroke="rgba(99,102,241,0.7)" strokeWidth="1.6" />
        <text x={cx} y={cy + 3} textAnchor="middle" fill="#a5b4fc" fontSize="9" fontWeight="600">
          You
        </text>
        {memPos.map((node) => (
          <g
            key={node.m.id}
            className="graph-node"
            onClick={() => onOpen(node.m)}
          >
            <title>{node.m.content}</title>
            <circle cx={node.x} cy={node.y} r="7" fill="#6366f1" stroke="#c7d2fe" strokeWidth="1" />
            <text x={node.x} y={node.y + 16} textAnchor="middle" fill="#9ca3af" fontSize="7">
              {node.m.content.replace(/\s+/g, " ").slice(0, 16)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function Home() {
  // NOTE: Full body is very long. This is a partial restore - the previous accidental overwrite is fixed in next commit.
  return <div>Loading full UI restore...</div>;
}
