import { Platform } from "react-native";
import { cameraPerceiver } from "../perceivers/camera-perceiver";
import { moveLooi, setLooiHead, setLooiLight } from "./looi-robot";
import type { DeviceToolDefinition, DeviceToolExecutor } from "./types";

const DEVICE_ID = `${Platform.OS}-looi-device`;
const DEVICE_TOOL_PROTOCOL_VERSION = 1;
const RECONNECT_DELAY_MS = 2_000;
const WEBSOCKET_OPEN = 1;
const WEBSOCKET_CONNECTING = 0;
const executors = new Map<string, DeviceToolExecutor>();
let socket: WebSocket | null = null;
let connecting = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
const pendingOutboundMessages: Record<string, unknown>[] = [];
const completedCallResults = new Map<string, Record<string, unknown>>();

export function registerLocalDeviceTool(definition: DeviceToolDefinition, executor: DeviceToolExecutor): DeviceToolDefinition {
  executors.set(definition.name, executor);
  return definition;
}

export const builtinDeviceTools: DeviceToolDefinition[] = [
  registerLocalDeviceTool({
    name: "device_take_photo",
    description: "使用设备前/后摄像头拍照。当前实现优先返回相机感知器最近一帧。",
    parameters: { type: "object", properties: { facing: { type: "string", enum: ["front", "back"] } } },
    timeoutMs: 15_000,
  }, async () => {
    const imageBase64 = cameraPerceiver.getLatestFrame();
    if (!imageBase64) return { ok: false, error: "camera frame unavailable" };
    return { ok: true, imageBase64, source: "latest_camera_frame" };
  }),
  registerLocalDeviceTool({
    name: "device_record_audio",
    description: "录制 n 秒音频并返回本地文件 URI（占位实现会在接入录音 UI/权限后启用）。",
    parameters: { type: "object", properties: { seconds: { type: "number", minimum: 1, maximum: 30 } }, required: ["seconds"] },
    timeoutMs: 45_000,
  }, async ({ seconds }) => ({ ok: false, error: `audio recording executor not wired yet (${seconds}s requested)` })),
  registerLocalDeviceTool({
    name: "device_record_video",
    description: "录制 n 秒视频并返回本地文件 URI（占位实现会在接入 CameraView recordAsync 后启用）。",
    parameters: { type: "object", properties: { seconds: { type: "number", minimum: 1, maximum: 30 }, facing: { type: "string", enum: ["front", "back"] } }, required: ["seconds"] },
    timeoutMs: 45_000,
  }, async ({ seconds }) => ({ ok: false, error: `video recording executor not wired yet (${seconds}s requested)` })),
  registerLocalDeviceTool({
    name: "device_get_orientation",
    description: "识别设备朝向。当前返回平台和待接入状态。",
    parameters: { type: "object", properties: {} },
  }, async () => ({ ok: true, platform: Platform.OS, orientation: "unknown" })),
  registerLocalDeviceTool({
    name: "looi_move",
    description: "控制 LOOI 机器人移动。direction 可为 forward/backward/left/right/stop。",
    parameters: { type: "object", properties: { direction: { type: "string", enum: ["forward", "backward", "left", "right", "stop"] }, durationMs: { type: "number" }, speed: { type: "number" } }, required: ["direction"] },
    timeoutMs: 20_000,
  }, async ({ direction, durationMs, speed }) => moveLooi(String(direction), Number(durationMs ?? 800), Number(speed ?? 50))),
  registerLocalDeviceTool({
    name: "looi_set_light",
    description: "打开/关闭 LOOI 灯光，可选颜色。",
    parameters: { type: "object", properties: { enabled: { type: "boolean" }, color: { type: "string" } }, required: ["enabled"] },
    timeoutMs: 20_000,
  }, async ({ enabled }) => setLooiLight(Boolean(enabled))),
  registerLocalDeviceTool({
    name: "looi_set_head",
    description: "控制 LOOI 头部方向。direction 可为 up/center/down，或 SDK 支持的数值/hex。",
    parameters: { type: "object", properties: { direction: { type: "string" } }, required: ["direction"] },
    timeoutMs: 20_000,
  }, async ({ direction }) => setLooiHead(String(direction))),
];

export async function startDeviceToolsWebSocket(serverUrl: string): Promise<void> {
  stopped = false;
  connectDeviceToolsSocket(serverUrl);
}

async function executeAndReport(call: { id: string; toolName: string; arguments: Record<string, unknown> }) {
  const completed = completedCallResults.get(call.id);
  if (completed) {
    sendDeviceToolMessage(completed);
    return;
  }

  try {
    const executor = executors.get(call.toolName);
    if (!executor) throw new Error(`No executor for ${call.toolName}`);
    const result = await executor(call.arguments ?? {});
    rememberAndSendResult(call.id, { type: "tool.result", callId: call.id, result });
  } catch (error: any) {
    rememberAndSendResult(call.id, { type: "tool.result", callId: call.id, error: error?.message ?? String(error) });
  }
}

function connectDeviceToolsSocket(serverUrl: string): void {
  if (connecting || socket?.readyState === WEBSOCKET_OPEN || socket?.readyState === WEBSOCKET_CONNECTING) return;
  connecting = true;
  clearReconnectTimer();

  const wsUrl = `${serverUrl.replace(/^http/, "ws")}/api/device-tools/ws`;
  const nextSocket = new WebSocket(wsUrl);
  socket = nextSocket;

  nextSocket.onopen = () => {
    connecting = false;
    sendDeviceToolMessage({ type: "client.register", deviceId: DEVICE_ID, tools: builtinDeviceTools });
    flushOutboundMessages();
  };

  nextSocket.onmessage = (event) => {
    try {
      handleServerMessage(JSON.parse(String(event.data)));
    } catch (error) {
      console.warn("[DeviceTools] Invalid WebSocket message", error);
    }
  };

  nextSocket.onerror = (event) => {
    console.warn("[DeviceTools] WebSocket error", event);
  };

  nextSocket.onclose = () => {
    if (socket === nextSocket) socket = null;
    connecting = false;
    if (!stopped) {
      reconnectTimer = setTimeout(() => connectDeviceToolsSocket(serverUrl), RECONNECT_DELAY_MS);
    }
  };
}

function handleServerMessage(message: any): void {
  if (message?.version !== DEVICE_TOOL_PROTOCOL_VERSION) {
    console.warn("[DeviceTools] Unsupported protocol version", message?.version);
    return;
  }

  switch (message.type) {
    case "server.hello":
    case "server.ack":
      return;
    case "server.error":
      console.warn("[DeviceTools] Server protocol error", message.error);
      return;
    case "tool.call":
      void executeAndReport(message.call);
      return;
    default:
      console.warn("[DeviceTools] Unknown server message", message.type);
  }
}

function sendDeviceToolMessage(payload: Record<string, unknown>): void {
  if (!socket || socket.readyState !== WEBSOCKET_OPEN) {
    pendingOutboundMessages.push(payload);
    return;
  }

  socket.send(JSON.stringify({
    version: DEVICE_TOOL_PROTOCOL_VERSION,
    messageId: createMessageId(),
    ...payload,
  }));
}

function rememberAndSendResult(callId: string, payload: Record<string, unknown>): void {
  completedCallResults.set(callId, payload);
  if (completedCallResults.size > 100) {
    const oldestCallId = completedCallResults.keys().next().value;
    if (oldestCallId) completedCallResults.delete(oldestCallId);
  }
  sendDeviceToolMessage(payload);
}

function flushOutboundMessages(): void {
  while (pendingOutboundMessages.length > 0 && socket?.readyState === WEBSOCKET_OPEN) {
    const payload = pendingOutboundMessages.shift();
    if (payload) sendDeviceToolMessage(payload);
  }
}

function createMessageId(): string {
  const random = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${random}`;
}

function clearReconnectTimer(): void {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}
