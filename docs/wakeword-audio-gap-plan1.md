# Plan 1: 唤醒后音频丢失修复方案

## 问题

说完 "hey 魔哥" 后立即说话，前 270ms~1.5s 的音频被丢失，ASR 完全没收到。

## 根因

| 阶段 | 首次耗时 | 后续耗时 | 问题 |
|------|---------|---------|------|
| `sessionService.touch()` | 146ms | 85ms | 阻塞了后续流程 |
| `stopListeningStreaming()` | 137ms | 148ms | **清空了 ring buffer + 停了 feeder** |
| `vadService.start()` | 29ms | 14ms | 串行等待 |
| `streamingSttService.createStream()` | 1229ms | 19ms | 首次加载模型极慢 |
| **总计** | **1542ms** | **269ms** | preroll 取到 0 samples |

## 当前代码流程分析

### handleWakeword() 当前路径

```
handleWakeword()
  ├── guard checks (isListening, isProcessing, voiceState...)
  ├── 设置 UI 状态 (listening, overlay)
  ├── await sessionService.touch()              ← 85-146ms 阻塞
  │     └── 等待 HTTP 请求完成才继续
  └── startStreamingForListening(t0, t1)
        ↓
startListeningStreaming()
  ├── await stopListeningStreaming({resetAsr:true})  ← 137-148ms
  │     ├── unsubStreamingSamples()
  │     ├── waitForSampleDrains()
  │     ├── kwsAudioFeeder.setWakewordFeedingEnabled(true)
  │     ├── if running && !shouldRun → kwsAudioFeeder.stop()  ← 清空 recentSamples!
  │     ├── vadService.reset()
  │     └── streamingSttService.resetStream()
  ├── reset state (vadHadSpeech, buffers, segments...)
  ├── await vadService.start()                       ← 14-29ms 串行
  ├── await streamingSttService.createStream()       ← 1229ms/19ms 串行
  ├── subscribeSamples(...)                          ← 开始接收实时音频
  ├── setWakewordFeedingEnabled(false)
  ├── getRecentSamples(700ms)                        ← 返回 0！buffer 早被清了
  ├── 如果有 preroll → 推入 VAD + STT
  └── await kwsAudioFeeder.start()                   ← 重启 feeder（冗余）
```

### 核心矛盾

1. **ring buffer 在 stopListeningStreaming 中被清空**：`kwsAudioFeeder.stop()` → `stopInternal()` → `this.recentSamples = []`
2. **但 preroll 读取在 stop 之后**：等到 subscribeSamples + getRecentSamples 时已经没有 buffer 数据了
3. **feeder 实际上一直在跑**：唤醒时 feeder 处于运行状态（在喂 wakeword），根本不需要 stop/restart

---

## 修复措施

### 措施 1: App 启动时预热 `createStream`

**目标**：消灭首次唤醒 1.2s 模型加载延迟

**文件**：`src/core/app-bootstrap.ts`

**实现**：

```typescript
// 在 startRuntimePerceivers() 之后添加
async function prewarmStreamingStt(): Promise<void> {
  try {
    const { streamingSttService } = await import("../voice/streaming-stt");
    await streamingSttService.createStream();
    console.log("[Bootstrap] STT stream prewarmed");
  } catch (error) {
    console.warn("[Bootstrap] STT prewarm failed (will retry on first use):", error);
  }
}
```

**调用位置**：在 `bootstrapApp()` 中 `startRuntimePerceivers()` 完成后 fire-and-forget：

```typescript
await startRuntimePerceivers();

// Prewarm STT model so first wakeword doesn't pay cold-start penalty
prewarmStreamingStt();
```

**注意事项**：
- 必须确认 `createStream()` 是幂等的——再次调用应只 reset stream 而非重复加载模型
- `streamingSttService.init()` 内部已有 `initializing` guard，不会重复加载
- 预热失败不应阻塞启动流程

---

### 措施 2: `sessionService.touch()` 改为非阻塞

**目标**：省掉 85-146ms 阻塞

**文件**：`src/perceivers/voice-perceiver.ts` → `handleWakeword()`

**当前代码** (L197-212)：
```typescript
try {
  const session = await sessionService.touch();
  conversationStore.setActiveSession(session.sessionId);
  // ...logging
} catch (error) {
  console.warn("[VoicePerceiver] Session touch failed; continuing locally:", error);
}
```

**修改为**：
```typescript
// Fire-and-forget: session ID doesn't affect recording/ASR,
// only message attribution. Update store when result arrives.
sessionService.touch().then((session) => {
  useConversationStore.getState().setActiveSession(session.sessionId);
  voiceAcceptanceTrace.mark("session", {
    sessionId: session.sessionId,
    isNew: session.isNew,
  });
  console.log("[VoicePerceiver] Session touched (async)", {
    sessionId: session.sessionId,
    isNew: session.isNew,
  });
}).catch((error) => {
  console.warn("[VoicePerceiver] Session touch failed:", error);
});
```

**影响分析**：
- `session.sessionId` 仅用于后续 LLM 请求中标记消息归属
- ASR 录音和 VAD 完全不依赖 session
- transcript 产生后才需要 sessionId，此时异步 touch 早已完成
- 最坏情况：touch 超慢（>3s），用户说完话了 session 还没回来——需要在 finishListening/sendToLLM 时 fallback 到本地 session

---

### 措施 3: 唤醒时不停 feeder / 不调 `stopListeningStreaming`

**目标**：保护 ring buffer + 去掉冗余 stop/start cycle

**文件**：`src/perceivers/voice-perceiver.ts` → `startListeningStreaming()`

**关键洞察**：
- 唤醒进来时上一轮根本没有 active streaming（`unsubStreamingSamples === null`）
- `stopListeningStreaming` 的 defensive cleanup 是为了处理重复触发，但 guard 在 `handleWakeword` 已经处理了
- feeder 从未停止过（它一直在跑来喂 wakeword），stop 再 start 纯粹是多余的

**修改方案 A（最小改动）**：

在 `startListeningStreaming` 开头，判断是否真的需要 stop：

```typescript
private async startListeningStreaming(t0?: number, t1?: number): Promise<void> {
  const tBase = t0 ?? Date.now();
  
  // Only stop previous session if one was actually active
  if (this.unsubStreamingSamples) {
    await this.stopListeningStreaming({ resetAsr: true });
    console.log(`[VoicePerceiver][TIMING] stopListeningStreaming: ${Date.now() - tBase}ms`);
  } else {
    // No active streaming — just reset state, DON'T touch the feeder/buffer
    if (this.listeningTimeout) {
      clearTimeout(this.listeningTimeout);
      this.listeningTimeout = null;
    }
    await vadService.reset().catch(() => undefined);
    await streamingSttService.resetStream().catch(() => undefined);
  }
  
  // ... rest of function
}
```

**修改方案 B（更彻底——feeder 永不停）**：

改造 `stopListeningStreaming` 使其永远不调 `kwsAudioFeeder.stop()`：

```typescript
private async stopListeningStreaming(options: { resetAsr: boolean }): Promise<void> {
  // ... timers cleanup
  
  if (this.unsubStreamingSamples) {
    this.unsubStreamingSamples();
    this.unsubStreamingSamples = null;
  }

  this.vadQueuedSamples = null;
  this.streamingQueuedSamples = null;
  await this.waitForSampleDrains();
  this.vadHadSpeech = false;
  kwsAudioFeeder.setWakewordFeedingEnabled(true);
  
  // ❌ 移除：不再在这里 stop feeder
  // if (kwsAudioFeeder.isRunning && !this.shouldRunWakewordFeeder()) {
  //   await kwsAudioFeeder.stop();
  // }
  
  await vadService.reset().catch(() => undefined);
  if (options.resetAsr) {
    await streamingSttService.resetStream().catch(() => undefined);
    this.speechSamplesBuffer = [];
    this.speechSampleRanges = [];
    this.finalizedStreamingSegments = [];
    this.currentStreamingText = "";
  }
}
```

同时在 `startListeningStreaming` 末尾移除冗余的 `kwsAudioFeeder.start()`：

```typescript
// ❌ 移除：feeder 已经在跑
// try {
//   await kwsAudioFeeder.start();
// } catch (error) {
//   console.warn("[VoicePerceiver] Failed to start VAD audio feeder:", error);
// }
```

**推荐方案 A**：改动最小、最安全，且保留了 stop 作为边缘情况的兜底。

**风险与缓解**：
- 如果有其他路径会让 feeder 处于意外 stop 状态 → 在 `startListeningStreaming` 末尾增加条件性启动：
  ```typescript
  if (!kwsAudioFeeder.isRunning) {
    await kwsAudioFeeder.start();
  }
  ```

---

### 措施 4: `vadService.start()` 和 `createStream()` 并行

**目标**：省掉串行等待中较短的那个（14-29ms）

**文件**：`src/perceivers/voice-perceiver.ts` → `startListeningStreaming()`

**当前代码** (L623-631)：
```typescript
await vadService.start();
await streamingSttService.createStream();
```

**修改为**：
```typescript
const [, streamErr] = await Promise.allSettled([
  vadService.start().catch((error) => {
    console.warn("[VoicePerceiver] VAD unavailable; using safety timeout only:", error);
  }),
  streamingSttService.createStream(),
]);
console.log(`[VoicePerceiver][TIMING] vad+stt parallel: ${Date.now() - tBase}ms`);

if (streamErr.status === "rejected") {
  throw streamErr.reason; // STT is critical, must throw
}
```

**或更简洁**（如果 VAD 失败不影响后续）：

```typescript
await Promise.all([
  vadService.start().catch((error) => {
    console.warn("[VoicePerceiver] VAD unavailable:", error);
  }),
  streamingSttService.createStream(),
]);
```

---

### 措施 5: 预创建 ASR stream（可选增强）

**目标**：将 createStream 延迟从热路径彻底移除

**方案**：在 `finishListening()` 完成后（用户说完话），预创建下一轮的 stream

**文件**：`src/perceivers/voice-perceiver.ts`

**实现位置**：在 `finishListening` 的 finally block 或 `restartWakewordFeederIfNeeded` 之后：

```typescript
// After finishing current interaction, prepare for next wakeword
private async prepareForNextWakeword(): Promise<void> {
  try {
    await streamingSttService.createStream();
    console.log("[VoicePerceiver] Pre-created STT stream for next wakeword");
  } catch {
    // Best-effort; will create on next wakeword if this fails
  }
}
```

**前置条件**：
- 需要确认 `createStream()` 支持"预创建后 reset 再用"的模式
- 如果 `createStream` 每次都返回新 stream 且不会 leak 旧的，这是安全的
- 如果 stream 有超时/过期机制，需要在唤醒时检查是否仍然 valid

---

### 措施 6: preroll 取量兜底

**目标**：安全网——确保 preroll 读取正确的数据量

**当前值**：`WAKEWORD_AUDIO_PREROLL_MS = 700`，ring buffer 容量 1.2s

**修改**：考虑增大到 1000ms

```typescript
const WAKEWORD_AUDIO_PREROLL_MS = 1000; // was 700
```

**理由**：
- 用户说 "hey 魔哥" 约需 400-600ms
- 唤醒词的尾音可能和正式语音重叠
- 1000ms preroll 能确保唤醒词后紧跟的内容完整覆盖
- 不超过 1.2s buffer 容量

---

## 修复后代码流程

```
handleWakeword()
  ├── guard checks
  ├── 设置 UI 状态
  ├── sessionService.touch()  ← fire-and-forget, 不等
  └── startStreamingForListening(t0, t1)
        ↓
startListeningStreaming()
  ├── (unsubStreamingSamples===null) → 跳过 stop，仅 reset VAD/STT state
  ├── reset state (vadHadSpeech, buffers...)
  ├── await Promise.all([                         ← 并行
  │     vadService.start(),
  │     streamingSttService.createStream()        ← 已预热，<5ms
  │   ])
  ├── subscribeSamples(...)                       ← 开始接收实时音频
  ├── setWakewordFeedingEnabled(false)
  ├── getRecentSamples(1000ms)                    ← ring buffer 完整！拿到音频
  ├── 推入 VAD + STT                              ← preroll 覆盖唤醒后语音
  └── (feeder 一直在跑，无需 start)
```

## 预期效果

| 场景 | 修前 | 修后 |
|------|------|------|
| 首次唤醒到 ASR 收音 | 1542ms | <50ms |
| 后续唤醒到 ASR 收音 | 269ms | <50ms |
| preroll 音频 | 0ms | 700~1000ms |

## 文件影响清单

| 文件 | 改动内容 | 风险 |
|------|---------|------|
| `src/core/app-bootstrap.ts` | 添加 STT 预热 | 低：fire-and-forget，失败无影响 |
| `src/perceivers/voice-perceiver.ts` | session 非阻塞 + startListeningStreaming 重构 | 中：需确保 session race 无问题 |
| `src/perceivers/voice-perceiver.ts` | VAD/STT 并行 | 低：两者本就独立 |
| `src/perceivers/voice-perceiver.ts` | 跳过冗余 stop | 中：需验证无重入场景遗漏 |
| `src/voice/kws-audio-feeder.ts` | 可能无需改动 | — |
| `src/voice/streaming-stt.ts` | 确认 createStream 幂等性 | 低：只需阅读验证 |

## 测试验证点

1. **首次唤醒**：说 "hey 魔哥 今天天气怎么样"（唤醒词+命令连续说），ASR 完整识别"今天天气怎么样"
2. **连续唤醒**：第一次唤醒说话、回答完毕后，第二次唤醒立即说话，确认无丢失
3. **超时安全网**：唤醒后不说话，确认 safety timeout 仍正常触发 `finishListening`
4. **App 启动后首次**：冷启动后立即唤醒，确认不再有 1.2s 延迟
5. **边缘情况**：快速连续两次唤醒词（第一次还没完成就说第二次），确认 guard 正常拦截
6. **session 竞态**：touch 请求超慢（3s+），用户说完话并发送 LLM 请求时 session 才到——确认 fallback 正常

## 实施顺序建议

1. **措施 1** (STT 预热) — 独立改动，立刻消灭冷启动延迟
2. **措施 3** (跳过冗余 stop) — 最关键修复，恢复 preroll 功能
3. **措施 2** (session 非阻塞) — 简单但省 100ms+
4. **措施 4** (并行化) — 锦上添花
5. **措施 6** (preroll 取量) — 常量调整
6. **措施 5** (预创建 stream) — 可选优化

前 3 个措施组合即可达到 <50ms 目标。
