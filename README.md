# Super LOOI / LOOI SDK

> 中文 / English bilingual README. See the language-specific sections below.

## 中文

Super LOOI 是一个以 **looi-sdk** 为核心、面向 LOOI Robot 的本地优先实验仓库。当前仓库同时包含：

- `packages/looi-sdk`：早期提供的核心之一，封装 LOOI Robot 的 BLE 控制能力。
- React Native / Expo 应用：`looi-sdk` 的一个应用场景，用来验证语音、记忆、感知和机器人身体控制如何组合成完整体验。
- `server`：本地服务端，提供记忆、LLM、会话和设备工具调用等能力。
- `docs`：阶段性技术设计、验收记录和设备工具文档。

### 当前状态

- 初版 `@sourcebug/looi-sdk` 已经落地在 monorepo 内，版本为早期 alpha。
- SDK 先聚焦 LOOI Robot 的高层运动、头部、灯光、吸附状态回调和 raw BLE 写入。
- RN 应用不是 SDK 本身，而是 SDK 的一个首要验证场景：通过移动端语音、视觉、记忆和工具调用来驱动 LOOI。

### 仓库结构

```text
.
├── app/                    # Expo Router 应用界面
├── src/                    # RN 应用业务逻辑、语音、设备工具等
├── server/                 # 本地 API / LLM / memory 服务
├── packages/looi-sdk/      # LOOI Robot TypeScript SDK
├── docs/                   # 架构、验收和路线图文档
└── scripts/                # 回归、验收和辅助脚本
```

### 快速开始

#### 前置条件

- Node.js + pnpm
- Docker with Compose
- llama.cpp Metal build（用于本地视觉服务，可选但推荐）
- MiniCPM-V 2.6 GGUF model 与 mmproj 文件（用于本地视觉服务）

#### 环境变量

```bash
cp .env.example .env
```

填写 `LLM_API_KEY`、MiniMax 凭据，并把 `EXPO_PUBLIC_LOOI_SERVER_URL` 设置为服务端打印出的局域网 URL。

#### 安装依赖

```bash
pnpm install
```

#### 启动本地服务与应用

```bash
docker compose up -d
bash server/scripts/start-vision.sh
cd server && pnpm dev
pnpm start
```

视觉服务默认使用 `8082` 端口，因为 Expo/Metro 可能占用 `8081`。如需覆盖：

```bash
VISION_PORT=8083 bash server/scripts/start-vision.sh
```

并同步更新 `.env` 中的 `VISION_SERVER_URL`。

`server/scripts/start-vision.sh` 默认需要以下文件：

- `~/tools/llama.cpp/build/bin/llama-server`
- `~/models/minicpm-v-2.6/ggml-model-Q4_K_M.gguf`
- `~/models/minicpm-v-2.6/mmproj-model-f16.gguf`

安装 `huggingface-cli` 后可用 `server/scripts/download-vision-model.sh` 下载模型。

### SDK 使用方式

SDK 文档见 [`packages/looi-sdk/README.md`](packages/looi-sdk/README.md)。最小示例：

```ts
import { LooiRobot, WebBluetoothLooiTransport } from "@sourcebug/looi-sdk";

const robot = new LooiRobot(new WebBluetoothLooiTransport());

await robot.connect({
  onDock: ({ docked }) => {
    console.log("吸附状态", docked);
  },
});

await robot.move("forward");
await robot.setHead("center");
await robot.setLight(true);
```

### 验证

```bash
pnpm exec tsc --noEmit
pnpm test
cd server && pnpm build
cd packages/looi-sdk && pnpm check
```

记忆链路 smoke test：

```bash
curl -X POST http://127.0.0.1:8080/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"我把钥匙放在蓝色抽屉里了"}],"metadata":{"category":"placement"}}'

curl -X POST http://127.0.0.1:8080/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query":"钥匙在哪"}'
```

### 鸣谢

特别感谢 [splattydoesstuff/sooperchargeforbots](https://github.com/splattydoesstuff/sooperchargeforbots)。这个项目为我们切入 LOOI Robot 控制与 BLE 探索提供了重要方向。

### GitHub 仓库建议配置

如果需要在 GitHub 仓库设置页手动更新，可以使用：

- **Description**：`Local-first LOOI Robot SDK and Expo app for voice, memory, perception, and BLE body control.`
- **Website**：可暂留空，或指向发布后的文档/演示页。
- **Topics**：`looi`, `looi-robot`, `robotics`, `ble`, `bluetooth`, `react-native`, `expo`, `typescript`, `local-first`, `voice-assistant`, `memory`, `sdk`
- **Labels**：
  - `sdk` — SDK package and public API changes
  - `rn-app` — React Native / Expo application work
  - `server` — local API, LLM, memory, or tool server changes
  - `device` — physical LOOI Robot or phone-device integration
  - `ble` — Bluetooth Low Energy protocol / transport work
  - `docs` — documentation-only changes
  - `acceptance` — validation, smoke tests, or device acceptance traces
  - `good first issue` — small, well-scoped contributor task
  - `help wanted` — external contribution welcome
  - `blocked` — waiting on hardware, credentials, or environment
  - `early-alpha` — early SDK/application behavior that may change

---

## English

Super LOOI is a local-first experimental repository for LOOI Robot, with **looi-sdk** as one of its early core building blocks. The repository currently contains:

- `packages/looi-sdk`: an early TypeScript SDK for controlling LOOI Robot over BLE.
- React Native / Expo app: one application scenario for `looi-sdk`, validating how voice, memory, perception, and body-control tools can work together.
- `server`: local APIs for memory, LLM orchestration, sessions, and device tool calls.
- `docs`: architecture notes, acceptance records, and roadmap documents.

### Current Status

- The initial `@sourcebug/looi-sdk` package is implemented inside this monorepo as an early alpha.
- The SDK currently focuses on high-level movement, head position, light control, dock-state callbacks, and raw BLE writes.
- The RN app is not the SDK itself. It is one primary application scenario that exercises the SDK in a richer assistant experience.

### Repository Layout

```text
.
├── app/                    # Expo Router application screens
├── src/                    # RN app logic, voice, device tools, etc.
├── server/                 # Local API / LLM / memory server
├── packages/looi-sdk/      # LOOI Robot TypeScript SDK
├── docs/                   # Architecture, acceptance, and roadmap docs
└── scripts/                # Regression, acceptance, and helper scripts
```

### Quick Start

#### Prerequisites

- Node.js + pnpm
- Docker with Compose
- llama.cpp with Metal support for local vision, optional but recommended
- MiniCPM-V 2.6 GGUF model and mmproj files for local vision

#### Environment

```bash
cp .env.example .env
```

Fill in `LLM_API_KEY`, MiniMax credentials, and set `EXPO_PUBLIC_LOOI_SERVER_URL` to the LAN URL printed by the server.

#### Install

```bash
pnpm install
```

#### Run the local services and app

```bash
docker compose up -d
bash server/scripts/start-vision.sh
cd server && pnpm dev
pnpm start
```

The vision server defaults to port `8082` because Expo/Metro may use `8081`. Override it with:

```bash
VISION_PORT=8083 bash server/scripts/start-vision.sh
```

Keep `VISION_SERVER_URL` in `.env` in sync.

`server/scripts/start-vision.sh` expects:

- `~/tools/llama.cpp/build/bin/llama-server`
- `~/models/minicpm-v-2.6/ggml-model-Q4_K_M.gguf`
- `~/models/minicpm-v-2.6/mmproj-model-f16.gguf`

Use `server/scripts/download-vision-model.sh` after installing `huggingface-cli`.

### SDK Usage

See [`packages/looi-sdk/README.md`](packages/looi-sdk/README.md) for full SDK docs. Minimal example:

```ts
import { LooiRobot, WebBluetoothLooiTransport } from "@sourcebug/looi-sdk";

const robot = new LooiRobot(new WebBluetoothLooiTransport());

await robot.connect({
  onDock: ({ docked }) => {
    console.log("Dock state", docked);
  },
});

await robot.move("forward");
await robot.setHead("center");
await robot.setLight(true);
```

### Validation

```bash
pnpm exec tsc --noEmit
pnpm test
cd server && pnpm build
cd packages/looi-sdk && pnpm check
```

Memory smoke test:

```bash
curl -X POST http://127.0.0.1:8080/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"I left my keys in the blue drawer."}],"metadata":{"category":"placement"}}'

curl -X POST http://127.0.0.1:8080/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query":"Where are my keys?"}'
```

### Acknowledgements

Special thanks to [splattydoesstuff/sooperchargeforbots](https://github.com/splattydoesstuff/sooperchargeforbots). It gave this project an important entry point for exploring LOOI Robot control and BLE behavior.

### Suggested GitHub Repository Settings

If you need to update the repository manually in GitHub settings, use:

- **Description**: `Local-first LOOI Robot SDK and Expo app for voice, memory, perception, and BLE body control.`
- **Website**: leave empty for now, or point it to the published docs/demo page later.
- **Topics**: `looi`, `looi-robot`, `robotics`, `ble`, `bluetooth`, `react-native`, `expo`, `typescript`, `local-first`, `voice-assistant`, `memory`, `sdk`
- **Labels**:
  - `sdk` — SDK package and public API changes
  - `rn-app` — React Native / Expo application work
  - `server` — local API, LLM, memory, or tool server changes
  - `device` — physical LOOI Robot or phone-device integration
  - `ble` — Bluetooth Low Energy protocol / transport work
  - `docs` — documentation-only changes
  - `acceptance` — validation, smoke tests, or device acceptance traces
  - `good first issue` — small, well-scoped contributor task
  - `help wanted` — external contribution welcome
  - `blocked` — waiting on hardware, credentials, or environment
  - `early-alpha` — early SDK/application behavior that may change
