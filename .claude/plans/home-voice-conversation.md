# 主屏幕语音对话 + 字幕 + 流式交互

## 目标

在主屏幕（RobotFace）唤醒后，直接进入对话模式：

1. 唤醒后自动录音，**VAD 自动检测说完**（不需要按按钮）
2. 用户说的话以**字幕**显示在主屏幕上
3. LOOI 回复以**流式字幕**逐字显示
4. 如果回复包含图片，弹出**浮层**显示
5. TTS **边说边显示**文字

服务端：

1. 完全迁移到 pi 而不是 openai SDK

客户端：

1. 对话页面改成会话页面，且历史记录可用

---

## 技术选型

| 模块 | 方案 | 理由 |
|------|------|------|
| VAD | sherpa-onnx native `initVad` + `acceptVadWaveform` (Silero VAD) | 已有 native binding，和 KWS 用同一套 audio-studio 管道 |
| 流式 LLM | 服务端 OpenAI SDK `stream: true` + SSE | 最低改动成本，fastify 原生支持 SSE |
| 客户端 SSE | `fetch` + `ReadableStream` 解析 | RN 0.76+ 支持 streaming fetch，无需额外依赖 |
| 流式 TTS | MiniMax `stream: true` + 分句合成 | MiniMax 支持流式返回 MP3 chunks；但延迟优化更简单的方式是 LLM 分句完成后立即发起 TTS |
| 字幕 UI | 新组件 `ConversationOverlay`，absolute 定位在 RobotFace 上 | 不影响现有主屏幕结构 |
| 图片浮层 | `ImageOverlay` modal 组件 | 半透明背景 + 居中图片 |

---

## 整体架构变更

```
唤醒 → 开始录音 + VAD 监听
  → VAD 检测到 speech end → 停止录音
    → 声纹验证 → ASR 转写 → 字幕显示用户语句
      → 服务端 SSE 流式生成 → 客户端逐 token 更新字幕
        → 每句完成后触发 TTS → 边播放边显示对应文字
          → 有图片时弹出浮层
```

---

## 分步实现

### Phase 1: VAD 集成（自动检测说完）

**目标**：唤醒后开始录音，VAD 检测到一段话结束后自动触发 `finishListening`

**改动文件**：

- `src/voice/vad-service.ts`（新建）— 封装 sherpa-onnx VAD init/accept/reset
- `src/voice/sherpa-models.ts` — SherpaModelKind 增加 `"vad"`，新增 VAD 模型路径常量，`checkAllSherpaModelReadiness()` 增加 vad 检查
- `src/voice/sherpa-model-download.ts` — 新增 `downloadVad()` 函数，从 sherpa-onnx releases 下载 `silero_vad.onnx`（~2MB）
- `src/voice/kws-audio-feeder.ts` — 录音期间将音频同时喂给 VAD
- `src/perceivers/voice-perceiver.ts` — 录音阶段挂载 VAD，检测到静音后自动 finish

**VAD 模型自动下载**：

- 模型 URL: `https://github.com/k2-fsa/sherpa-onnx/releases/download/vad-models/silero_vad.onnx`
- 存放目录: `sherpa-onnx/vad/silero_vad.onnx`（documentDirectory 下）
- 复用现有 `downloadFile()` + `checkSherpaModelFiles()` 机制
- `downloadMissingSherpaModels()` 增加 `downloadVad(before.vad, onProgress)` 调用
- DownloadStage 类型增加 `"vad"` stage

**VAD 参数**：

- `minSilenceDuration`: 800ms（说完后停顿 0.8s 判定结束）
- `minSpeechDuration`: 300ms（过短的声音不算有效语音）
- `threshold`: 0.5

**sherpa-onnx native 接口**（已存在于 `@siteed/sherpa-onnx.rn`）：

```typescript
initVad(config: {
  modelDir: string;
  modelFile?: string;  // "silero_vad.onnx"
  threshold?: number;
  minSilenceDuration?: number;
  minSpeechDuration?: number;
  windowSize?: number;  // 512
}) → { success: boolean }

acceptVadWaveform(sampleRate: number, samples: number[]) → {
  isSpeechDetected: boolean;
  segments: Array<{ startTime, endTime }>
}

resetVad() → { success: boolean }
releaseVad() → { released: boolean }
```

**录音流程改造**：

1. `handleWakeword()` → 启动 expo-audio 录音（同时保存文件用于 ASR）
2. 同时用 audio-studio 的 streaming 把 PCM 数据喂给 VAD
3. VAD 返回 `isSpeechDetected: false` 且之前有 speech → 等 `minSilenceDuration` → 自动 `finishListening()`
4. 安全超时：最长 15s 无论如何结束

---

### Phase 2: 服务端 SSE 流式 LLM（迁移至 pi-ai）

**目标**：

1. 将服务端 LLM 调用从 `openai` SDK 迁移到 `@earendil-works/pi-ai`（与 moego-rag-mcp 统一技术栈）
2. 新增 SSE 流式路由 `/api/llm/generate-response-stream`

**背景 — 当前问题**：

- 服务端直接用 `openai` SDK（`openai@5.8.2`）连 `llmproxy-dev.devops.moego.pet`
- 团队标准是 `@earendil-works/pi-ai`（已在 moego-rag-mcp 中使用）
- pi-ai 提供统一的多 provider 抽象 + 流式能力（`streamSimple` / `completeSimple`）

**改动文件**：

- `server/package.json` — 添加 `@earendil-works/pi-ai`，移除 `openai`
- `server/src/infra/llm.ts`（新建）— 参照 moego-rag-mcp 的 `infra/llm/` 结构，封装 `buildModel` + `chatComplete` + `chatStream`
- `server/src/routes/llm.ts` — 改用 pi-ai 调用，新增 SSE 流式路由
- `server/src/config.ts` — LLM 配置增加 `provider` 字段
- `src/server-api/client.ts` — 新增 `generateResponseStream()` 方法返回 async iterable

**pi-ai 核心用法**（参照 moego-rag-mcp 已有模式）：

```typescript
import { completeSimple, streamSimple } from "@earendil-works/pi-ai";
import type { Api, Context, Model } from "@earendil-works/pi-ai";

// 构建 model
const model: Model<Api> = {
  id: "gpt-4o",
  name: "gpt-4o",
  api: "openai-completions",
  provider: "openai",
  baseUrl: "https://llmproxy-dev.devops.moego.pet",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 4_096,
};

// 非流式（替代 openai.chat.completions.create）
const result = await completeSimple(model, context, { maxTokens: 200 });
const text = result.content.filter(c => c.type === "text").map(c => c.text).join("");

// 流式（SSE 路由用）
const eventStream = streamSimple(model, context, { maxTokens: 200 });
for await (const event of eventStream) {
  // 逐 token 推送到客户端
}
```

**服务端 SSE 路由实现**：

```typescript
// POST /api/llm/generate-response-stream
reply.raw.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
});

const context: Context = { systemPrompt, messages };
const eventStream = streamSimple(model, context, { maxTokens: 200 });
let fullText = '';

for await (const event of eventStream) {
  if (event.type === 'content' && event.content.type === 'text') {
    const text = event.content.text;
    fullText += text;
    reply.raw.write(`event: token\ndata: ${JSON.stringify({ text })}\n\n`);
  }
}
reply.raw.write(`event: done\ndata: ${JSON.stringify({ fullText })}\n\n`);
reply.raw.end();
```

**SSE 协议**：

```
event: token
data: {"text": "你"}

event: token
data: {"text": "好"}

event: done
data: {"fullText": "你好！有什么...", "evidenceUri": "..."}
```

**客户端 SSE 消费**：

```typescript
async function* streamResponse(body): AsyncGenerator<string> {
  const reader = response.body.getReader();
  // 解析 SSE 格式，yield 每个 token
}
```

**迁移范围（Phase 2 一并完成）**：

- `/api/llm/classify-intent` — 改用 pi-ai `completeSimple`（低 token，非流式即可）
- `/api/llm/generate-response` — 改用 pi-ai `completeSimple`（保留非流式版本兼容）
- `/api/llm/generate-response-stream` — 新增，pi-ai `streamSimple`

---

### Phase 3: 主屏幕字幕覆层 UI

**目标**：在 RobotFace 上显示实时对话字幕

**新建文件**：

- `src/ui/ConversationOverlay.tsx` — 字幕覆层组件

**UI 设计**：

- 半透明暗色底栏，fixed 在屏幕底部（RobotFace 上方）
- 用户语句：左对齐，较小字号，淡色
- LOOI 回复：居中，较大字号，流式逐字显示（打字机效果）
- 使用 `react-native-reanimated` 做淡入淡出动画
- 空闲 3s 后自动隐藏

**状态扩展**（conversation store）：

- `streamingText: string` — 当前正在流式显示的文本
- `overlayVisible: boolean` — 字幕覆层是否显示
- `setStreamingText(text: string)` — 逐步追加

**主屏幕集成**：

```tsx
// app/(tabs)/index.tsx
<SafeAreaView style={styles.home}>
  <LazyCameraFrameFeeder />
  <View style={styles.faceStage}>
    <RobotFace ... />
  </View>
  <ConversationOverlay />   {/* 新增 */}
  {quickPanelVisible ? ... : null}
</SafeAreaView>
```

---

### Phase 4: 流式 TTS（边说边显示）

**目标**：LLM 流式输出的文本按句子切分，每句完成后立即合成播放

**策略**：分句 TTS（不是 word-level sync，那个对中文不现实）

**改动**：

- `src/voice/tts.ts` — 新增 `speakSentences(sentences: AsyncIterable<string>)` 方法
- `src/perceivers/voice-perceiver.ts` — 接 LLM stream，攒够一句就 dispatch TTS

**分句逻辑**：

- 遇到 `。！？，、\n` 或累计超过 20 字时切分
- 第一句尽快合成播放（减少首句延迟）
- 后续句并行预合成（queue 模式）

**字幕同步**：

- TTS 开始播放某句时，字幕高亮显示该句
- 简单方案：按句子播放时长估算进度（不需要精确 word timestamp）

---

### Phase 5: 图片浮层

**目标**：LLM 回复中附带 evidenceUri 时，弹出浮层显示图片

**新建文件**：

- `src/ui/ImageOverlay.tsx`

**触发时机**：SSE 的 `done` 事件携带 `evidenceUri` 时弹出

**UI**：

- 半透明黑色背景覆盖全屏
- 图片居中显示，圆角，最大 80% 宽高
- 点击任意处或 3s 后自动关闭
- 使用 `expo-image` 加载

---

### Phase 6: 主屏幕唤醒集成

**目标**：把以上全部串联，主屏幕唤醒后全流程可用

**改动**：

- `src/perceivers/voice-perceiver.ts` — `finishListening()` 改为使用 streaming API
- 新增中间层统筹：stream tokens → 字幕更新 + 句子切分 → TTS queue
- conversation store 状态机扩展支持 streaming 阶段

**完整流程**：

1. 用户唤醒 → 状态变为 listening，字幕显示 "🎤 聆听中..."
2. VAD 检测说完 → 状态变为 processing
3. ASR 转写完成 → 字幕显示用户语句
4. SSE 流开始 → 状态变为 speaking，字幕逐字显示 LOOI 回复
5. 每句完成 → TTS 播放该句，字幕高亮当前句
6. 全部完成 → evidenceUri 存在则弹图片浮层
7. 3s 后字幕淡出，回到 sleeping 状态

---

### Phase 7: Session 管理（服务端）+ 对话页改为历史记录

**背景**：当前没有 session 概念，`useConversationStore` 只是内存中的 flat array，不持久化、不分组。主屏幕承载实时对话后，原 conversation 页面转为**历史对话查看器**。

**架构决策**：Session 管理放在服务端。理由：

- LLM 上下文在服务端组装，session messages 也在服务端可直接拼接，避免客户端每次 POST 大量消息
- 摘要生成是 LLM 操作，服务端关 session 时直接调 LLM + 写 mem0，一步到位
- 数据归属统一：记忆（mem0/pgvector）和对话都在 PostgreSQL，后续可做"从对话中提取记忆"
- 超时判定更可靠：iOS 后台杀 app 不影响服务端计时
- LOOI 本身依赖局域网 server 在线才能工作，不存在纯离线场景

#### 服务端数据模型

**PostgreSQL 新增表**（复用 mem0 同一个 pg 实例）：

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,            -- "sess_<ulid>"
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  summary TEXT,                   -- LLM 生成的 session 摘要
  status TEXT NOT NULL DEFAULT 'active'  -- 'active' | 'closed'
);

CREATE TABLE session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,             -- 'user' | 'assistant'
  content TEXT NOT NULL,
  evidence_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_session ON session_messages(session_id, created_at);
```

#### 服务端 API

**新增路由文件**：`server/src/routes/session.ts`

```
POST   /api/session/touch
  Body: {}
  返回: { sessionId, isNew, previousSummary? }
  逻辑: 查找最近活跃 session → 如果存在且未超时(5min) → 续用并更新 touched_at
        否则 → 关闭旧 session（异步生成摘要写 mem0）→ 创建新 session
        如果是新 session → 从 mem0 搜最近的 session 摘要，作为 previousSummary 返回

POST   /api/session/:id/message
  Body: { role, content, evidenceUri? }
  返回: { messageId }
  逻辑: 写入 session_messages 表

GET    /api/session/list
  Query: { limit?, offset? }
  返回: { sessions: [{ id, startedAt, endedAt, summary, messageCount }] }

GET    /api/session/:id/messages
  Query: { limit?, offset? }
  返回: { messages: [...] }
```

**Session 超时逻辑**（服务端）：

- `touch` 时检查：距上次交互 > `SESSION_TIMEOUT_MS`（5 分钟）→ 关闭旧 session
- 可选：服务端定时任务扫描超时未关闭的 active session（兜底）

**摘要生成**（异步，不阻塞响应）：

```typescript
async function closeSession(sessionId: string) {
  const messages = await getSessionMessages(sessionId);
  // 异步生成摘要，不阻塞
  generateSummary(messages).then(summary => {
    updateSessionSummary(sessionId, summary);
    // 写入 mem0 长期记忆
    memory.add([{ role: "system", content: `对话摘要: ${summary}` }], {
      userId: USER_ID,
      metadata: { category: "session_summary", sessionId },
    });
  });
  await markSessionClosed(sessionId);
}
```

#### LLM 上下文改造

**`/api/llm/generate-response-stream`（Phase 2 的 SSE 路由）改造**：

接收 `sessionId` 参数后，服务端自行从 DB 取该 session 的历史消息拼入 LLM 上下文：

```typescript
// 服务端拼上下文
const history = await getRecentSessionMessages(sessionId, { maxMessages: 20 });
const messages = [
  { role: "system", content: systemPrompt },
  ...history.map(m => ({ role: m.role, content: m.content })),
  { role: "user", content: transcript },
];
```

客户端不再需要传完整 messages，只传 `sessionId` + 当前 `transcript`。

#### 客户端改动

**`src/store/conversation.ts` 精简**：

```typescript
interface ConversationState {
  // 当前 session（内存缓存，不持久化）
  activeSessionId: string | null;
  messages: ChatMessage[];  // 当前 session 消息的本地 mirror

  // UI 状态（保留）
  isProcessing: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  streamingText: string;
  currentTranscript: string;

  // Actions
  setActiveSession: (sessionId: string, messages?: ChatMessage[]) => void;
  appendMessage: (message: ChatMessage) => void;  // 本地追加 + 调 API 持久化
  clearSession: () => void;
}
```

**`src/server-api/client.ts` 新增**：

```typescript
export const sessionService = {
  touch: () => fetchJSON<{ sessionId: string; isNew: boolean; previousSummary?: string }>('/api/session/touch', { method: 'POST' }),
  addMessage: (sessionId: string, msg: { role: string; content: string; evidenceUri?: string }) =>
    fetchJSON(`/api/session/${sessionId}/message`, { method: 'POST', body: JSON.stringify(msg) }),
  listSessions: (params?: { limit?: number; offset?: number }) =>
    fetchJSON<{ sessions: SessionSummary[] }>(`/api/session/list?${new URLSearchParams(params)}`),
  getMessages: (sessionId: string) =>
    fetchJSON<{ messages: ChatMessage[] }>(`/api/session/${sessionId}/messages`),
};
```

**`src/perceivers/voice-perceiver.ts` 改动**：

```typescript
// handleWakeword 中，开始录音前先 touch session
const { sessionId, isNew, previousSummary } = await sessionService.touch();
conversationStore.setActiveSession(sessionId);
// previousSummary 可作为本次 LLM 上下文的补充 hint

// finishListening 中，消息写入
await sessionService.addMessage(sessionId, { role: 'user', content: transcript });
// ... LLM 响应后
await sessionService.addMessage(sessionId, { role: 'assistant', content: response, evidenceUri });
```

#### 对话页改造（`app/(tabs)/conversation.tsx`）

**从实时对话 → 历史对话查看器**：

- 移除 `VoiceButton`（不再需要在此页面发起对话）
- 进入页面时调 `sessionService.listSessions()` 加载列表
- 列表显示所有历史 sessions，按时间倒序
- 点击某个 session → 调 `sessionService.getMessages(id)` 展开查看
- 当前活跃 session 置顶，带"进行中"标记
- 每个 session 卡片显示：时间范围 + 摘要 + 消息数

**UI 结构**：

```tsx
// Session 列表
<FlatList data={sessions} renderItem={SessionCard} />

// SessionCard 展开后
<View>
  <Text>{session.summary}</Text>
  <FlatList data={session.messages} renderItem={ChatBubble} />
</View>
```

---

## 验收标准（全局）

1. **端到端流程**：用户唤醒 → VAD 自动检测说完 → ASR 转写 → 字幕显示 → LLM 流式回复 → 分句 TTS 播放 → 字幕淡出，全链路无需手动操作
2. **首字延迟**：从用户说完到屏幕出现第一个回复 token ≤ 2s（不含 ASR 耗时）
3. **首句语音延迟**：从第一个 token 到 TTS 开始播放第一句 ≤ 3s
4. **字幕同步**：TTS 播放时字幕内容与语音一致，无明显错位
5. **VAD 准确性**：正常语速对话下，不会在句中截断（minSilence 800ms），也不会在用户明显停顿后仍继续等待超过 2s
6. **Session 连续性**：5 分钟内再次唤醒可续接上下文，LLM 回复体现对前文的理解
7. **Session 隔离**：超时后新 session 不受前一个 session 内容影响（除摘要 hint）
8. **历史可查**：对话页可查看所有历史 session 列表及其消息内容
9. **异常恢复**：网络断开 / SSE 中断时，不崩溃、不卡死，UI 回到 idle 状态并给出提示
10. **资源释放**：对话结束后 VAD、录音流、SSE 连接正确释放，无内存泄漏

---

## 风险和依赖

| 风险 | 缓解 |
|------|------|
| VAD 模型未内置，需要下载 silero_vad.onnx (~2MB) | 复用现有模型下载机制，加入 VAD 模型 |
| audio-studio 流同时给 VAD 和文件录制可能冲突 | expo-audio 录文件独立于 audio-studio 流，互不干扰 |
| RN fetch streaming 在某些 Android 版本不稳定 | 降级方案：WebSocket 替代 SSE |
| MiniMax TTS 延迟较高（~1-2s per sentence） | 预合成下一句 + 首句缩短（控制 LLM 首句长度） |
| Session 服务端需 pg 建表 | 复用 mem0 同一个 pg 实例，migration 脚本一次搞定 |
| 摘要生成需要额外 LLM 调用 | 异步生成，不阻塞用户体验；失败时留空不影响核心流程 |
| 服务端不在线时客户端看不到历史 | LOOI 本身依赖 server，不存在纯离线场景；客户端缓存当前 session 消息供 UI 即时显示 |

---

## 实施顺序建议

Phase 1 (VAD) 和 Phase 2 (SSE) 可以并行，因为一个改客户端录音逻辑，一个改服务端。
Phase 3 (字幕 UI) 在 Phase 2 之后做（需要 stream 数据驱动）。
Phase 4 (流式 TTS) 依赖 Phase 2 + 3。
Phase 5 (图片浮层) 独立，可随时做。
Phase 6 是最终集成。
Phase 7 (Session 管理) 建议在 Phase 6 集成时一并纳入。服务端部分（建表 + API）可以提前做，因为不影响现有功能；客户端接入在 Phase 6 串联时顺手改。
