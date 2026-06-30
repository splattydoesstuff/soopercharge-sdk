# @sourcebug/looi-sdk

> 中文 / English bilingual README for the early LOOI Robot SDK.

## 中文

`@sourcebug/looi-sdk` 是 LOOI Robot 的早期 TypeScript SDK，也是 Super LOOI 仓库早期提供的核心之一。它负责把底层 BLE 特征值写入封装成更容易使用的机器人控制 API。

> 注意：仓库中的 React Native 应用是 `looi-sdk` 的一个应用场景，而不是 SDK 本身。SDK 应保持尽量独立，方便后续在 Web、React Native 原生 BLE 绑定、Node 桥接或其它机器人控制环境中复用。

### 能力范围

初版 SDK 先保留 4 类核心能力：

1. 高层移动控制：前进、后退、左转、右转、停止，适合轮盘或长按按钮驱动。
2. 高层头部控制：抬头、中位、低头。
3. 简单灯光控制：开灯、关灯。
4. 吸附状态回调 + 原始特征值写入。

SDK 使用 TypeScript 编写，并直接导出类型定义。

### 安装

在当前 monorepo 内使用 workspace 依赖：

```bash
pnpm add @sourcebug/looi-sdk@workspace:*
```

发布到 npm 后可使用：

```bash
pnpm add @sourcebug/looi-sdk
```

### 快速示例

```ts
import { LooiRobot, WebBluetoothLooiTransport } from "@sourcebug/looi-sdk";

const robot = new LooiRobot(new WebBluetoothLooiTransport());

await robot.connect({
  onDock: ({ docked, raw }) => {
    console.log("吸附状态", docked, raw.hex);
  },
});

await robot.move("forward");
robot.startMoveLoop("left");
await robot.stop();
await robot.setHead("center");
await robot.setLight(true);

await robot.writeRaw("fe00", "00100000010032030a0001ff00010a3203ff0003", {
  response: true,
});
```

### 核心 API

#### `LooiRobot`

高层机器人客户端，接收任意实现了 `LooiTransport` 的传输层。

常用方法：

- `connect(options?)`：连接并执行默认握手。
- `disconnect()`：断开连接并清理移动循环。
- `move(direction)`：执行一次移动指令。
- `startMoveLoop(direction, intervalMs?)`：持续发送移动指令，适合长按按钮或虚拟摇杆。
- `stopMoveLoop()`：停止持续移动循环。
- `stop()`：发送停止移动指令。
- `setHead(direction)`：设置头部位置。
- `setLight(enabled)`：开关灯。
- `writeRaw(characteristic, hex, options?)`：直接写入 raw BLE 特征值。

#### `WebBluetoothLooiTransport`

基于浏览器 Web Bluetooth API 的传输层实现。它适合 Chrome / Edge 等支持 Web Bluetooth 的环境，用于 SDK 早期调试和协议验证。

React Native 原生 BLE 传输层仍应在应用侧或后续 package 中实现，然后通过 `LooiTransport` 接口接入 `LooiRobot`。

#### `LooiTransport`

传输层接口，用于隔离 SDK 高层控制逻辑与具体 BLE 实现。实现方需要提供连接、断开、写入和通知订阅能力。

### 导出内容

- `LooiRobot`
- `WebBluetoothLooiTransport`
- `normalizeHex()`
- `hexToBytes()`
- `bytesToHex()`
- `createInitTimeHex()`
- `LOOI_MOVE_VALUES`
- `LOOI_HEAD_VALUES`
- `LOOI_LIGHT_VALUES`
- Types: `LooiTransport`, `LooiMoveDirection`, `LooiHeadDirection`, `LooiWriteOptions`, `LooiRawNotification`, `LooiDockEvent`, `LooiConnectOptions`, `LooiRobotOptions`

### 设计原则

- 默认暴露高层能力，不要求业务侧理解全部 BLE 协议细节。
- `connect()` 后默认立即握手，降低应用侧接入成本。
- 吸附事件通过 `onDock` 直接暴露给业务侧。
- 只有在确实需要时，才通过 `writeRaw()` 直接操作 `fe00` / `fed2` / `feda` 这类通道。
- 高层 API 与传输层解耦，避免把 Web Bluetooth、React Native BLE 或 Node 桥接绑定死在核心 SDK 中。

### 开发与验证

```bash
cd packages/looi-sdk
pnpm check
pnpm build
```

### 鸣谢

感谢 [splattydoesstuff/sooperchargeforbots](https://github.com/splattydoesstuff/sooperchargeforbots) 带来的切入方向，帮助我们更快开始 LOOI Robot 的 BLE 控制探索。

---

## English

`@sourcebug/looi-sdk` is an early TypeScript SDK for LOOI Robot and one of the early core building blocks in the Super LOOI repository. It wraps low-level BLE characteristic writes into a simpler robot-control API.

> Note: the React Native app in this repository is one application scenario for `looi-sdk`; it is not the SDK itself. The SDK should remain as independent as possible so it can later be reused from Web, React Native native BLE bindings, Node bridges, or other robot-control environments.

### Scope

The first SDK version keeps four core capability groups:

1. High-level movement control: forward, backward, left, right, and stop. Suitable for joysticks or press-and-hold controls.
2. High-level head control: up, center, and down.
3. Simple light control: on and off.
4. Dock-state callbacks plus raw characteristic writes.

The SDK is written in TypeScript and exports type definitions directly.

### Installation

Inside this monorepo, use the workspace dependency:

```bash
pnpm add @sourcebug/looi-sdk@workspace:*
```

After npm publication, use:

```bash
pnpm add @sourcebug/looi-sdk
```

### Quick Example

```ts
import { LooiRobot, WebBluetoothLooiTransport } from "@sourcebug/looi-sdk";

const robot = new LooiRobot(new WebBluetoothLooiTransport());

await robot.connect({
  onDock: ({ docked, raw }) => {
    console.log("Dock state", docked, raw.hex);
  },
});

await robot.move("forward");
robot.startMoveLoop("left");
await robot.stop();
await robot.setHead("center");
await robot.setLight(true);

await robot.writeRaw("fe00", "00100000010032030a0001ff00010a3203ff0003", {
  response: true,
});
```

### Core API

#### `LooiRobot`

The high-level robot client. It accepts any transport that implements `LooiTransport`.

Common methods:

- `connect(options?)`: connect and perform the default handshake.
- `disconnect()`: disconnect and clean up movement loops.
- `move(direction)`: send one movement command.
- `startMoveLoop(direction, intervalMs?)`: repeatedly send movement commands for press-and-hold buttons or virtual joysticks.
- `stopMoveLoop()`: stop the repeated movement loop.
- `stop()`: send the stop movement command.
- `setHead(direction)`: set the head position.
- `setLight(enabled)`: turn the light on or off.
- `writeRaw(characteristic, hex, options?)`: write directly to a raw BLE characteristic.

#### `WebBluetoothLooiTransport`

A browser Web Bluetooth transport implementation. It is useful in Chrome / Edge style environments that support Web Bluetooth, especially for early SDK debugging and protocol validation.

A React Native native BLE transport should be implemented in the app layer or a later package, then connected to `LooiRobot` through the `LooiTransport` interface.

#### `LooiTransport`

The transport interface that separates high-level SDK control logic from concrete BLE implementations. Implementations provide connect, disconnect, write, and notification subscription behavior.

### Exports

- `LooiRobot`
- `WebBluetoothLooiTransport`
- `normalizeHex()`
- `hexToBytes()`
- `bytesToHex()`
- `createInitTimeHex()`
- `LOOI_MOVE_VALUES`
- `LOOI_HEAD_VALUES`
- `LOOI_LIGHT_VALUES`
- Types: `LooiTransport`, `LooiMoveDirection`, `LooiHeadDirection`, `LooiWriteOptions`, `LooiRawNotification`, `LooiDockEvent`, `LooiConnectOptions`, `LooiRobotOptions`

### Design Principles

- Expose high-level capabilities by default so app code does not need to understand every BLE protocol detail.
- Run the default handshake immediately after `connect()` to reduce application-side setup.
- Surface dock-state changes directly through `onDock`.
- Use `writeRaw()` for direct `fe00` / `fed2` / `feda` access only when necessary.
- Keep the high-level API decoupled from the transport layer, so Web Bluetooth, React Native BLE, and Node bridge implementations do not get hard-coded into the core SDK.

### Development and Validation

```bash
cd packages/looi-sdk
pnpm check
pnpm build
```

### Acknowledgements

Thanks to [splattydoesstuff/sooperchargeforbots](https://github.com/splattydoesstuff/sooperchargeforbots) for providing an important entry point for exploring LOOI Robot BLE control.
