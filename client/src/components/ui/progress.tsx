import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  isOvertime?: boolean;
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, isOvertime = false, ...props }, ref) => {
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.min(Math.max(value ?? 0, 0), 100);
  const strokeDashoffset = circumference * (1 - normalized / 100);

  return (
    <ProgressPrimitive.Root ref={ref} className={cn("relative rounded-full", className)} value={normalized} {...props}>
      <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_50%_42%,rgba(246,197,93,0.08),transparent_64%)] shadow-[inset_0_0_50px_rgba(0,0,0,0.22)]" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90 overflow-visible" aria-hidden="true">
        <circle className="progress-track" cx="50" cy="50" r={radius} strokeWidth="2.2" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke={isOvertime ? "#65d6c5" : "#f6c55d"}
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-[stroke-dashoffset,stroke] duration-700 ease-out"
          style={{ filter: `drop-shadow(0 0 5px ${isOvertime ? "rgba(101,214,197,.44)" : "rgba(246,197,93,.42)"})` }}
        />
      </svg>
      <div className="absolute left-1/2 top-[7%] h-2 w-2 -translate-x-1/2 rounded-full bg-amber-200 shadow-[0_0_15px_rgba(246,197,93,.8)]" style={{ animation: "breathe 2.8s ease-in-out infinite" }} />
    </ProgressPrimitive.Root>
  );
});

Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
