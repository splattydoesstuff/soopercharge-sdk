import { randomUUID } from "node:crypto";
import { chatComplete } from "../infra/llm.js";
import { addMemory } from "../routes/memory.js";
import type { SessionMessage, SessionMessageRole, SessionRepository, SessionSummary } from "./repository.js";
import { PostgresSessionRepository } from "./repository.js";

const DEFAULT_SESSION_TIMEOUT_MS = 5 * 60 * 1000;

export interface SessionService {
  touch(): Promise<{ sessionId: string; isNew: boolean; previousSummary?: string }>;
  addMessage(input: {
    sessionId: string;
    role: SessionMessageRole;
    content: string;
    evidenceUri?: string | null;
  }): Promise<{ messageId: string }>;
  listSessions(options?: { limit?: number; offset?: number }): Promise<{ sessions: SessionSummary[] }>;
  getMessages(
    sessionId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ messages: SessionMessage[] }>;
  getRecentMessages(sessionId: string, maxMessages?: number): Promise<SessionMessage[]>;
}

export class DefaultSessionService implements SessionService {
  constructor(
    private readonly repository: SessionRepository = new PostgresSessionRepository(),
    private readonly options: {
      timeoutMs?: number;
      onBackgroundError?: (error: unknown) => void;
      addSummaryMemory?: (summary: string, sessionId: string) => Promise<unknown>;
      generateSummary?: (messages: SessionMessage[]) => Promise<string>;
    } = {}
  ) {}

  async touch(): Promise<{ sessionId: string; isNew: boolean; previousSummary?: string }> {
    const active = await this.repository.findLatestActive();
    const now = Date.now();

    if (active && now - Date.parse(active.touchedAt) <= this.timeoutMs) {
      const touched = await this.repository.touchSession(active.id);
      return { sessionId: touched?.id || active.id, isNew: false };
    }

    if (active) {
      void this.closeAndSummarize(active.id);
    }

    const session = await this.repository.createSession(createSessionId());
    const previousSummary = await this.repository.getLatestClosedSummary();
    return {
      sessionId: session.id,
      isNew: true,
      ...(previousSummary ? { previousSummary } : {}),
    };
  }

  async addMessage(input: {
    sessionId: string;
    role: SessionMessageRole;
    content: string;
    evidenceUri?: string | null;
  }): Promise<{ messageId: string }> {
    const message = await this.repository.addMessage({
      id: createMessageId(),
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      evidenceUri: input.evidenceUri,
    });

    return { messageId: message.id };
  }

  async listSessions(options?: { limit?: number; offset?: number }): Promise<{ sessions: SessionSummary[] }> {
    return { sessions: await this.repository.listSessions(options) };
  }

  async getMessages(
    sessionId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ messages: SessionMessage[] }> {
    return { messages: await this.repository.getMessages(sessionId, options) };
  }

  async getRecentMessages(sessionId: string, maxMessages = 20): Promise<SessionMessage[]> {
    return this.repository.getRecentMessages(sessionId, maxMessages);
  }

  private get timeoutMs(): number {
    return this.options.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
  }

  private async closeAndSummarize(sessionId: string): Promise<void> {
    try {
      const messages = await this.repository.getRecentMessages(sessionId, 80);
      await this.repository.closeSession(sessionId);

      if (messages.length === 0) {
        return;
      }

      const summary = await (this.options.generateSummary ?? generateSessionSummary)(messages);
      if (summary) {
        await this.repository.updateSessionSummary(sessionId, summary);
        await this.addSummaryMemory(summary, sessionId);
      }
    } catch (error) {
      this.options.onBackgroundError?.(error);
    }
  }

  private async addSummaryMemory(summary: string, sessionId: string): Promise<void> {
    const addSummaryMemory =
      this.options.addSummaryMemory ??
      ((value, id) =>
        addMemory(
          [{ role: "system", content: `对话摘要: ${value}` }],
          { category: "session_summary", sessionId },
          { infer: false }
        ));

    await addSummaryMemory(summary, sessionId);
  }
}

export async function generateSessionSummary(messages: SessionMessage[]): Promise<string> {
  const transcript = messages
    .map((message) => `${message.role === "user" ? "用户" : "LOOI"}：${message.content}`)
    .join("\n");

  return chatComplete(
    [
      {
        role: "system",
        content: "请把这段用户和 LOOI 的对话总结成一句中文，保留可用于后续上下文的关键信息，不超过 80 字。",
      },
      { role: "user", content: transcript },
    ],
    { temperature: 0.2, maxTokens: 120 }
  );
}

function createSessionId(): string {
  return `sess_${randomUUID()}`;
}

function createMessageId(): string {
  return `msg_${randomUUID()}`;
}
