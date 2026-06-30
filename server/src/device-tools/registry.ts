import type { TSchema } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "../infra/tools.js";

export const DEVICE_TOOL_PROTOCOL_VERSION = 1;

export interface DeviceToolRegistration {
  deviceId: string;
  name: string;
  description: string;
  parameters: TSchema;
  timeoutMs?: number;
}

export interface DeviceToolCall {
  id: string;
  deviceId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  createdAt: number;
  timeoutMs: number;
}

type PendingCall = DeviceToolCall & {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type DeviceToolServerMessage =
  | {
      version: typeof DEVICE_TOOL_PROTOCOL_VERSION;
      type: "server.hello";
      messageId: string;
      heartbeatMs: number;
    }
  | {
      version: typeof DEVICE_TOOL_PROTOCOL_VERSION;
      type: "server.ack";
      messageId: string;
      repliesTo: string;
    }
  | {
      version: typeof DEVICE_TOOL_PROTOCOL_VERSION;
      type: "server.error";
      messageId: string;
      repliesTo?: string;
      error: { code: string; message: string };
    }
  | {
      version: typeof DEVICE_TOOL_PROTOCOL_VERSION;
      type: "tool.call";
      messageId: string;
      call: DeviceToolCall;
    };

export type DeviceToolClientMessage =
  | {
      version: typeof DEVICE_TOOL_PROTOCOL_VERSION;
      type: "client.register";
      messageId: string;
      deviceId: string;
      tools: Omit<DeviceToolRegistration, "deviceId">[];
    }
  | {
      version: typeof DEVICE_TOOL_PROTOCOL_VERSION;
      type: "tool.result";
      messageId: string;
      callId: string;
      result?: unknown;
      error?: unknown;
    }
  | {
      version: typeof DEVICE_TOOL_PROTOCOL_VERSION;
      type: "client.ping";
      messageId: string;
      deviceId?: string;
    };

export interface DeviceToolConnection {
  id: string;
  send(message: DeviceToolServerMessage): boolean;
  close?(): void;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const DEVICE_TOOL_HEARTBEAT_MS = 25_000;
const registrations = new Map<string, DeviceToolRegistration>();
const pendingByDevice = new Map<string, PendingCall[]>();
const pendingById = new Map<string, PendingCall>();
const connectionsByDevice = new Map<string, DeviceToolConnection>();

function key(deviceId: string, toolName: string): string {
  return `${deviceId}:${toolName}`;
}

function createMessageId(): string {
  return crypto.randomUUID();
}

export function registerDeviceTools(deviceId: string, tools: Omit<DeviceToolRegistration, "deviceId">[]): void {
  for (const tool of tools) {
    registrations.set(key(deviceId, tool.name), {
      ...tool,
      deviceId,
      timeoutMs: Math.min(tool.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
    });
  }
}

export function attachDeviceToolConnection(deviceId: string, connection: DeviceToolConnection): void {
  const existing = connectionsByDevice.get(deviceId);
  if (existing && existing.id !== connection.id) {
    existing.close?.();
  }
  connectionsByDevice.set(deviceId, connection);
  const queue = pendingByDevice.get(deviceId) ?? [];
  for (const pending of queue) {
    sendCallToDevice(pending);
  }
}

export function detachDeviceToolConnection(deviceId: string, connectionId: string): void {
  const existing = connectionsByDevice.get(deviceId);
  if (existing?.id === connectionId) {
    connectionsByDevice.delete(deviceId);
  }
}

export function createDeviceToolHello(): DeviceToolServerMessage {
  return {
    version: DEVICE_TOOL_PROTOCOL_VERSION,
    type: "server.hello",
    messageId: createMessageId(),
    heartbeatMs: DEVICE_TOOL_HEARTBEAT_MS,
  };
}

export function createDeviceToolAck(repliesTo: string): DeviceToolServerMessage {
  return {
    version: DEVICE_TOOL_PROTOCOL_VERSION,
    type: "server.ack",
    messageId: createMessageId(),
    repliesTo,
  };
}

export function createDeviceToolError(
  message: string,
  options: { code?: string; repliesTo?: string } = {}
): DeviceToolServerMessage {
  return {
    version: DEVICE_TOOL_PROTOCOL_VERSION,
    type: "server.error",
    messageId: createMessageId(),
    repliesTo: options.repliesTo,
    error: {
      code: options.code ?? "protocol_error",
      message,
    },
  };
}

export function handleDeviceToolClientMessage(message: unknown): DeviceToolServerMessage | null {
  const parsed = parseClientMessage(message);
  switch (parsed.type) {
    case "client.register":
      registerDeviceTools(parsed.deviceId, parsed.tools);
      return createDeviceToolAck(parsed.messageId);
    case "tool.result":
      resolveDeviceToolCall(parsed.callId, parsed.error ?? parsed.result, parsed.error !== undefined);
      return createDeviceToolAck(parsed.messageId);
    case "client.ping":
      return createDeviceToolAck(parsed.messageId);
  }
}

export function getDeviceToolDefinitions(): ToolDefinition[] {
  return [...registrations.values()].map((registration) => ({
    name: registration.name,
    description: `${registration.description}\n设备: ${registration.deviceId}`,
    parameters: registration.parameters,
    execute: (args) => enqueueDeviceToolCall(registration, args),
  }));
}

export function invokeRegisteredDeviceTool(
  toolName: string,
  args: Record<string, unknown>,
  options: { deviceId?: string } = {}
): Promise<unknown> {
  const registration = findDeviceToolRegistration(toolName, options.deviceId);
  if (!registration) {
    const deviceHint = options.deviceId ? ` on ${options.deviceId}` : "";
    throw new Error(`No registered device tool: ${toolName}${deviceHint}`);
  }
  return enqueueDeviceToolCall(registration, args);
}

export function listDeviceTools(): DeviceToolRegistration[] {
  return [...registrations.values()];
}

export function resolveDeviceToolCall(id: string, result: unknown, isError = false): boolean {
  const pending = pendingById.get(id);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingById.delete(id);
  const queue = pendingByDevice.get(pending.deviceId) ?? [];
  pendingByDevice.set(pending.deviceId, queue.filter((call) => call.id !== id));
  if (isError) {
    pending.reject(new Error(typeof result === "string" ? result : JSON.stringify(result)));
  } else {
    pending.resolve(result);
  }
  return true;
}

export function resetDeviceToolRegistryForTest(): void {
  for (const pending of pendingById.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Device tool registry reset"));
  }
  registrations.clear();
  pendingByDevice.clear();
  pendingById.clear();
  for (const connection of connectionsByDevice.values()) {
    connection.close?.();
  }
  connectionsByDevice.clear();
}

function findDeviceToolRegistration(toolName: string, deviceId?: string): DeviceToolRegistration | null {
  if (deviceId) {
    return registrations.get(key(deviceId, toolName)) ?? null;
  }
  return [...registrations.values()].find((registration) => registration.name === toolName) ?? null;
}

function enqueueDeviceToolCall(
  registration: DeviceToolRegistration,
  args: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const call: DeviceToolCall = {
      id: crypto.randomUUID(),
      deviceId: registration.deviceId,
      toolName: registration.name,
      arguments: args,
      createdAt: Date.now(),
      timeoutMs: registration.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
    const timer = setTimeout(() => {
      pendingById.delete(call.id);
      const queue = pendingByDevice.get(call.deviceId) ?? [];
      pendingByDevice.set(call.deviceId, queue.filter((item) => item.id !== call.id));
      reject(new Error(`Device tool timed out: ${call.toolName}`));
    }, call.timeoutMs);
    const pending = { ...call, resolve, reject, timer };
    pendingById.set(call.id, pending);
    pendingByDevice.set(call.deviceId, [...(pendingByDevice.get(call.deviceId) ?? []), pending]);
    sendCallToDevice(pending);
  });
}

function sendCallToDevice(call: PendingCall): void {
  const connection = connectionsByDevice.get(call.deviceId);
  if (!connection) return;
  const { resolve: _resolve, reject: _reject, timer: _timer, ...payload } = call;
  const sent = connection.send({
    version: DEVICE_TOOL_PROTOCOL_VERSION,
    type: "tool.call",
    messageId: createMessageId(),
    call: payload,
  });
  if (!sent) {
    connectionsByDevice.delete(call.deviceId);
  }
}

function parseClientMessage(message: unknown): DeviceToolClientMessage {
  if (!message || typeof message !== "object") {
    throw new Error("Device tool message must be an object");
  }

  const candidate = message as Record<string, unknown>;
  if (candidate.version !== DEVICE_TOOL_PROTOCOL_VERSION) {
    throw new Error(`Unsupported device tool protocol version: ${String(candidate.version)}`);
  }
  if (typeof candidate.messageId !== "string" || candidate.messageId.length === 0) {
    throw new Error("Device tool messageId is required");
  }

  switch (candidate.type) {
    case "client.register":
      if (typeof candidate.deviceId !== "string" || candidate.deviceId.length === 0) {
        throw new Error("client.register requires deviceId");
      }
      if (!Array.isArray(candidate.tools)) {
        throw new Error("client.register requires tools");
      }
      return candidate as DeviceToolClientMessage;
    case "tool.result":
      if (typeof candidate.callId !== "string" || candidate.callId.length === 0) {
        throw new Error("tool.result requires callId");
      }
      return candidate as DeviceToolClientMessage;
    case "client.ping":
      return candidate as DeviceToolClientMessage;
    default:
      throw new Error(`Unknown device tool message type: ${String(candidate.type)}`);
  }
}
