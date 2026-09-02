import { Cloud, Download, FileJson, ShieldCheck, Smartphone } from "lucide-react";
import { useFasting } from "@/hooks/use-fasting";
import { Button } from "@/components/ui/button";

function downloadFile(contents: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function DataExportPanel() {
  const { fasts } = useFasting();

  const exportCsv = () => {
    if (!fasts) return;
    const rows = [
      ["id", "start_time", "end_time", "target_minutes", "duration_hours"],
      ...fasts.map((fast) => {
        const start = new Date(fast.startTime);
        const end = fast.endTime ? new Date(fast.endTime) : null;
        const duration = end ? (end.getTime() - start.getTime()) / 3_600_000 : "active";
        return [fast.id, start.toISOString(), end?.toISOString() ?? "", fast.targetDuration, typeof duration === "number" ? duration.toFixed(2) : duration];
      }),
    ];
    downloadFile(rows.map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8", "fasting-history.csv");
  };

  const exportJson = () => {
    if (!fasts) return;
    downloadFile(JSON.stringify(fasts, null, 2), "application/json", "fasting-history.json");
  };

  return (
    <section className="surface p-5" aria-labelledby="tools-title">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-teal-300" />
        <div>
          <h2 id="tools-title" className="font-display text-2xl">Export your data</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Download your fasting history as CSV or JSON. The files are saved to this device.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-12 rounded-2xl border-white/10 bg-white/[0.025]" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" />
          CSV
        </Button>
        <Button variant="outline" className="h-12 rounded-2xl border-white/10 bg-white/[0.025]" onClick={exportJson}>
          <FileJson className="mr-2 h-4 w-4" />
          JSON
        </Button>
      </div>

      <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200/10 bg-amber-200/[0.035] p-4">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div>
          <p className="text-sm font-semibold">Add it to your iPhone</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            In Safari, tap Share, then Add to Home Screen. The tracker will open from your Home Screen.
          </p>
        </div>
      </div>

      <details className="settings-details">
        <summary>
          <Cloud className="h-4 w-4 text-teal-300" />
          How this tracker stores your data
        </summary>
        <div className="pt-3 text-xs leading-relaxed text-muted-foreground">
          Your signed-in tracker runs on a Cloudflare Worker and stores records in a private D1 database. Agent actions use the same safety checks and are recorded so you can see what changed.
        </div>
      </details>
    </section>
  );
}
