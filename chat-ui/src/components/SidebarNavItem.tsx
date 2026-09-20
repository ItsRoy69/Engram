"use client";

interface SidebarNavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: string | number;
}

export default function SidebarNavItem({
  icon,
  label,
  active = false,
  onClick,
  badge,
}: SidebarNavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        group w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150
        ${active
          ? "bg-indigo-500/15 text-indigo-200 border border-indigo-500/20"
          : "text-txt-2 hover:text-white hover:bg-white/[0.04] border border-transparent"
        }
      `}
    >
      <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center ${active ? "text-indigo-300" : "text-txt-3 group-hover:text-txt-2"}`}>
        {icon}
      </span>
      <span className="truncate flex-1 text-left">{label}</span>
      {badge !== undefined && (
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
          active ? "bg-indigo-500/20 text-indigo-300" : "bg-white/[0.06] text-txt-3"
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}
