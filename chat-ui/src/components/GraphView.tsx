"use client";

import { Memory } from "@/lib/api";

interface GraphViewProps {
  memories: Memory[];
  onOpen: (m: Memory) => void;
  stats?: {
    nodes?: number;
    edges?: number;
    updates?: number;
    extends?: number;
  };
  online?: boolean | null;
  model?: string;
}

export default function GraphView({
  memories,
  onOpen,
  stats,
  online,
  model,
}: GraphViewProps) {
  const nodes = memories.slice(0, 48);
  const tags = Array.from(
    new Set(nodes.flatMap((m) => m.tags || []).filter(Boolean)),
  ).slice(0, 10);

  const w = 800;
  const h = 480;
  const cx = w / 2;
  const cy = h / 2;
  const tagR = 100;
  const memR = 195;

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
      <div className="rounded-2xl border border-white/[0.07] bg-[#0b0d16]/80 overflow-hidden">
        <div className="flex flex-col items-center justify-center h-[360px] text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-2xl mb-4">
            🕸️
          </div>
          <p className="text-sm font-medium text-white mb-1">No graph nodes yet</p>
          <p className="text-xs text-txt-3 max-w-sm leading-relaxed">
            Save memories from chat or the vault and they will appear here as connected facts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: "Entities", value: stats?.nodes ?? memories.length, color: "text-indigo-300" },
          { label: "Relations", value: stats?.edges ?? 0, color: "text-purple-300" },
          { label: "Updates", value: stats?.updates ?? 0, color: "text-emerald-300" },
          { label: "Extends", value: stats?.extends ?? 0, color: "text-amber-300" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#11141e]/80 p-3.5 text-center group hover:border-white/[0.12] transition-colors"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className={`text-xl font-bold font-mono tracking-tight ${stat.color}`}>
              {stat.value}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-txt-3 mt-0.5 font-medium">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between text-[11px] text-txt-3 px-1">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`}
          />
          {online ? "Graph online" : "API offline"}
          {model ? ` · ${model}` : ""}
        </span>
        <span className="text-txt-4">{nodes.length} nodes shown</span>
      </div>

      {/* Graph canvas */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0d16] relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08),transparent_70%)] pointer-events-none" />
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto max-h-[min(480px,60vh)] relative">
          <defs>
            <radialGradient id="graphGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(99,102,241,0.2)" />
              <stop offset="100%" stopColor="rgba(99,102,241,0)" />
            </radialGradient>
            <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle cx={cx} cy={cy} r="220" fill="url(#graphGlow)" />

          {/* Edges */}
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
                stroke="rgba(129,140,248,0.18)"
                strokeWidth="1"
              />
            );
          })}

          {/* Tag hubs */}
          {tagPos.map((t) => (
            <g key={t.tag}>
              <circle
                cx={t.x}
                cy={t.y}
                r="20"
                fill="#1a1338"
                stroke="rgba(167,139,250,0.5)"
                strokeWidth="1.5"
              />
              <text
                x={t.x}
                y={t.y + 3.5}
                textAnchor="middle"
                fill="#c4b5fd"
                fontSize="8.5"
                fontFamily="ui-monospace, monospace"
                fontWeight="500"
              >
                #{t.tag.slice(0, 7)}
              </text>
            </g>
          ))}

          {/* Center You node */}
          <circle
            cx={cx}
            cy={cy}
            r="24"
            fill="#11141f"
            stroke="rgba(99,102,241,0.75)"
            strokeWidth="1.8"
            filter="url(#nodeGlow)"
          />
          <text
            x={cx}
            y={cy + 3.5}
            textAnchor="middle"
            fill="#a5b4fc"
            fontSize="10"
            fontWeight="600"
          >
            You
          </text>

          {/* Memory nodes */}
          {memPos.map((node) => (
            <g
              key={node.m.id}
              className="graph-node"
              onClick={() => onOpen(node.m)}
              style={{ cursor: "pointer" }}
            >
              <title>{node.m.content}</title>
              <circle
                cx={node.x}
                cy={node.y}
                r="8"
                fill="#6366f1"
                stroke="#c7d2fe"
                strokeWidth="1.2"
              />
              <text
                x={node.x}
                y={node.y + 18}
                textAnchor="middle"
                fill="#9ca3af"
                fontSize="7.5"
              >
                {node.m.content.replace(/\s+/g, " ").slice(0, 18)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
