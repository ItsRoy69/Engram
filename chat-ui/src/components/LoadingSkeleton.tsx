"use client";

export default function LoadingSkeleton({
  count = 4,
  variant = "card",
}: {
  count?: number;
  variant?: "card" | "list";
}) {
  if (variant === "list") {
    return (
      <div className="space-y-3 animate-pulse">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="h-14 rounded-xl bg-white/[0.04] border border-white/[0.05]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-3xl border border-white/[0.07] bg-white/[0.03] p-5 animate-pulse"
        >
          <div className="h-3 w-1/3 rounded-full bg-white/[0.08] mb-4" />
          <div className="space-y-2.5">
            <div className="h-3 w-full rounded-full bg-white/[0.06]" />
            <div className="h-3 w-5/6 rounded-full bg-white/[0.06]" />
            <div className="h-3 w-4/6 rounded-full bg-white/[0.06]" />
          </div>
          <div className="flex gap-2 mt-5">
            <div className="h-5 w-12 rounded-full bg-white/[0.06]" />
            <div className="h-5 w-14 rounded-full bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}
