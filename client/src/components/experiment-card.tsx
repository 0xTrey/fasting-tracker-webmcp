import { useState, type FormEvent } from "react";
import type { Fast, FastingExperiment } from "@shared/types";
import type { CreateExperimentInput } from "@/hooks/use-experiment";

function dateOnly(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function inputClasses(): string {
  return "mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black/15 px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20";
}

export function ExperimentCard({ experiment, fasts, onCreate, onCancel, isBusy = false }: {
  experiment: FastingExperiment | null;
  fasts: Fast[];
  onCreate?: (input: CreateExperimentInput) => Promise<unknown>;
  onCancel?: (experimentId: number) => Promise<unknown>;
  isBusy?: boolean;
}) {
  const today = new Date();
  const fourWeeksFromNow = new Date(today.getTime() + 27 * 86_400_000);
  const [name, setName] = useState("Four-week consistency");
  const [targetHours, setTargetHours] = useState(16);
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [startDate, setStartDate] = useState(today.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(fourWeeksFromNow.toISOString().slice(0, 10));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!onCreate) return;
    await onCreate({ name, targetDurationMinutes: Math.round(targetHours * 60), weeklyGoal, startDate, endDate });
  };

  if (!experiment) return <section className="surface p-5 sm:p-6"><h2 className="font-display text-2xl">Create a tracking experiment</h2><p className="mt-2 text-sm text-muted-foreground">Choose the target. The tracker will measure it without interpreting health outcomes.</p>{onCreate ? <form className="mt-5 grid gap-3" onSubmit={(event) => void submit(event)}><label className="text-xs font-semibold text-muted-foreground">Name<input className={inputClasses()} value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} /></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-muted-foreground">Target hours<input className={inputClasses()} type="number" min={1} max={168} step={0.5} value={targetHours} onChange={(event) => setTargetHours(Number(event.target.value))} /></label><label className="text-xs font-semibold text-muted-foreground">Fasts per week<input className={inputClasses()} type="number" min={1} max={7} value={weeklyGoal} onChange={(event) => setWeeklyGoal(Number(event.target.value))} /></label></div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-muted-foreground">Starts<input className={inputClasses()} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="text-xs font-semibold text-muted-foreground">Ends<input className={inputClasses()} type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div><button type="submit" disabled={isBusy} className="mt-1 min-h-12 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60">{isBusy ? "Creating experiment…" : "Create experiment"}</button></form> : <div className="mt-5 rounded-2xl border border-dashed border-white/15 p-4 text-sm text-muted-foreground">Example: “Track three weekday fasts this week.”</div>}</section>;
  const startsAt = dateOnly(experiment.startDate);
  const endsAt = dateOnly(experiment.endDate) + 86_399_999;
  const totalDays = Math.max(1, Math.floor((dateOnly(experiment.endDate) - startsAt) / 86_400_000) + 1);
  const totalGoal = Math.max(experiment.weeklyGoal, Math.ceil(totalDays / 7) * experiment.weeklyGoal);
  const qualifying = fasts.filter((fast) => {
    if (!fast.endTime) return false;
    const endedAt = Date.parse(fast.endTime);
    const duration = endedAt - Date.parse(fast.startTime);
    return endedAt >= startsAt && endedAt <= endsAt && duration >= experiment.targetDurationMinutes * 60_000;
  }).length;
  const progress = Math.min(100, Math.round((qualifying / totalGoal) * 100));
  const configuredTargetHours = experiment.targetDurationMinutes / 60;
  return <section className="surface p-5 sm:p-6" aria-labelledby="experiment-title"><div className="flex items-start justify-between gap-4"><div><h2 id="experiment-title" className="font-display text-2xl">{experiment.name}</h2><p className="mt-1 text-sm text-muted-foreground">{experiment.weeklyGoal} fasts each week at {Number.isInteger(configuredTargetHours) ? configuredTargetHours : configuredTargetHours.toFixed(1)} hours</p></div><span className="rounded-full bg-teal-300/10 px-3 py-1 text-xs font-bold text-teal-200">{progress}%</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex flex-wrap justify-between gap-2 text-sm text-muted-foreground"><span>{qualifying} of {totalGoal} target fasts</span><span>{experiment.startDate} to {experiment.endDate}</span></div>{onCancel && <button type="button" disabled={isBusy} onClick={() => { if (window.confirm(`End “${experiment.name}”? Your fasting history will stay unchanged.`)) void onCancel(experiment.id); }} className="mt-5 min-h-11 text-xs font-semibold text-muted-foreground underline decoration-white/20 underline-offset-4 transition hover:text-foreground disabled:opacity-50">End experiment</button>}</section>;
}
