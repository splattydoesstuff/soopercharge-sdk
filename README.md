# SOOPERCHARGE SDK
### The first (unofficial) SDK for the LOOI Robot.

This README and project has been written with the use of AI tools.
I am not the official author - this is just a Fork.

The SOOPERCHARGE SDK is an experimental SDK for the LOOI Robot, with **looi-sdk** as one of its early core building blocks. The repository currently contains:

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

Special thanks to [GrinZero]([https://github.com/splattydoesstuff/sooperchargeforbots](https://github.com/GrinZero/super-looi)) for providing the original project :)
