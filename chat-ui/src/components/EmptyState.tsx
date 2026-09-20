"use client";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export default function EmptyState({
  icon = "🧠",
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 py-20 animate-fade-in ${className}`}
    >
      <div className="relative mb-6">
        <div className="w-[4.5rem] h-[4.5rem] rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl shadow-xl shadow-indigo-500/10">
          {icon}
        </div>
        <div className="absolute -inset-4 bg-indigo-500/10 rounded-full blur-2xl -z-10" />
      </div>

      <h3 className="text-[15px] font-semibold text-white mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-[13px] text-txt-3 max-w-[280px] leading-relaxed mb-7">
        {description}
      </p>

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-5 py-2.5 text-xs font-medium rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-600/25 transition-all active:scale-[0.97]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
