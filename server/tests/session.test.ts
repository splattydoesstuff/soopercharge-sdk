import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createSessionRoutes } from "../src/routes/session.js";
import { DefaultSessionService, type SessionService } from "../src/session/service.js";
import type {
  SessionMessage,
  SessionRecord,
  SessionRepository,
  SessionSummary,
} from "../src/session/repository.js";

function buildSessionService(): SessionService & { calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    async touch() {
      calls.push({ type: "touch" });
      return { sessionId: "sess_test", isNew: true, previousSummary: "上一段摘要" };
    },
    async addMessage(input) {
      calls.push({ type: "addMessage", input });
      return { messageId: "msg_test" };
    },
    async listSessions(options) {
      calls.push({ type: "listSessions", options });
      return {
        sessions: [
          {
            id: "sess_test",
            startedAt: "2026-06-28T00:00:00.000Z",
            touchedAt: "2026-06-28T00:00:01.000Z",
            endedAt: null,
            summary: null,
            status: "active",
            messageCount: 1,
          },
        ],
      };
    },
    async getMessages(sessionId, options) {
      calls.push({ type: "getMessages", sessionId, options });
      return {
        messages: [
          {
            id: "msg_test",
            sessionId,
            role: "user",
            content: "你好",
            evidenceUri: null,
            createdAt: "2026-06-28T00:00:00.000Z",
          },
        ],
      };
    },
    async getRecentMessages() {
      return [];
    },
  };
}

test("session routes expose touch, message, list, and messages APIs", async () => {
  const sessionService = buildSessionService();
  const server = Fastify({ logger: false });
  await server.register(createSessionRoutes({ sessionService }), { prefix: "/api/session" });

  try {
    const touch = await server.inject({ method: "POST", url: "/api/session/touch", payload: {} });
    assert.equal(touch.statusCode, 200);
    assert.deepEqual(touch.json(), {
      sessionId: "sess_test",
      isNew: true,
      previousSummary: "上一段摘要",
    });

    const message = await server.inject({
      method: "POST",
      url: "/api/session/sess_test/message",
      payload: { role: "assistant", content: "你好", evidenceUri: "http://example.test/a.png" },
    });
    assert.equal(message.statusCode, 200);
    assert.deepEqual(message.json(), { messageId: "msg_test" });

    const list = await server.inject({ method: "GET", url: "/api/session/list?limit=10&offset=2" });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().sessions[0].id, "sess_test");

    const messages = await server.inject({
      method: "GET",
      url: "/api/session/sess_test/messages?limit=20",
    });
    assert.equal(messages.statusCode, 200);
    assert.equal(messages.json().messages[0].content, "你好");

    assert.deepEqual(sessionService.calls, [
      { type: "touch" },
      {
        type: "addMessage",
        input: {
          sessionId: "sess_test",
          role: "assistant",
          content: "你好",
          evidenceUri: "http://example.test/a.png",
        },
      },
      { type: "listSessions", options: { limit: 10, offset: 2 } },
      { type: "getMessages", sessionId: "sess_test", options: { limit: 20, offset: undefined } },
    ]);
  } finally {
    await server.close();
  }
});

test("session message route validates role and content", async () => {
  const server = Fastify({ logger: false });
  await server.register(createSessionRoutes({ sessionService: buildSessionService() }), {
    prefix: "/api/session",
  });

  try {
    const badRole = await server.inject({
      method: "POST",
      url: "/api/session/sess_test/message",
      payload: { role: "system", content: "x" },
    });
    assert.equal(badRole.statusCode, 400);
    assert.deepEqual(badRole.json(), { error: "role must be user or assistant" });

    const missingContent = await server.inject({
      method: "POST",
      url: "/api/session/sess_test/message",
      payload: { role: "user" },
    });
    assert.equal(missingContent.statusCode, 400);
    assert.deepEqual(missingContent.json(), { error: "content is required" });
  } finally {
    await server.close();
  }
});

test("session service closes timed-out sessions and writes summary memory", async () => {
  const repository = new InMemorySessionRepository();
  repository.sessions.set("sess_old", {
    id: "sess_old",
    startedAt: "2026-06-28T00:00:00.000Z",
    touchedAt: "2026-06-28T00:00:00.000Z",
    endedAt: null,
    summary: null,
    status: "active",
  });
  repository.messages.set("sess_old", [
    {
      id: "msg_old_1",
      sessionId: "sess_old",
      role: "user",
      content: "钥匙在玄关",
      evidenceUri: null,
      createdAt: "2026-06-28T00:00:01.000Z",
    },
  ]);

  const summaryMemoryCalls: Array<{ summary: string; sessionId: string }> = [];
  const backgroundErrors: unknown[] = [];
  const service = new DefaultSessionService(repository, {
    timeoutMs: 1,
    generateSummary: async () => "用户说钥匙在玄关",
    addSummaryMemory: async (summary, sessionId) => {
      summaryMemoryCalls.push({ summary, sessionId });
    },
    onBackgroundError: (error) => backgroundErrors.push(error),
  });

  const result = await service.touch();

  assert.equal(result.isNew, true);
  assert.notEqual(result.sessionId, "sess_old");
  await repository.waitForSummary("sess_old");
  assert.equal(repository.sessions.get("sess_old")?.status, "closed");
  assert.equal(repository.sessions.get("sess_old")?.summary, "用户说钥匙在玄关");
  assert.deepEqual(summaryMemoryCalls, [
    { summary: "用户说钥匙在玄关", sessionId: "sess_old" },
  ]);
  assert.deepEqual(backgroundErrors, []);
});

class InMemorySessionRepository implements SessionRepository {
  sessions = new Map<string, SessionRecord>();
  messages = new Map<string, SessionMessage[]>();
  private summaryWaiters = new Map<string, Array<() => void>>();

  async ensureSchema(): Promise<void> {}

  async findLatestActive(): Promise<SessionRecord | null> {
    return [...this.sessions.values()]
      .filter((session) => session.status === "active")
      .sort((a, b) => Date.parse(b.touchedAt) - Date.parse(a.touchedAt))[0] ?? null;
  }

  async createSession(id: string): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id,
      startedAt: now,
      touchedAt: now,
      endedAt: null,
      summary: null,
      status: "active",
    };
    this.sessions.set(id, session);
    return session;
  }

  async touchSession(id: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    if (!session || session.status !== "active") return null;
    session.touchedAt = new Date().toISOString();
    return session;
  }

  async closeSession(id: string, summary?: string | null): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    session.status = "closed";
    session.endedAt = new Date().toISOString();
    session.summary = summary ?? session.summary;
  }

  async updateSessionSummary(id: string, summary: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    session.summary = summary;
    const waiters = this.summaryWaiters.get(id) ?? [];
    this.summaryWaiters.delete(id);
    waiters.forEach((resolve) => resolve());
  }

  async addMessage(input: {
    id: string;
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    evidenceUri?: string | null;
  }): Promise<SessionMessage> {
    const message: SessionMessage = {
      ...input,
      evidenceUri: input.evidenceUri ?? null,
      createdAt: new Date().toISOString(),
    };
    this.messages.set(input.sessionId, [...(this.messages.get(input.sessionId) ?? []), message]);
    return message;
  }

  async getMessages(sessionId: string): Promise<SessionMessage[]> {
    return this.messages.get(sessionId) ?? [];
  }

  async getRecentMessages(sessionId: string): Promise<SessionMessage[]> {
    return this.messages.get(sessionId) ?? [];
  }

  async listSessions(): Promise<SessionSummary[]> {
    return [...this.sessions.values()].map((session) => ({
      ...session,
      messageCount: this.messages.get(session.id)?.length ?? 0,
    }));
  }

  async getLatestClosedSummary(): Promise<string | null> {
    return [...this.sessions.values()].find((session) => session.status === "closed")?.summary ?? null;
  }

  async waitForSummary(sessionId: string): Promise<void> {
    if (this.sessions.get(sessionId)?.summary) return;
    return new Promise((resolve) => {
      this.summaryWaiters.set(sessionId, [
        ...(this.summaryWaiters.get(sessionId) ?? []),
        resolve,
      ]);
    });
  }
}
