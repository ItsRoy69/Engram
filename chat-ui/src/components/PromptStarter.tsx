"use client";

interface PromptStarterProps {
  icon: string;
  title: string;
  prompt: string;
  onClick: (prompt: string) => void;
}

export default function PromptStarter({ icon, title, prompt, onClick }: PromptStarterProps) {
  return (
    <button
      onClick={() => onClick(prompt)}
      className="group relative text-left rounded-2xl p-[1px] transition-all duration-300
        bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent
        hover:from-indigo-500/40 hover:via-purple-500/25 hover:to-indigo-400/15"
    >
      <div className="relative h-full rounded-[15px] bg-[#0f1118]/90 backdrop-blur-md border border-white/[0.06]
        p-4 transition-all duration-300 group-hover:bg-[#12151f]/95 group-hover:border-white/[0.1]">
        {/* top highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-50" />

        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-lg group-hover:bg-indigo-500/15 transition-colors">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white mb-0.5 group-hover:text-indigo-100 transition-colors">
              {title}
            </p>
            <p className="text-[11.5px] text-txt-3 leading-relaxed line-clamp-2 group-hover:text-txt-2 transition-colors">
              {prompt}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}
