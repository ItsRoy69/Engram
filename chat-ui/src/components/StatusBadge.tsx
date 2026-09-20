"use client";

interface StatusBadgeProps {
  online: boolean | null;
  model?: string;
  className?: string;
}

export default function StatusBadge({ online, model, className = "" }: StatusBadgeProps) {
  return (
    <div className={`inline-flex items-center gap-2 text-[11px] ${className}`}>
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            online === null
              ? "bg-amber-400 animate-pulse"
              : online
              ? "bg-emerald-400"
              : "bg-red-400"
          }`}
        />
        <span className="text-txt-2 font-medium">
          {online === null ? "Checking…" : online ? "Online" : "Offline"}
        </span>
      </span>
      {model && (
        <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/15 text-indigo-300/90 font-mono text-[10px]">
          {model}
        </span>
      )}
    </div>
  );
}
