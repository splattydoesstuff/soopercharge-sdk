# Super LOOI

Phase 1 local-first memory loop for the LOOI assistant.

## Prerequisites

- Node.js + pnpm
- Docker with Compose
- llama.cpp built with Metal for local vision
- MiniCPM-V 2.6 GGUF model and mmproj files

## Environment

```bash
cp .env.example .env
```

Fill in `LLM_API_KEY`, MiniMax credentials, and set `EXPO_PUBLIC_LOOI_SERVER_URL` to the LAN URL printed by the server.

## Run

```bash
docker compose up -d
bash server/scripts/start-vision.sh
cd server && pnpm dev
pnpm start
```

`server/scripts/start-vision.sh` expects:

- `~/tools/llama.cpp/build/bin/llama-server`
- `~/models/minicpm-v-2.6/ggml-model-Q4_K_M.gguf`
- `~/models/minicpm-v-2.6/mmproj-model-f16.gguf`

Use `server/scripts/download-vision-model.sh` after installing `huggingface-cli`.

## Validation

```bash
pnpm exec tsc --noEmit
cd server && pnpm build
docker compose ps
```

Memory smoke test:

```bash
curl -X POST http://127.0.0.1:8080/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"我把钥匙放在蓝色抽屉里了"}],"metadata":{"category":"placement"}}'

curl -X POST http://127.0.0.1:8080/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query":"钥匙在哪"}'
```
