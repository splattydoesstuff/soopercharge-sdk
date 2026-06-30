# Device Tool Registration

LOOI now exposes mobile-device and robot-body capabilities to the server-side LLM tool loop through `/api/device-tools`.

## Flow

1. The app opens a WebSocket to `/api/device-tools/ws`.
2. The app sends a `client.register` protocol message with its built-in tool schemas.
2. Server-side LLM calls see these registered tools alongside built-in server tools.
3. When the LLM calls a device tool, the server sends a `tool.call` message over the active device WebSocket.
4. The app executes the local capability and replies with `tool.result`.
5. The server can also deterministically invoke robot movement through `POST /api/device-tools/robot/move`.

The device execution channel is WebSocket-only. `/api/device-tools/poll`, `/api/device-tools/result`, and HTTP registration were removed to avoid idle short-poll traffic and to keep future bidirectional interactions on one protocol.

## WebSocket protocol

All device-tool WebSocket payloads are JSON envelopes with `version: 1`, `type`, and `messageId`.

Client messages:

- `client.register`: `{ deviceId, tools }`
- `tool.result`: `{ callId, result? | error? }`
- `client.ping`: optional heartbeat probe

Server messages:

- `server.hello`: connection greeting with `heartbeatMs`
- `server.ack`: acknowledges register, result, or ping messages through `repliesTo`
- `server.error`: structured protocol error
- `tool.call`: queued device tool invocation

## Built-in client tools

- `device_take_photo`: returns the latest buffered camera frame.
- `device_record_audio`: schema and queue wiring are ready; the native executor is intentionally still a placeholder.
- `device_record_video`: schema and queue wiring are ready; the `CameraView.recordAsync` executor is intentionally still a placeholder.
- `device_get_orientation`: schema is registered; native orientation/motion detection can be wired next.
- `looi_move`: wrapper for the Soopercharge LOOI SDK movement API.
- `looi_set_light`: wrapper for the local Soopercharge LOOI SDK light API.
- `looi_set_head`: wrapper for the local Soopercharge LOOI SDK head API.

The old Soopercharge SDK has been migrated into this monorepo as `packages/looi-sdk` and is consumed through the workspace dependency `@sourcebug/looi-sdk`.

## Robot BLE startup

The app uses `react-native-ble-plx` via the Expo config plugin in `app.json`; native permission changes should continue to go through config plugins/app config, not through generated prebuild output.

Settings exposes manual robot discovery: tap "搜索 / 重试", select a scanned LOOI candidate, and the app connects through `ReactNativeBleLooiTransport`, discovers services/characteristics, and lets `LooiRobot.connect()` run the SDK handshake. The selected robot id/name is persisted after a successful connection.

When the home screen mounts, `startLooiRobotAutoConnection()` only attempts reconnect/handshake if a robot was previously selected in Settings. First-run scanning is intentionally manual so the user can choose the robot and retry when scan results are empty. Set `EXPO_PUBLIC_LOOI_DISABLE_ROBOT_AUTOCONNECT=1` to suppress saved reconnects during development, or `EXPO_PUBLIC_LOOI_ROBOT_NAME` to override the advertised name used for candidate filtering.

## Server movement endpoint

`POST /api/device-tools/robot/move` invokes the registered client-side `looi_move` tool and waits for the app to execute it over the WebSocket device channel.

Payload:

```json
{
  "deviceId": "ios-looi-device",
  "direction": "forward",
  "durationMs": 800,
  "speed": 50
}
```

`deviceId` is optional when only one client has registered `looi_move`. `direction` supports `forward`, `back`, `backward`, `left`, `right`, and `stop`.
