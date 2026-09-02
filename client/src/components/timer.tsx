import { useEffect, useState } from "react";
import { format, isToday, isTomorrow } from "date-fns";
import { ArrowRight, Clock3, Flame, SlidersHorizontal, Sunrise } from "lucide-react";
import { useFasting } from "@/hooks/use-fasting";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TimeAdjustDialog } from "./time-adjust-dialog";

const PRESET_DURATIONS = [
  { label: "16", caption: "Common target", minutes: 16 * 60 },
  { label: "18", caption: "Longer target", minutes: 18 * 60 },
  { label: "20", caption: "Longer target", minutes: 20 * 60 },
  { label: "24", caption: "Full-day target", minutes: 24 * 60 },
];

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
}

function durationTargetLabel(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}-hour target`;
}

function targetEndLabel(targetTime: Date): string {
  if (isToday(targetTime)) return `Ends today at ${format(targetTime, "h:mm a")}`;
  if (isTomorrow(targetTime)) return `Ends tomorrow at ${format(targetTime, "h:mm a")}`;
  return `Ends ${format(targetTime, "EEE, MMM d 'at' h:mm a")}`;
}

export function Timer() {
  const { fasts, startFast, stopFast, updateStartTime, isStarting, isStopping } = useFasting();
  const [customDuration, setCustomDuration] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [, setTick] = useState(0);

  const activeFast = fasts?.find((fast) => !fast.endTime);

  useEffect(() => {
    if (!activeFast) return;
    const interval = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(interval);
  }, [activeFast]);

  const handleStartFast = async (minutes: number) => {
    await startFast(minutes);
    setShowCustom(false);
    setCustomDuration("");
  };

  if (activeFast) {
    const startedAt = new Date(activeFast.startTime);
    const elapsed = Date.now() - startedAt.getTime();
    const targetMilliseconds = activeFast.targetDuration * 60 * 1000;
    const remaining = targetMilliseconds - elapsed;
    const progress = Math.min(Math.max((elapsed / targetMilliseconds) * 100, 0), 100);
    const isOvertime = remaining <= 0;
    const targetTime = new Date(startedAt.getTime() + targetMilliseconds);

    return (
      <section className="surface overflow-hidden p-5 sm:p-7" aria-labelledby="timer-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="timer-title" className="font-display text-3xl tracking-[-0.02em]">
              {isOvertime ? "Target reached." : "Your fast is running."}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Started {format(startedAt, "h:mm a")} · {durationTargetLabel(activeFast.targetDuration)}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-300/10 text-amber-200">
            <Flame className="h-5 w-5" />
          </div>
        </div>

        <div className="relative mx-auto my-6 aspect-square w-full max-w-[330px]">
          <Progress value={progress} isOvertime={isOvertime} className="h-full w-full" />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              {isOvertime ? "Elapsed" : "Remaining"}
            </p>
            <p className="mt-2 font-display text-[2.8rem] leading-none tabular-nums tracking-[-0.04em] sm:text-5xl">
              {formatClock(isOvertime ? elapsed : remaining)}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {targetEndLabel(targetTime)}
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/[0.07] bg-black/10 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted-foreground">Started</p>
            <p className="mt-1 text-sm font-semibold">{format(startedAt, "EEE · h:mm a")}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-black/10 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted-foreground">Target</p>
            <p className="mt-1 text-sm font-semibold">{durationTargetLabel(activeFast.targetDuration)}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="h-12 rounded-2xl bg-amber-300 font-bold text-stone-950 hover:bg-amber-200" disabled={isStopping}>
                {isStopping ? "Finishing…" : "Complete fast"}
                {!isStopping && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Complete this fast?</AlertDialogTitle>
                <AlertDialogDescription>
                  This saves the current time as the end of this fast. Past records cannot be changed here.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep fasting</AlertDialogCancel>
                <AlertDialogAction onClick={() => void stopFast(activeFast.id)}>Complete fast</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <TimeAdjustDialog
            trigger={
              <Button variant="outline" className="h-12 rounded-2xl border-white/10 bg-white/[0.03]">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Fix start time
              </Button>
            }
            title="Correct when this fast started"
            description="Use this if you forgot to start the timer. Your target length will stay the same."
            currentTime={startedAt}
            onSave={(newTime) => updateStartTime({ fastId: activeFast.id, startTime: newTime })}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="surface overflow-hidden p-5 sm:p-7" aria-labelledby="start-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="start-title" className="font-display text-3xl tracking-[-0.02em] sm:text-4xl">
            Start a fast
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Choose how long you want to track. We will count down, and you can correct the start time later if you forgot to begin the timer.
          </p>
        </div>
        <Sunrise className="mt-1 h-6 w-6 shrink-0 text-amber-300" />
      </div>

      {!showCustom ? (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {PRESET_DURATIONS.map((duration) => (
            <button
              key={duration.minutes}
              type="button"
              className="duration-button"
              aria-label={`Start a ${duration.label}-hour fast`}
              onClick={() => void handleStartFast(duration.minutes)}
              disabled={isStarting}
            >
              <span className="font-display text-3xl text-amber-100">{duration.label}</span>
              <span className="ml-1 text-xs font-bold uppercase tracking-widest text-amber-200/50">hours</span>
              <span className="mt-1 block text-xs text-muted-foreground">{duration.caption}</span>
            </button>
          ))}
          <button type="button" className="duration-button col-span-2 min-h-[66px]" onClick={() => setShowCustom(true)}>
            <span className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-semibold">Choose a custom duration</span>
                <span className="mt-1 block text-xs text-muted-foreground">From 1 hour to 7 days</span>
              </span>
              <Clock3 className="h-5 w-5 text-teal-300" />
            </span>
          </button>
        </div>
      ) : (
        <div className="mt-6 rounded-[1.25rem] border border-white/[0.08] bg-black/10 p-4">
          <label className="space-y-2">
            <span className="text-sm font-semibold">Custom hours</span>
            <Input
              type="number"
              inputMode="decimal"
              min="1"
              max="168"
              step="0.5"
              value={customDuration}
              onChange={(event) => setCustomDuration(event.target.value)}
              placeholder="For example, 36"
              className="h-14 rounded-2xl border-white/10 bg-black/20 text-lg"
              autoFocus
            />
          </label>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-12 rounded-2xl border-white/10" onClick={() => setShowCustom(false)}>
              Back
            </Button>
            <Button
              className="h-12 rounded-2xl bg-amber-300 font-bold text-stone-950 hover:bg-amber-200"
              onClick={() => void handleStartFast(Math.round(Number(customDuration) * 60))}
              disabled={!customDuration || Number(customDuration) < 1 || Number(customDuration) > 168 || isStarting}
            >
              {isStarting ? "Starting…" : `Start ${customDuration || "custom"}h`}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
