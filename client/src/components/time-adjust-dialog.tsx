import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface TimeAdjustDialogProps {
  trigger: React.ReactNode;
  title: string;
  description: string;
  currentTime: Date;
  onSave: (newTime: Date) => Promise<unknown>;
}

function toLocalInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function TimeAdjustDialog({ trigger, title, description, currentTime, onSave }: TimeAdjustDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(toLocalInputValue(currentTime));
  const [isSaving, setIsSaving] = useState(false);
  // The active timer creates a fresh Date every second; a primitive key keeps those
  // renders from overwriting a value while the user is editing it.
  const currentTimestamp = currentTime.getTime();

  useEffect(() => {
    if (isOpen) setValue(toLocalInputValue(new Date(currentTimestamp)));
  }, [currentTimestamp, isOpen]);

  const handleSave = async () => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    setIsSaving(true);
    try {
      await onSave(date);
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md rounded-[1.5rem] border-white/10 bg-stone-950">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-foreground/80">Fast start date and time</span>
          <Input
            type="datetime-local"
            max={toLocalInputValue(new Date())}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-14 rounded-2xl border-white/10 bg-white/[0.04]"
          />
        </label>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="rounded-xl border-white/10" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button className="rounded-xl bg-amber-300 text-stone-950 hover:bg-amber-200" onClick={() => void handleSave()} disabled={isSaving || !value}>
            {isSaving ? "Saving…" : "Save time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
