"use client";

type LoadingVideoProps = {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_MAP: Record<NonNullable<LoadingVideoProps["size"]>, string> = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-20 w-20",
};

export default function LoadingVideo({ label = "Chargement...", size = "md", className = "" }: LoadingVideoProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`.trim()}>
      <video
        src="/assets/loading-icon.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className={`${SIZE_MAP[size]} object-contain`}
        aria-hidden="true"
      />
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}
