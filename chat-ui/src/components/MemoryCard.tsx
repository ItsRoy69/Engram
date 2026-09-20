"use client";

import { Memory } from "@/lib/api";

interface MemoryCardProps {
  memory: Memory;
  onInspect?: (m: Memory) => void;
  onDelete?: (id: string) => void;
  selected?: boolean;
}

function timeAgo(iso?: string) {
  if (!iso) return "recently";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 604800) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function MemoryCard({ memory, onInspect, onDelete, selected }: MemoryCardProps) {
  const tags = (memory.tags || []).filter(Boolean).slice(0, 4);
  const hasMoreTags = (memory.tags || []).length > 4;

  return (
    <article
      className={`
        group relative rounded-2xl p-[1px] transition-all duration-300
        ${selected
          ? "bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-400 shadow-lg shadow-indigo-500/25"
          : "bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-transparent hover:from-indigo-500/40 hover:via-purple-500/30 hover:to-indigo-400/20"
        }
      `}
    >
      <div
        className={`
          relative h-full rounded-[15px] bg-[#0f1118]/95 backdrop-blur-xl
          border border-white/[0.06] overflow-hidden
          transition-all duration-300
          group-hover:bg-[#12151f]/95 group-hover:border-white/[0.1]
          ${selected ? "bg-[#12151f]" : ""}
        `}
      >
        {/* Subtle top highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-60" />

        {/* Accent glow on hover */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        <div className="relative p-4 sm:p-5 flex flex-col gap-3.5">
          {/* Header: time + actions */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-400/80 group-hover:bg-indigo-400 transition-colors" />
              <time className="text-[11px] font-medium text-txt-3 tracking-wide truncate">
                {timeAgo(memory.created_at)}
              </time>
              {memory.graph_rel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/20 font-medium">
                  {memory.graph_rel}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {onInspect && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspect(memory);
                  }}
                  className="p-1.5 rounded-lg text-txt-3 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                  title="View lineage"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(memory.id);
                  }}
                  className="p-1.5 rounded-lg text-txt-3 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete memory"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <p className="text-[13.5px] leading-relaxed text-txt/95 font-normal line-clamp-4 group-hover:text-white transition-colors">
            {memory.content}
          </p>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-medium
                    bg-indigo-500/10 text-indigo-300/90 border border-indigo-500/15
                    group-hover:bg-indigo-500/15 group-hover:border-indigo-500/25 transition-colors"
                >
                  #{tag}
                </span>
              ))}
              {hasMoreTags && (
                <span className="text-[10px] text-txt-4 font-medium">
                  +{(memory.tags || []).length - 4}
                </span>
              )}
            </div>
          )}

          {/* Score footer (if available) */}
          {(memory.score != null || memory.rerank_score != null) && (
            <div className="flex items-center gap-3 pt-1 border-t border-white/[0.04]">
              {memory.rerank_score != null && (
                <span className="text-[10px] text-txt-4 font-mono">
                  rank <span className="text-indigo-400/80">{memory.rerank_score.toFixed(2)}</span>
                </span>
              )}
              {memory.score != null && (
                <span className="text-[10px] text-txt-4 font-mono">
                  sim <span className="text-emerald-400/80">{memory.score.toFixed(2)}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
