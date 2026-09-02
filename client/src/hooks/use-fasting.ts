import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Fast, MutationReceipt } from "@shared/types";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

async function readApiError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `${response.status}: ${response.statusText}`;
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours} hours`;
}

export function useFasting() {
  const queryClient = useQueryClient();
  const { session, markExpired } = useAuth();

  const request = async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(url, { ...init, credentials: "include" });
    if (response.status === 401) {
      markExpired();
      throw new Error("Your session expired. Sign in again to continue.");
    }
    if (!response.ok) throw new Error(await readApiError(response));
    return response.json() as Promise<T>;
  };

  const mutationHeaders = (idempotencyKey: string): HeadersInit => ({
    "Content-Type": "application/json",
    "X-CSRF-Token": session?.csrfToken ?? "",
    "Idempotency-Key": idempotencyKey,
  });

  const invalidateVisibleState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/fasts"] }),
      queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("/api/agent-activity"),
      }),
    ]);
  };

  const { data: fasts, isLoading } = useQuery<Fast[]>({
    queryKey: ["/api/fasts"],
    queryFn: () => request<Fast[]>("/api/fasts", { headers: { Accept: "application/json" } }),
    enabled: session?.authenticated === true,
  });

  const startFast = useMutation({
    mutationFn: async (targetDuration: number) => {
      const idempotencyKey = crypto.randomUUID();
      const result = await request<MutationReceipt<Fast>>("/api/fasts/start", {
        method: "POST",
        headers: mutationHeaders(idempotencyKey),
        body: JSON.stringify({ targetDuration }),
      });
      return result.data;
    },
    onSuccess: async (fast) => {
      await invalidateVisibleState();
      toast({ title: "Fast started", description: `Target: ${durationLabel(fast.targetDuration)}.` });
    },
    onError: (caught: Error) => toast({ title: "Nothing changed", description: caught.message, variant: "destructive" }),
  });

  const stopFast = useMutation({
    mutationFn: async (fastId: number) => {
      const idempotencyKey = crypto.randomUUID();
      const result = await request<MutationReceipt<Fast>>("/api/fasts/stop", {
        method: "POST",
        headers: mutationHeaders(idempotencyKey),
        body: JSON.stringify({ fastId }),
      });
      return result.data;
    },
    onSuccess: async (fast) => {
      await invalidateVisibleState();
      const minutes = fast.endTime
        ? Math.max(0, Math.floor((new Date(fast.endTime).getTime() - new Date(fast.startTime).getTime()) / 60_000))
        : 0;
      toast({ title: "Fast completed", description: `Duration: ${durationLabel(minutes)}.` });
    },
    onError: (caught: Error) => toast({ title: "Nothing changed", description: caught.message, variant: "destructive" }),
  });

  const updateStartTime = useMutation({
    mutationFn: async ({ fastId, startTime }: { fastId: number; startTime: Date }) => {
      const idempotencyKey = crypto.randomUUID();
      const result = await request<MutationReceipt<Fast>>(`/api/fasts/${fastId}/start-time`, {
        method: "PATCH",
        headers: mutationHeaders(idempotencyKey),
        body: JSON.stringify({ startTime }),
      });
      return result.data;
    },
    onSuccess: async () => {
      await invalidateVisibleState();
      toast({ title: "Start time updated", description: "Target end recalculated." });
    },
    onError: (caught: Error) => toast({ title: "Nothing changed", description: caught.message, variant: "destructive" }),
  });

  return {
    fasts,
    isLoading,
    startFast: startFast.mutateAsync,
    stopFast: stopFast.mutateAsync,
    updateStartTime: updateStartTime.mutateAsync,
    isStarting: startFast.isPending,
    isStopping: stopFast.isPending,
    isUpdating: updateStartTime.isPending,
  };
}
