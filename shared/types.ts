export interface Fast {
  id: number;
  startTime: string;
  endTime: string | null;
  targetDuration: number;
}

export interface FastingExperiment {
  id: number;
  name: string;
  targetDurationMinutes: number;
  weeklyGoal: number;
  startDate: string;
  endDate: string;
  status: "active" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface SessionState {
  authenticated: boolean;
  username?: string;
  role?: "user";
  csrfToken?: string;
  mode: "production" | "demo" | "preview";
}

export interface MutationReceipt<T> {
  data: T;
  receipt: {
    requestId: string;
    auditEventId: string;
    replayed: boolean;
  };
}

export interface AuditEventSummary {
  eventId: string;
  occurredAt: string;
  actorType: "user" | "mcp" | "admin" | "system";
  origin: "web" | "mcp" | "admin" | "system";
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: "succeeded" | "rejected" | "failed";
  requestId: string;
}

export interface ApiError {
  error: string;
}
