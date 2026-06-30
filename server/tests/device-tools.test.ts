import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../src/index.js";
import {
  DEVICE_TOOL_PROTOCOL_VERSION,
  attachDeviceToolConnection,
  detachDeviceToolConnection,
  handleDeviceToolClientMessage,
  invokeRegisteredDeviceTool,
  resetDeviceToolRegistryForTest,
  type DeviceToolServerMessage,
} from "../src/device-tools/registry.js";

type DeviceToolServerMessageOf<T extends DeviceToolServerMessage["type"]> = Extract<DeviceToolServerMessage, { type: T }>;

test("device tool registry delivers calls over an attached WebSocket connection", async () => {
  resetDeviceToolRegistryForTest();
  const messages: DeviceToolServerMessage[] = [];

  try {
    const ack = handleDeviceToolClientMessage({
      version: DEVICE_TOOL_PROTOCOL_VERSION,
      type: "client.register",
      messageId: "register-1",
      deviceId: "ios-looi-device",
      tools: [
        {
          name: "looi_move",
          description: "move robot",
          parameters: {
            type: "object",
            properties: {
              direction: { type: "string" },
              durationMs: { type: "number" },
              speed: { type: "number" },
            },
            required: ["direction"],
          },
          timeoutMs: 5_000,
        },
      ],
    });
    assert.equal(ack?.type, "server.ack");

    attachDeviceToolConnection("ios-looi-device", {
      id: "test-connection",
      send: (message) => {
        messages.push(message);
        return true;
      },
    });

    const resultPromise = invokeRegisteredDeviceTool(
      "looi_move",
      { direction: "forward", durationMs: 320, speed: 60 },
      { deviceId: "ios-looi-device" }
    );
    const callMessage = messages.find(isToolCall);
    assert.ok(callMessage);
    assert.equal(callMessage.call.toolName, "looi_move");

    handleDeviceToolClientMessage({
      version: DEVICE_TOOL_PROTOCOL_VERSION,
      type: "tool.result",
      messageId: "result-1",
      callId: callMessage.call.id,
      result: { ok: true },
    });

    assert.deepEqual(await resultPromise, { ok: true });
  } finally {
    detachDeviceToolConnection("ios-looi-device", "test-connection");
    resetDeviceToolRegistryForTest();
  }
});

test("robot move route returns registered client result", async () => {
  resetDeviceToolRegistryForTest();
  const server = await buildServer({ logger: false });
  await server.ready();

  try {
    handleDeviceToolClientMessage({
      version: DEVICE_TOOL_PROTOCOL_VERSION,
      type: "client.register",
      messageId: "register-1",
      deviceId: "ios-looi-device",
      tools: [
        {
          name: "looi_move",
          description: "move robot",
          parameters: {
            type: "object",
            properties: {
              direction: { type: "string" },
              durationMs: { type: "number" },
              speed: { type: "number" },
            },
            required: ["direction"],
          },
          timeoutMs: 5_000,
        },
      ],
    });

    const callMessages: DeviceToolServerMessageOf<"tool.call">[] = [];
    attachDeviceToolConnection("ios-looi-device", {
      id: "test-route-connection",
      send: (message) => {
        if (isToolCall(message)) callMessages.push(message);
        return true;
      },
    });

    const moveResponsePromise = server.inject({
      method: "POST",
      url: "/api/device-tools/robot/move",
      payload: {
        deviceId: "ios-looi-device",
        direction: "forward",
        durationMs: 320,
        speed: 60,
      },
    });

    await eventually(() => assert.ok(callMessages[0]));
    const callMessage = callMessages[0];
    assert.equal(callMessage.call.toolName, "looi_move");
    assert.deepEqual(callMessage.call.arguments, {
      direction: "forward",
      durationMs: 320,
      speed: 60,
    });

    handleDeviceToolClientMessage({
      version: DEVICE_TOOL_PROTOCOL_VERSION,
      type: "tool.result",
      messageId: "result-1",
      callId: callMessage.call.id,
      result: {
        ok: true,
        direction: "forward",
        durationMs: 320,
        speed: 60,
      },
    });

    const moveResponse = await moveResponsePromise;
    assert.equal(moveResponse.statusCode, 200);
    assert.deepEqual(moveResponse.json(), {
      ok: true,
      result: { ok: true, direction: "forward", durationMs: 320, speed: 60 },
    });
  } finally {
    detachDeviceToolConnection("ios-looi-device", "test-route-connection");
    resetDeviceToolRegistryForTest();
    await server.close();
  }
});

test("robot move route returns 404 when no looi_move tool is registered", async () => {
  resetDeviceToolRegistryForTest();
  const server = await buildServer({ logger: false });
  await server.ready();

  try {
    const response = await server.inject({
      method: "POST",
      url: "/api/device-tools/robot/move",
      payload: { direction: "forward" },
    });

    assert.equal(response.statusCode, 404);
    assert.match(response.body, /No registered device tool: looi_move/);
  } finally {
    resetDeviceToolRegistryForTest();
    await server.close();
  }
});

function isToolCall(message: DeviceToolServerMessage): message is DeviceToolServerMessageOf<"tool.call"> {
  return message.type === "tool.call";
}

async function eventually(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
