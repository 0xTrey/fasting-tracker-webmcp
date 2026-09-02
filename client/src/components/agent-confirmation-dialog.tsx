import { useSyncExternalStore } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { agentConfirmation } from "@/lib/agent-confirmation";

export function AgentConfirmationDialog() {
  const request = useSyncExternalStore(
    agentConfirmation.subscribe,
    agentConfirmation.getSnapshot,
    agentConfirmation.getSnapshot,
  );

  return (
    <AlertDialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open && request) agentConfirmation.cancel(request.id);
      }}
    >
      <AlertDialogContent className="w-[calc(100%-2rem)] rounded-2xl border-white/15 bg-background shadow-2xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl">Approve this agent action?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 text-left leading-relaxed">
            <span className="block text-foreground">{request?.message}</span>
            <span className="block">Nothing changes until you approve. You can cancel and keep using the tracker normally.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => request && agentConfirmation.cancel(request.id)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => request && agentConfirmation.approve(request.id)}>
            {request?.approveLabel ?? "Approve change"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
