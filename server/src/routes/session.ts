import { FastifyInstance } from "fastify";
import { DefaultSessionService, type SessionService } from "../session/service.js";

export interface SessionRouteDependencies {
  sessionService: SessionService;
}

export function createSessionRoutes(
  dependencies: SessionRouteDependencies = {
    sessionService: new DefaultSessionService(undefined, {
      onBackgroundError: (error) => console.error("Session background task failed", error),
    }),
  }
) {
  return async function sessionRoutes(fastify: FastifyInstance) {
    fastify.post("/touch", async (_request, reply) => {
      try {
        return await dependencies.sessionService.touch();
      } catch (error: any) {
        fastify.log.error(error, "Session touch failed");
        return reply.status(500).send({ error: "Failed to touch session", details: error.message });
      }
    });

    fastify.post<{
      Params: { id: string };
      Body: { role: string; content: string; evidenceUri?: string | null };
    }>("/:id/message", async (request, reply) => {
      const { id } = request.params;
      const { role, content, evidenceUri } = request.body;

      if (role !== "user" && role !== "assistant") {
        return reply.status(400).send({ error: "role must be user or assistant" });
      }
      if (!content) {
        return reply.status(400).send({ error: "content is required" });
      }

      try {
        return await dependencies.sessionService.addMessage({
          sessionId: id,
          role,
          content,
          evidenceUri,
        });
      } catch (error: any) {
        fastify.log.error(error, "Session message add failed");
        return reply.status(500).send({ error: "Failed to add session message", details: error.message });
      }
    });

    fastify.get<{
      Querystring: { limit?: string; offset?: string };
    }>("/list", async (request, reply) => {
      try {
        return await dependencies.sessionService.listSessions({
          limit: parseOptionalInt(request.query.limit),
          offset: parseOptionalInt(request.query.offset),
        });
      } catch (error: any) {
        fastify.log.error(error, "Session list failed");
        return reply.status(500).send({ error: "Failed to list sessions", details: error.message });
      }
    });

    fastify.get<{
      Params: { id: string };
      Querystring: { limit?: string; offset?: string };
    }>("/:id/messages", async (request, reply) => {
      try {
        return await dependencies.sessionService.getMessages(request.params.id, {
          limit: parseOptionalInt(request.query.limit),
          offset: parseOptionalInt(request.query.offset),
        });
      } catch (error: any) {
        fastify.log.error(error, "Session messages failed");
        return reply.status(500).send({ error: "Failed to get session messages", details: error.message });
      }
    });
  };
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const sessionRoutes = createSessionRoutes();
