import { useState } from "react";
import { format } from "date-fns";
import { Check, ChevronDown, Clock3, History } from "lucide-react";
import type { Fast } from "@shared/types";
import { useFasting } from "@/hooks/use-fasting";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function durationLabel(fast: Fast): string {
  const end = fast.endTime ? new Date(fast.endTime) : new Date();
  const totalMinutes = Math.max(0, Math.floor((end.getTime() - new Date(fast.startTime).getTime()) / 60_000));
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function FastCard({ fast }: { fast: Fast }) {
  const start = new Date(fast.startTime);
  const end = fast.endTime ? new Date(fast.endTime) : null;

  return (
    <article className="rounded-[1.15rem] border border-white/[0.07] bg-black/10 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-3xl tracking-[-0.03em]">{durationLabel(fast)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Target · {fast.targetDuration / 60} hours</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
          end ? "bg-teal-300/10 text-teal-200" : "bg-amber-300/10 text-amber-200"
        }`}>
          {end ? <Check className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
          {end ? "Complete" : "Active"}
        </span>
      </div>

      <div className="mt-4 grid gap-2 border-t border-white/[0.06] pt-4 text-sm sm:grid-cols-2">
        <p>
          <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Started</span>
          <span className="mt-1 block font-medium">{format(start, "MMM d · h:mm a")}</span>
        </p>
        <p>
          <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Ended</span>
          <span className="mt-1 block font-medium">{end ? format(end, "MMM d · h:mm a") : "Still fasting"}</span>
        </p>
      </div>
    </article>
  );
}

export function FastingLogs() {
  const { fasts } = useFasting();
  const [displayCount, setDisplayCount] = useState(25);

  if (!fasts?.length) {
    return (
      <section className="surface p-8 text-center">
        <History className="mx-auto h-7 w-7 text-muted-foreground" />
        <h2 className="mt-3 font-display text-2xl">Your history starts here.</h2>
        <p className="mt-2 text-sm text-muted-foreground">Completed fasts will appear here.</p>
      </section>
    );
  }

  const sortedFasts = [...fasts].sort((left, right) => new Date(right.startTime).getTime() - new Date(left.startTime).getTime());
  const [mostRecentFast, ...olderFasts] = sortedFasts;
  const displayedOlderFasts = olderFasts.slice(0, displayCount);
  const remaining = olderFasts.length - displayedOlderFasts.length;

  return (
    <section className="surface p-5 sm:p-7" aria-labelledby="history-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="history-title" className="font-display text-3xl tracking-[-0.02em]">Your recent fasts</h2>
        <span className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-muted-foreground">{fasts.length} fasts</span>
      </div>

      <div className="mt-5 space-y-3">
        <FastCard fast={mostRecentFast} />

        {olderFasts.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="h-12 w-full rounded-2xl border-white/10 bg-white/[0.025] text-sm">
                View all history
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              {displayedOlderFasts.map((fast) => <FastCard key={fast.id} fast={fast} />)}
              {remaining > 0 && (
                <Button variant="outline" className="h-12 w-full rounded-2xl border-white/10" onClick={() => setDisplayCount((count) => count + 25)}>
                  Show {Math.min(25, remaining)} more
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </section>
  );
}
