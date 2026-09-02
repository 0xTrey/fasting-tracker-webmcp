import type { AuditEventSummary, Fast, FastingExperiment, MutationReceipt } from "../shared/types";
import type { Env } from "./env";
import { AppError, canonicalJson, parseDate, sha256Base64Url } from "./http";

interface FastRow {
  id: number;
  start_time: string;
  end_time: string | null;
  target_duration: number;
  deleted_at: string | null;
}

interface ExperimentRow {
  id: number;
  name: string;
  target_duration: number;
  weekly_goal: number;
  start_date: string;
  end_date: string;
  status: FastingExperiment["status"];
  created_at: string;
  updated_at: string;
}

interface IdempotencyRow {
  request_hash: string;
  request_id: string;
  status: "processing" | "completed" | "failed";
  response_status: number | null;
  response_json: string | null;
}

export interface Actor {
  type: "user" | "mcp" | "admin" | "system";
  id: string;
  origin: "web" | "mcp" | "admin" | "system";
}

interface OperationResult<T> {
  data: T;
  status?: number;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  mutation: D1PreparedStatement;
  noChangeError: AppError;
  mapMutationError?: (caught: unknown) => AppError | null;
}

function resourceTypeForAction(action: string): string {
  return action.startsWith("experiment.") ? "experiment" : "fast";
}

export interface ActionResponse<T> {
  status: number;
  body: MutationReceipt<T>;
}

export function mapFast(row: FastRow): Fast {
  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    targetDuration: row.target_duration,
  };
}

function randomFastId(): number {
  const words = new Uint32Array(2);
  crypto.getRandomValues(words);
  const value = (BigInt(words[0] & 0x000f_ffff) << 32n) | BigInt(words[1]);
  return Number(value || 1n);
}

function activeFastConflict(caught: unknown): AppError | null {
  return caught instanceof Error && /unique|one_active_fast_idx/iu.test(caught.message)
    ? new AppError("A fast is already active", 409, "active_fast_exists")
    : null;
}

function activeExperimentConflict(caught: unknown): AppError | null {
  return caught instanceof Error && /unique|one_active_experiment_idx/iu.test(caught.message)
    ? new AppError("An experiment is already active", 409, "active_experiment_exists")
    : null;
}

function mapExperiment(row: ExperimentRow): FastingExperiment {
  return {
    id: row.id,
    name: row.name,
    targetDurationMinutes: row.target_duration,
    weeklyGoal: row.weekly_goal,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getActiveExperiment(env: Env): Promise<FastingExperiment | null> {
  const row = await env.FASTING_DB.prepare(
    `SELECT id, name, target_duration, weekly_goal, start_date, end_date, status, created_at, updated_at
     FROM fasting_experiments WHERE status = 'active' LIMIT 1`,
  ).first<ExperimentRow>();
  return row ? mapExperiment(row) : null;
}

async function getExperimentRow(env: Env, id: number): Promise<ExperimentRow | null> {
  return env.FASTING_DB.prepare(
    `SELECT id, name, target_duration, weekly_goal, start_date, end_date, status, created_at, updated_at
     FROM fasting_experiments WHERE id = ?1`,
  ).bind(id).first<ExperimentRow>();
}

function validateExperimentDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

export function createExperiment(
  env: Env,
  actor: Actor,
  input: { name: string; targetDurationMinutes: number; weeklyGoal: number; startDate: string; endDate: string; confirm: boolean },
  idempotencyKey: string | null,
): Promise<ActionResponse<FastingExperiment>> {
  if (input.confirm !== true) throw new AppError("Experiment creation requires confirmation", 400, "confirmation_required");
  const name = input.name.trim();
  if (!name || name.length > 80) throw new AppError("Experiment name must be 1 to 80 characters", 400, "invalid_experiment_name");
  if (!Number.isInteger(input.targetDurationMinutes) || input.targetDurationMinutes < 60 || input.targetDurationMinutes > 10_080) {
    throw new AppError("Choose a target between 1 hour and 7 days", 400, "invalid_target_duration");
  }
  if (!Number.isInteger(input.weeklyGoal) || input.weeklyGoal < 1 || input.weeklyGoal > 7) {
    throw new AppError("Weekly goal must be between 1 and 7 fasts", 400, "invalid_weekly_goal");
  }
  const startDate = validateExperimentDate(input.startDate);
  const endDate = validateExperimentDate(input.endDate);
  if (!startDate || !endDate) throw new AppError("Use valid ISO dates (YYYY-MM-DD)", 400, "invalid_experiment_dates");
  const spanDays = (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000;
  if (spanDays < 0) throw new AppError("End date must follow start date", 400, "invalid_experiment_range");
  if (spanDays > 366) throw new AppError("Experiments can run for at most 367 days", 400, "experiment_range_too_large");
  return executeIdempotent(env, actor, "experiment.create", idempotencyKey, input, async () => {
    const existing = await getActiveExperiment(env);
    if (existing) throw new AppError("An experiment is already active", 409, "active_experiment_exists");
    const now = new Date().toISOString();
    const id = randomFastId();
    const experiment: FastingExperiment = { id, name, targetDurationMinutes: input.targetDurationMinutes, weeklyGoal: input.weeklyGoal, startDate, endDate, status: "active", createdAt: now, updatedAt: now };
    return {
      data: experiment,
      status: 201,
      resourceId: String(id),
      after: experiment,
      mutation: env.FASTING_DB.prepare(
        `INSERT INTO fasting_experiments (id, name, target_duration, weekly_goal, start_date, end_date, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, ?7)`,
      ).bind(id, name, input.targetDurationMinutes, input.weeklyGoal, startDate, endDate, now),
      noChangeError: new AppError("The experiment could not be created", 409, "experiment_state_changed"),
      mapMutationError: activeExperimentConflict,
    };
  });
}

export function cancelExperiment(
  env: Env,
  actor: Actor,
  experimentId: number,
  input: { confirmExperimentId: number },
  idempotencyKey: string | null,
): Promise<ActionResponse<FastingExperiment>> {
  if (input.confirmExperimentId !== experimentId) {
    throw new AppError("Experiment id confirmation did not match", 400, "confirmation_mismatch");
  }
  return executeIdempotent(env, actor, "experiment.cancel", idempotencyKey, { experimentId }, async () => {
    const row = await getExperimentRow(env, experimentId);
    if (!row) throw new AppError("Experiment not found", 404, "experiment_not_found");
    if (row.status !== "active") throw new AppError("That experiment is not active", 409, "experiment_not_active");
    const before = mapExperiment(row);
    const updatedAt = new Date().toISOString();
    const experiment: FastingExperiment = { ...before, status: "cancelled", updatedAt };
    return {
      data: experiment,
      resourceId: String(experimentId),
      before,
      after: experiment,
      mutation: env.FASTING_DB.prepare(
        `UPDATE fasting_experiments SET status = 'cancelled', updated_at = ?1
         WHERE id = ?2 AND status = 'active'`,
      ).bind(updatedAt, experimentId),
      noChangeError: new AppError("That experiment changed before it could be cancelled", 409, "experiment_state_changed"),
    };
  });
}

async function auditRejectedAttempt(
  env: Env,
  actor: Actor,
  action: string,
  requestId: string,
  auditEventId: string,
  idempotencyKey: string,
  code: string,
): Promise<void> {
  try {
    await env.FASTING_DB.prepare(
      `INSERT INTO audit_events
        (event_id, occurred_at, actor_type, actor_id, origin, action, resource_type,
         request_id, idempotency_key, outcome, metadata_json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'rejected', ?10)`,
    ).bind(
      auditEventId,
      new Date().toISOString(),
      actor.type,
      actor.id,
      actor.origin,
      action,
      resourceTypeForAction(action),
      requestId,
      idempotencyKey,
      JSON.stringify({ code }),
    ).run();
  } catch (auditError) {
    console.error("Failed to record rejected idempotency attempt", auditError);
  }
}

function validateIdempotencyKey(value: string | null): string {
  if (!value || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(value)) {
    throw new AppError("A valid Idempotency-Key is required", 400, "idempotency_key_required");
  }
  return value;
}

async function getFastRow(env: Env, id: number): Promise<FastRow | null> {
  return env.FASTING_DB.prepare(
    `SELECT id, start_time, end_time, target_duration, deleted_at
     FROM fasts WHERE id = ?1 AND deleted_at IS NULL`,
  ).bind(id).first<FastRow>();
}

export async function executeIdempotent<T>(
  env: Env,
  actor: Actor,
  action: string,
  rawIdempotencyKey: string | null,
  payload: unknown,
  operation: () => Promise<OperationResult<T>>,
): Promise<ActionResponse<T>> {
  const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey);
  const requestHash = await sha256Base64Url(canonicalJson({ action, payload }));
  const requestId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    await env.FASTING_DB.prepare("DELETE FROM idempotency_keys WHERE expires_at <= ?1")
      .bind(now.toISOString())
      .run();
    await env.FASTING_DB.prepare(
      `INSERT INTO idempotency_keys
        (actor_id, action, idempotency_key, request_hash, request_id, status, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'processing', ?6, ?7)`,
    ).bind(actor.id, action, idempotencyKey, requestHash, requestId, now.toISOString(), expiresAt).run();
  } catch (caught) {
    const existing = await env.FASTING_DB.prepare(
      `SELECT request_hash, request_id, status, response_status, response_json
       FROM idempotency_keys WHERE actor_id = ?1 AND action = ?2 AND idempotency_key = ?3`,
    ).bind(actor.id, action, idempotencyKey).first<IdempotencyRow>();
    if (!existing) throw caught;
    if (existing.request_hash !== requestHash) {
      await auditRejectedAttempt(
        env,
        actor,
        action,
        requestId,
        auditEventId,
        idempotencyKey,
        "idempotency_key_reused",
      );
      throw new AppError("That idempotency key was already used for different input", 409, "idempotency_key_reused");
    }
    if (existing.status === "processing") {
      await auditRejectedAttempt(
        env,
        actor,
        action,
        requestId,
        auditEventId,
        idempotencyKey,
        "operation_in_progress",
      );
      throw new AppError("That operation is still being processed", 409, "operation_in_progress");
    }
    if (!existing.response_json || !existing.response_status) throw caught;
    const stored = JSON.parse(existing.response_json) as MutationReceipt<T> | { error: string; code: string };
    if (existing.status === "failed") {
      const failure = stored as { error: string; code: string };
      throw new AppError(failure.error, existing.response_status, failure.code);
    }
    const receipt = stored as MutationReceipt<T>;
    receipt.receipt.replayed = true;
    return { status: existing.response_status, body: receipt };
  }

  let result: OperationResult<T> | null = null;
  try {
    result = await operation();
    const status = result.status ?? 200;
    const body: MutationReceipt<T> = {
      data: result.data,
      receipt: { requestId, auditEventId, replayed: false },
    };
    const [mutationResult] = await env.FASTING_DB.batch([
      result.mutation,
      env.FASTING_DB.prepare(
        `INSERT INTO audit_events
          (event_id, occurred_at, actor_type, actor_id, origin, action, resource_type, resource_id,
           request_id, idempotency_key, outcome, before_json, after_json, metadata_json)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'succeeded', ?11, ?12, ?13
         WHERE changes() = 1`,
      ).bind(
        auditEventId,
        new Date().toISOString(),
        actor.type,
        actor.id,
        actor.origin,
        action,
        resourceTypeForAction(action),
        result.resourceId ?? null,
        requestId,
        idempotencyKey,
        result.before === undefined ? null : JSON.stringify(result.before),
        result.after === undefined ? null : JSON.stringify(result.after),
        result.metadata === undefined ? null : JSON.stringify(result.metadata),
      ),
      env.FASTING_DB.prepare(
        `UPDATE idempotency_keys
         SET status = 'completed', response_status = ?1, response_json = ?2
         WHERE actor_id = ?3 AND action = ?4 AND idempotency_key = ?5 AND changes() = 1`,
      ).bind(status, JSON.stringify(body), actor.id, action, idempotencyKey),
    ]);
    if (!mutationResult.meta.changes) throw result.noChangeError;
    return { status, body };
  } catch (caught) {
    const appError = caught instanceof AppError
      ? caught
      : result?.mapMutationError?.(caught)
        ?? new AppError("The tracker hit an unexpected error", 500, "unexpected_error");
    const failure = { error: appError.message, code: appError.code };
    try {
      await env.FASTING_DB.batch([
        env.FASTING_DB.prepare(
          `UPDATE idempotency_keys
           SET status = 'failed', response_status = ?1, response_json = ?2
           WHERE actor_id = ?3 AND action = ?4 AND idempotency_key = ?5`,
        ).bind(appError.status, JSON.stringify(failure), actor.id, action, idempotencyKey),
        env.FASTING_DB.prepare(
          `INSERT INTO audit_events
            (event_id, occurred_at, actor_type, actor_id, origin, action, resource_type,
             request_id, idempotency_key, outcome, metadata_json)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        ).bind(
          auditEventId,
          new Date().toISOString(),
          actor.type,
          actor.id,
          actor.origin,
          action,
          resourceTypeForAction(action),
          requestId,
          idempotencyKey,
          appError.status < 500 ? "rejected" : "failed",
          JSON.stringify({ code: appError.code }),
        ),
      ]);
    } catch (auditError) {
      console.error("Failed to record rejected operation", auditError);
    }
    throw appError;
  }
}

export async function listFasts(env: Env, limit?: number): Promise<Fast[]> {
  const boundedLimit = limit === undefined ? null : Math.max(1, Math.min(100, Math.floor(limit)));
  const statement = boundedLimit
    ? env.FASTING_DB.prepare(
      `SELECT id, start_time, end_time, target_duration, deleted_at
       FROM fasts WHERE deleted_at IS NULL ORDER BY start_time DESC LIMIT ?1`,
    ).bind(boundedLimit)
    : env.FASTING_DB.prepare(
      `SELECT id, start_time, end_time, target_duration, deleted_at
       FROM fasts WHERE deleted_at IS NULL ORDER BY start_time ASC`,
    );
  const result = await statement.all<FastRow>();
  return result.results.map(mapFast);
}

export async function getCurrentFast(env: Env): Promise<Fast | null> {
  const row = await env.FASTING_DB.prepare(
    `SELECT id, start_time, end_time, target_duration, deleted_at
     FROM fasts WHERE end_time IS NULL AND deleted_at IS NULL LIMIT 1`,
  ).first<FastRow>();
  return row ? mapFast(row) : null;
}

export async function getFastingSummary(env: Env, days = 30): Promise<Record<string, number | null>> {
  const boundedDays = Math.max(1, Math.min(365, Math.floor(days)));
  const since = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000).toISOString();
  const row = await env.FASTING_DB.prepare(
    `SELECT
       COUNT(*) AS completed_count,
       ROUND(AVG((julianday(end_time) - julianday(start_time)) * 24), 2) AS average_hours,
       ROUND(MAX((julianday(end_time) - julianday(start_time)) * 24), 2) AS longest_hours
     FROM fasts
     WHERE deleted_at IS NULL AND end_time IS NOT NULL AND end_time >= ?1`,
  ).bind(since).first<{ completed_count: number; average_hours: number | null; longest_hours: number | null }>();
  return {
    days: boundedDays,
    completedCount: row?.completed_count ?? 0,
    averageHours: row?.average_hours ?? null,
    longestHours: row?.longest_hours ?? null,
  };
}

export function startFast(
  env: Env,
  actor: Actor,
  targetDuration: number,
  idempotencyKey: string | null,
): Promise<ActionResponse<Fast>> {
  return executeIdempotent(env, actor, "fast.start", idempotencyKey, { targetDuration }, async () => {
    const id = randomFastId();
    const startTime = new Date().toISOString();
    const fast: Fast = { id, startTime, endTime: null, targetDuration };
    return {
      data: fast,
      status: 201,
      resourceId: String(id),
      after: fast,
      mutation: env.FASTING_DB.prepare(
        `INSERT INTO fasts (id, start_time, end_time, target_duration, updated_at)
         VALUES (?1, ?2, NULL, ?3, ?2)`,
      ).bind(id, startTime, targetDuration),
      noChangeError: new AppError("The fast could not be started", 409, "fast_state_changed"),
      mapMutationError: activeFastConflict,
    };
  });
}

export function stopFast(
  env: Env,
  actor: Actor,
  fastId: number,
  idempotencyKey: string | null,
): Promise<ActionResponse<Fast>> {
  return executeIdempotent(env, actor, "fast.stop", idempotencyKey, { fastId }, async () => {
    const before = await getFastRow(env, fastId);
    if (!before) throw new AppError("Fast not found", 404, "fast_not_found");
    if (before.end_time) throw new AppError("That fast is already complete", 409, "fast_already_complete");
    const endTime = new Date().toISOString();
    if (endTime < before.start_time) {
      throw new AppError("The start time is in the future; adjust it before stopping", 409, "future_start_time");
    }
    const fast: Fast = { ...mapFast(before), endTime };
    return {
      data: fast,
      resourceId: String(fastId),
      before: mapFast(before),
      after: fast,
      mutation: env.FASTING_DB.prepare(
        `UPDATE fasts SET end_time = ?1, updated_at = ?1
         WHERE id = ?2 AND start_time = ?3 AND end_time IS NULL AND deleted_at IS NULL`,
      ).bind(endTime, fastId, before.start_time),
      noChangeError: new AppError("That fast changed before it could be stopped", 409, "fast_state_changed"),
    };
  });
}

export function adjustActiveFastStart(
  env: Env,
  actor: Actor,
  fastId: number,
  rawStartTime: string,
  idempotencyKey: string | null,
): Promise<ActionResponse<Fast>> {
  const startTime = parseDate(rawStartTime);
  if (!startTime) throw new AppError("A valid start time is required", 400, "invalid_start_time");
  if (Date.parse(startTime) > Date.now()) {
    throw new AppError("Start time cannot be in the future", 400, "future_start_time");
  }
  return executeIdempotent(env, actor, "fast.adjust_active_start", idempotencyKey, { fastId, startTime }, async () => {
    const before = await getFastRow(env, fastId);
    if (!before) throw new AppError("Fast not found", 404, "fast_not_found");
    if (before.end_time) {
      throw new AppError("Historical edits require the admin API", 403, "historical_edit_admin_only");
    }
    const fast: Fast = { ...mapFast(before), startTime };
    return {
      data: fast,
      resourceId: String(fastId),
      before: mapFast(before),
      after: fast,
      mutation: env.FASTING_DB.prepare(
        `UPDATE fasts SET start_time = ?1, updated_at = ?2
         WHERE id = ?3 AND start_time = ?4 AND end_time IS NULL AND deleted_at IS NULL`,
      ).bind(startTime, new Date().toISOString(), fastId, before.start_time),
      noChangeError: new AppError("That fast changed before it could be adjusted", 409, "fast_state_changed"),
    };
  });
}

export function adminEditFast(
  env: Env,
  actor: Actor,
  fastId: number,
  input: { startTime?: string; endTime?: string | null; reason: string; confirmFastId: number },
  idempotencyKey: string | null,
): Promise<ActionResponse<Fast>> {
  if (input.confirmFastId !== fastId) throw new AppError("Fast id confirmation did not match", 400, "confirmation_mismatch");
  if (!input.reason.trim() || input.reason.length > 500) throw new AppError("An admin reason is required", 400, "admin_reason_required");
  return executeIdempotent(env, actor, "admin.fast.edit", idempotencyKey, input, async () => {
    const before = await getFastRow(env, fastId);
    if (!before) throw new AppError("Fast not found", 404, "fast_not_found");
    const startTime = input.startTime === undefined ? before.start_time : parseDate(input.startTime);
    const endTime = input.endTime === undefined
      ? before.end_time
      : input.endTime === null ? null : parseDate(input.endTime);
    if (!startTime || (input.endTime !== undefined && input.endTime !== null && !endTime)) {
      throw new AppError("Valid start and end times are required", 400, "invalid_fast_time");
    }
    if (endTime && endTime < startTime) throw new AppError("End time must follow start time", 400, "invalid_fast_range");
    const fast: Fast = { ...mapFast(before), startTime, endTime };
    return {
      data: fast,
      resourceId: String(fastId),
      before: mapFast(before),
      after: fast,
      metadata: { reason: input.reason.trim() },
      mutation: env.FASTING_DB.prepare(
        `UPDATE fasts SET start_time = ?1, end_time = ?2, updated_at = ?3
         WHERE id = ?4 AND start_time = ?5 AND end_time IS ?6 AND deleted_at IS NULL`,
      ).bind(startTime, endTime, new Date().toISOString(), fastId, before.start_time, before.end_time),
      noChangeError: new AppError("That fast changed before it could be edited", 409, "fast_state_changed"),
      mapMutationError: activeFastConflict,
    };
  });
}

export function adminDeleteFast(
  env: Env,
  actor: Actor,
  fastId: number,
  input: { reason: string; confirmFastId: number },
  idempotencyKey: string | null,
): Promise<ActionResponse<{ deleted: true; fastId: number }>> {
  if (input.confirmFastId !== fastId) throw new AppError("Fast id confirmation did not match", 400, "confirmation_mismatch");
  if (!input.reason.trim() || input.reason.length > 500) throw new AppError("An admin reason is required", 400, "admin_reason_required");
  return executeIdempotent(env, actor, "admin.fast.delete", idempotencyKey, input, async () => {
    const before = await getFastRow(env, fastId);
    if (!before) throw new AppError("Fast not found", 404, "fast_not_found");
    const deletedAt = new Date().toISOString();
    return {
      data: { deleted: true as const, fastId },
      resourceId: String(fastId),
      before: mapFast(before),
      after: { deletedAt },
      metadata: { reason: input.reason.trim() },
      mutation: env.FASTING_DB.prepare(
        `UPDATE fasts SET deleted_at = ?1, deleted_by = ?2, deletion_reason = ?3, updated_at = ?1
         WHERE id = ?4 AND start_time = ?5 AND end_time IS ?6 AND deleted_at IS NULL`,
      ).bind(deletedAt, actor.id, input.reason.trim(), fastId, before.start_time, before.end_time),
      noChangeError: new AppError("That fast changed before it could be deleted", 409, "fast_state_changed"),
    };
  });
}

export async function listAuditEvents(env: Env, limit = 100): Promise<AuditEventSummary[]> {
  const result = await env.FASTING_DB.prepare(
    `SELECT event_id, occurred_at, actor_type, origin, action, resource_type, resource_id, outcome, request_id
     FROM audit_events ORDER BY occurred_at DESC LIMIT ?1`,
  ).bind(Math.max(1, Math.min(500, Math.floor(limit)))).all<{
    event_id: string;
    occurred_at: string;
    actor_type: AuditEventSummary["actorType"];
    origin: AuditEventSummary["origin"];
    action: string;
    resource_type: string;
    resource_id: string | null;
    outcome: AuditEventSummary["outcome"];
    request_id: string;
  }>();
  return result.results.map((row) => ({
    eventId: row.event_id,
    occurredAt: row.occurred_at,
    actorType: row.actor_type,
    origin: row.origin,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    outcome: row.outcome,
    requestId: row.request_id,
  }));
}

export async function listTrackerActivity(env: Env, limit = 25): Promise<AuditEventSummary[]> {
  const boundedLimit = Math.max(1, Math.min(25, Math.floor(limit)));
  const result = await env.FASTING_DB.prepare(
    `SELECT event_id, occurred_at, actor_type, origin, action, resource_type, resource_id, outcome, request_id
     FROM audit_events
     WHERE resource_type = 'fast' AND origin IN ('web', 'mcp')
     ORDER BY occurred_at DESC LIMIT ?1`,
  ).bind(boundedLimit).all<{
    event_id: string;
    occurred_at: string;
    actor_type: AuditEventSummary["actorType"];
    origin: AuditEventSummary["origin"];
    action: string;
    resource_type: string;
    resource_id: string | null;
    outcome: AuditEventSummary["outcome"];
    request_id: string;
  }>();
  return result.results.map((row) => ({
    eventId: row.event_id,
    occurredAt: row.occurred_at,
    actorType: row.actor_type,
    origin: row.origin,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    outcome: row.outcome,
    requestId: row.request_id,
  }));
}
