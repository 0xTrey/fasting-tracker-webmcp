export interface AgentConfirmationRequest {
  id: string;
  message: string;
  approveLabel: string;
}

interface PendingAgentConfirmation extends AgentConfirmationRequest {
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abortHandler?: () => void;
}

export interface AgentConfirmationController {
  getSnapshot: () => AgentConfirmationRequest | null;
  subscribe: (listener: () => void) => () => void;
  request: (message: string, approveLabel: string, signal?: AbortSignal) => Promise<boolean>;
  approve: (id: string) => void;
  cancel: (id: string) => void;
}

function abortError(): Error {
  const error = new Error("The agent request ended before the user made a decision.");
  error.name = "AbortError";
  return error;
}

export function createAgentConfirmationController(): AgentConfirmationController {
  let sequence = 0;
  let snapshot: AgentConfirmationRequest | null = null;
  let pending: PendingAgentConfirmation | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const clear = (request: PendingAgentConfirmation) => {
    if (request.signal && request.abortHandler) {
      request.signal.removeEventListener("abort", request.abortHandler);
    }
    if (pending?.id !== request.id) return;
    pending = null;
    snapshot = null;
    emit();
  };

  const settle = (id: string, approved: boolean) => {
    const request = pending;
    if (!request || request.id !== id) return;
    clear(request);
    request.resolve(approved);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    request: (message, approveLabel, signal) => {
      if (pending) {
        return Promise.reject(new Error("Another agent action is already waiting for approval."));
      }
      if (signal?.aborted) return Promise.reject(abortError());

      return new Promise<boolean>((resolve, reject) => {
        const request: PendingAgentConfirmation = {
          id: `agent-confirmation-${++sequence}`,
          message,
          approveLabel,
          resolve,
          reject,
          signal,
        };
        request.abortHandler = () => {
          clear(request);
          reject(abortError());
        };
        if (signal) signal.addEventListener("abort", request.abortHandler, { once: true });
        pending = request;
        snapshot = { id: request.id, message, approveLabel };
        emit();
      });
    },
    approve: (id) => settle(id, true),
    cancel: (id) => settle(id, false),
  };
}

export const agentConfirmation = createAgentConfirmationController();
