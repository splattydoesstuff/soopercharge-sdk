import type pg from "pg";
import { getPool } from "../db.js";

export type SessionStatus = "active" | "closed";
export type SessionMessageRole = "user" | "assistant";

export interface SessionRecord {
  id: string;
  startedAt: string;
  touchedAt: string;
  endedAt: string | null;
  summary: string | null;
  status: SessionStatus;
}

export interface SessionSummary extends SessionRecord {
  messageCount: number;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: SessionMessageRole;
  content: string;
  evidenceUri: string | null;
  createdAt: string;
}

export interface SessionRepository {
  ensureSchema(): Promise<void>;
  findLatestActive(): Promise<SessionRecord | null>;
  createSession(id: string): Promise<SessionRecord>;
  touchSession(id: string): Promise<SessionRecord | null>;
  closeSession(id: string, summary?: string | null): Promise<void>;
  updateSessionSummary(id: string, summary: string): Promise<void>;
  addMessage(input: {
    id: string;
    sessionId: string;
    role: SessionMessageRole;
    content: string;
    evidenceUri?: string | null;
  }): Promise<SessionMessage>;
  getMessages(sessionId: string, options?: { limit?: number; offset?: number }): Promise<SessionMessage[]>;
  getRecentMessages(sessionId: string, maxMessages: number): Promise<SessionMessage[]>;
  listSessions(options?: { limit?: number; offset?: number }): Promise<SessionSummary[]>;
  getLatestClosedSummary(): Promise<string | null>;
}

export class PostgresSessionRepository implements SessionRepository {
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly providedPool?: pg.Pool) {}

  private get pool(): pg.Pool {
    return this.providedPool ?? getPool();
  }

  async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        touched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ended_at TIMESTAMPTZ,
        summary TEXT,
        status TEXT NOT NULL DEFAULT 'active'
      );

      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS touched_at TIMESTAMPTZ NOT NULL DEFAULT now();
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS summary TEXT;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

      CREATE TABLE IF NOT EXISTS session_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        evidence_uri TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status_touched
        ON sessions(status, touched_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_session
        ON session_messages(session_id, created_at);
    `).then(() => undefined);

    return this.schemaReady;
  }

  async findLatestActive(): Promise<SessionRecord | null> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT id, started_at, touched_at, ended_at, summary, status
       FROM sessions
       WHERE status = 'active'
       ORDER BY touched_at DESC
       LIMIT 1`
    );

    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async createSession(id: string): Promise<SessionRecord> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `INSERT INTO sessions (id)
       VALUES ($1)
       RETURNING id, started_at, touched_at, ended_at, summary, status`,
      [id]
    );

    return mapSession(result.rows[0]);
  }

  async touchSession(id: string): Promise<SessionRecord | null> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `UPDATE sessions
       SET touched_at = now()
       WHERE id = $1 AND status = 'active'
       RETURNING id, started_at, touched_at, ended_at, summary, status`,
      [id]
    );

    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async closeSession(id: string, summary?: string | null): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `UPDATE sessions
       SET status = 'closed',
           ended_at = COALESCE(ended_at, now()),
           summary = COALESCE($2, summary)
       WHERE id = $1`,
      [id, summary ?? null]
    );
  }

  async updateSessionSummary(id: string, summary: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query("UPDATE sessions SET summary = $2 WHERE id = $1", [id, summary]);
  }

  async addMessage(input: {
    id: string;
    sessionId: string;
    role: SessionMessageRole;
    content: string;
    evidenceUri?: string | null;
  }): Promise<SessionMessage> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `INSERT INTO session_messages (id, session_id, role, content, evidence_uri)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, session_id, role, content, evidence_uri, created_at`,
      [input.id, input.sessionId, input.role, input.content, input.evidenceUri ?? null]
    );

    await this.touchSession(input.sessionId);
    return mapMessage(result.rows[0]);
  }

  async getMessages(
    sessionId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<SessionMessage[]> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT id, session_id, role, content, evidence_uri, created_at
       FROM session_messages
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [sessionId, normalizeLimit(options.limit, 200), normalizeOffset(options.offset)]
    );

    return result.rows.map(mapMessage);
  }

  async getRecentMessages(sessionId: string, maxMessages: number): Promise<SessionMessage[]> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT id, session_id, role, content, evidence_uri, created_at
       FROM (
         SELECT id, session_id, role, content, evidence_uri, created_at
         FROM session_messages
         WHERE session_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       ) recent
       ORDER BY created_at ASC`,
      [sessionId, normalizeLimit(maxMessages, 20)]
    );

    return result.rows.map(mapMessage);
  }

  async listSessions(options: { limit?: number; offset?: number } = {}): Promise<SessionSummary[]> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT
         s.id,
         s.started_at,
         s.touched_at,
         s.ended_at,
         s.summary,
         s.status,
         COUNT(m.id)::int AS message_count
       FROM sessions s
       LEFT JOIN session_messages m ON m.session_id = s.id
       GROUP BY s.id
       ORDER BY s.touched_at DESC
       LIMIT $1 OFFSET $2`,
      [normalizeLimit(options.limit, 50), normalizeOffset(options.offset)]
    );

    return result.rows.map((row) => ({
      ...mapSession(row),
      messageCount: Number(row.message_count || 0),
    }));
  }

  async getLatestClosedSummary(): Promise<string | null> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT summary
       FROM sessions
       WHERE status = 'closed' AND summary IS NOT NULL AND summary <> ''
       ORDER BY ended_at DESC NULLS LAST, touched_at DESC
       LIMIT 1`
    );

    return result.rows[0]?.summary ?? null;
  }
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value || fallback), 1), 500);
}

function normalizeOffset(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(Math.trunc(value || 0), 0);
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapSession(row: any): SessionRecord {
  return {
    id: row.id,
    startedAt: toIso(row.started_at) || new Date().toISOString(),
    touchedAt: toIso(row.touched_at) || new Date().toISOString(),
    endedAt: toIso(row.ended_at),
    summary: row.summary ?? null,
    status: row.status,
  };
}

function mapMessage(row: any): SessionMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    evidenceUri: row.evidence_uri ?? null,
    createdAt: toIso(row.created_at) || new Date().toISOString(),
  };
}
