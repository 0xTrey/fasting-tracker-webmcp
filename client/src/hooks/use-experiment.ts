import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FastingExperiment, MutationReceipt } from "@shared/types";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

export interface CreateExperimentInput {
  name: string;
  targetDurationMinutes: number;
  weeklyGoal: number;
  startDate: string;
  endDate: string;
}

async function readApiError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `${response.status}: ${response.statusText}`;
}

export function useExperiment() {
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

  const { data: experiment = null, isLoading } = useQuery<FastingExperiment | null>({
    queryKey: ["/api/experiments/active"],
    queryFn: () => request<FastingExperiment | null>("/api/experiments/active", {
      headers: { Accept: "application/json" },
    }),
    enabled: session?.authenticated === true,
  });

  const create = useMutation({
    mutationFn: async (input: CreateExperimentInput) => {
      const result = await request<MutationReceipt<FastingExperiment>>("/api/experiments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session?.csrfToken ?? "",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ ...input, confirm: true }),
      });
      return result.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/experiments/active"] }),
        queryClient.invalidateQueries({
          predicate: (query) => String(query.queryKey[0]).startsWith("/api/agent-activity"),
        }),
      ]);
      toast({ title: "Experiment created", description: "Your tracker is ready to measure it." });
    },
    onError: (caught: Error) => toast({ title: "Nothing changed", description: caught.message, variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: async (experimentId: number) => {
      const result = await request<MutationReceipt<FastingExperiment>>(`/api/experiments/${experimentId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session?.csrfToken ?? "",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ confirmExperimentId: experimentId }),
      });
      return result.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/experiments/active"] }),
        queryClient.invalidateQueries({
          predicate: (query) => String(query.queryKey[0]).startsWith("/api/agent-activity"),
        }),
      ]);
      toast({ title: "Experiment ended", description: "Your fasting history was not changed." });
    },
    onError: (caught: Error) => toast({ title: "Nothing changed", description: caught.message, variant: "destructive" }),
  });

  return {
    experiment,
    isLoading,
    createExperiment: create.mutateAsync,
    cancelExperiment: cancel.mutateAsync,
    isCreating: create.isPending,
    isCancelling: cancel.isPending,
  };
}
