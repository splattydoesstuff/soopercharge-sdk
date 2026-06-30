import { FastifyInstance } from "fastify";
import { RawData } from "ws";
import {
  attachDeviceToolConnection,
  createDeviceToolError,
  createDeviceToolHello,
  invokeRegisteredDeviceTool,
  listDeviceTools,
  detachDeviceToolConnection,
  handleDeviceToolClientMessage,
} from "../device-tools/registry.js";

export async function deviceToolRoutes(fastify: FastifyInstance) {
  fastify.get("/ws", { websocket: true }, (socket) => {
    const connectionId = crypto.randomUUID();
    let deviceId: string | null = null;

    const sendJson = (payload: unknown): boolean => {
      if (socket.readyState !== 1) return false;
      socket.send(JSON.stringify(payload));
      return true;
    };

    sendJson(createDeviceToolHello());

    socket.on("message", (data: RawData) => {
      let payload: unknown;
      try {
        payload = JSON.parse(data.toString());
      } catch {
        sendJson(createDeviceToolError("Invalid JSON payload", { code: "invalid_json" }));
        return;
      }

      try {
        const ack = handleDeviceToolClientMessage(payload);
        if (
          payload &&
          typeof payload === "object" &&
          (payload as Record<string, unknown>).type === "client.register" &&
          typeof (payload as Record<string, unknown>).deviceId === "string"
        ) {
          deviceId = String((payload as Record<string, unknown>).deviceId);
          attachDeviceToolConnection(deviceId, {
            id: connectionId,
            send: sendJson,
            close: () => socket.close(4000, "superseded device tool connection"),
          });
        }
        if (ack) sendJson(ack);
      } catch (error: any) {
        const repliesTo =
          payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).messageId === "string"
            ? String((payload as Record<string, unknown>).messageId)
            : undefined;
        sendJson(createDeviceToolError(error?.message ?? String(error), { repliesTo }));
      }
    });

    socket.on("close", () => {
      if (deviceId) detachDeviceToolConnection(deviceId, connectionId);
    });

    socket.on("error", (error: Error) => {
      fastify.log.error(error, "Device tools WebSocket error");
      if (deviceId) detachDeviceToolConnection(deviceId, connectionId);
    });
  });

  fastify.get("/list", async () => ({ tools: listDeviceTools() }));

  fastify.post<{
    Body: {
      deviceId?: string;
      direction: string;
      durationMs?: number;
      speed?: number;
    };
  }>("/robot/move", async (request, reply) => {
    const direction = normalizeRobotMoveDirection(request.body.direction);
    if (!direction) {
      return reply.status(400).send({
        error: "direction must be one of forward/back/backward/left/right/stop",
      });
    }

    const durationMs = clampNumber(request.body.durationMs ?? 800, 0, 20_000);
    const speed = clampNumber(request.body.speed ?? 50, 0, 100);

    try {
      const result = await invokeRegisteredDeviceTool(
        "looi_move",
        { direction, durationMs, speed },
        { deviceId: request.body.deviceId }
      );
      return { ok: true, result };
    } catch (error: any) {
      const message = error?.message ?? String(error);
      if (message.startsWith("No registered device tool")) {
        return reply.status(404).send({ error: message });
      }
      if (message.startsWith("Device tool timed out")) {
        return reply.status(504).send({ error: message });
      }
      throw error;
    }
  });
}

function normalizeRobotMoveDirection(direction: string): string | null {
  switch (direction) {
    case "forward":
    case "back":
    case "backward":
    case "left":
    case "right":
    case "stop":
      return direction;
    default:
      return null;
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(value, max));
}
