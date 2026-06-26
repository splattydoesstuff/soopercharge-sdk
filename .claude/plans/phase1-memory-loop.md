# LOOI Phase 1 — 记忆闭环 MVP 技术方案

> 架构设计详见 [docs/architecture-perception-layer.md](../../docs/architecture-perception-layer.md)

## 目标

跑通"多模态感知 → Observation → 记忆存储 → 检索回答 → 语音播报"完整链路。
单主人、无云台。验证 Observation 统一架构和记忆能力。

---

## 技术选型

| 层 | 选型 | 说明 |
|----|------|------|
| 前端框架 | Expo SDK 56 (RN 0.85 + React 19.2) | 跨平台 iOS/Android |
| 后端 | Supabase (Postgres + pgvector + Storage + Edge Functions) | 记忆 + 向量检索 + 证据存储 + Auth |
| 记忆层 | Mem0 OSS (`mem0ai` npm) | 自动提取 fact + 存储 + 语义检索，后端接 Supabase pgvector |
| 视觉理解 | MiniCPM-V 4.6 (GGUF, ~2GB) | 部署本地服务器(M2 Max)，支持视频理解，零云端成本 |
| LLM | @mariozechner/pi-ai | 统一多 provider 接口，支持 OpenAI/Anthropic/Google 等 |
| 唤醒词 | sherpa-onnx KWS (Zipformer, ~3MB) | on-device，开放词汇，无需训练，写关键词即用 |
| 声纹验证 | sherpa-onnx Speaker ID (3D-Speaker ERes2Net, ~20MB) | on-device，注册 3 遍唤醒词即完成，cosine 验证 <200ms |
| STT | sherpa-onnx + SenseVoice (~254MB) | 设备端运行，内置 VAD，中文优秀，同一框架 |
| TTS | MiniMax Speech 2.8 (HTTP streaming) | 流式合成，中文自然度高 |
| 本地服务器 | M2 Max (96GB + 8TB) | 跑 MiniCPM-V + Mem0 + 决策引擎，HTTP REST API |
| 视频输入 | 双模式：实时流 (WebSocket) + 智能截帧 | 根据设备状态自动切换 |
| 轻量检测 | 帧差法 + YOLO-Nano (~5MB) | App 端运行，触发视频上传 |
| 日历 | expo-calendar | 读取系统日历事件 |
| 状态管理 | Zustand | 轻量、TS 友好 |

---

## 目录结构

```
super-looi/
├── app/                          # Expo Router 页面
│   ├── (tabs)/
│   │   ├── index.tsx             # 主对话界面
│   │   ├── memories.tsx          # 记忆列表
│   │   └── settings.tsx          # 设置
│   └── _layout.tsx
├── src/
│   ├── core/
│   │   ├── observation.ts        # Observation 类型定义
│   │   ├── perceiver.ts          # Perceiver 接口定义
│   │   ├── context-service.ts    # 服务器 API 封装：记忆/检索
│   │   └── decision-engine.ts    # 是否提醒、是否追问（可本地可服务端）
│   ├── perceivers/
│   │   ├── voice-perceiver.ts    # 唤醒 + STT → Observation
│   │   ├── camera-perceiver.ts   # 双模式视频采集 + 上传
│   │   └── calendar-perceiver.ts # 日历轮询 → Observation
│   ├── voice/
│   │   ├── sherpa-bridge.ts      # sherpa-onnx Native Module（KWS + STT + 声纹，统一桥接）
│   │   ├── wakeword.ts           # KWS 配置 + "Hey Moge" 关键词
│   │   ├── speaker-id.ts         # 声纹注册 + 验证逻辑
│   │   ├── stt.ts                # SenseVoice STT 控制
│   │   ├── tts.ts                # MiniMax TTS 流式播放
│   │   └── vad.ts                # 语音活动检测控制
│   ├── camera/
│   │   ├── capture.ts            # expo-camera 录制 + 环形 buffer
│   │   ├── mode-switcher.ts      # 充电/电池状态 → 切换 streaming/smart_capture
│   │   ├── light-detector.ts     # 本地轻量检测（帧差/YOLO-Nano）
│   │   └── uploader.ts           # 帧流 WebSocket / 视频片段 HTTP 上传
│   ├── llm/
│   │   ├── client.ts             # pi-ai 初始化 + model 配置
│   │   ├── intent-classifier.ts  # 判断用户意图：记事/检索/闲聊
│   │   └── response-generator.ts # 拿 Mem0 facts 生成自然语言回复
│   ├── memory/
│   │   ├── mem0-client.ts        # Mem0 OSS 初始化 + Supabase 配置
│   │   └── metadata.ts           # metadata tag 定义 + 分类逻辑
│   ├── server-api/
│   │   └── client.ts             # 本地服务器 HTTP/WS 客户端封装
│   ├── reminder/
│   │   ├── calendar-sync.ts      # 读取系统日历
│   │   ├── reminder-scheduler.ts # 定时检查 + 触发提醒
│   │   └── notification.ts       # 本地推送
│   ├── store/
│   │   ├── conversation.ts       # 当前对话状态
│   │   └── user.ts               # 用户偏好
│   └── ui/
│       ├── ChatBubble.tsx
│       ├── MemoryCard.tsx
│       ├── ReminderCard.tsx
│       └── VoiceButton.tsx
├── server/                        # 本地服务器（跑在 M2 Max 上）
│   ├── src/
│   │   ├── index.ts              # Express/Fastify 入口
│   │   ├── routes/
│   │   │   ├── vision.ts         # POST /api/vision/describe
│   │   │   ├── memory.ts         # POST /api/memory/add, /search, /getAll
│   │   │   └── stream.ts         # WebSocket /ws/frames (实时帧流)
│   │   ├── vision/
│   │   │   ├── minicpm-runner.ts # llama.cpp + MiniCPM-V 4.6 推理
│   │   │   └── scene-analyzer.ts # 连续帧 → 事件检测逻辑
│   │   ├── memory/
│   │   │   ├── mem0-service.ts   # Mem0 OSS 实例
│   │   │   └── evidence.ts       # 证据帧存储管理
│   │   └── config.ts
│   ├── models/                    # GGUF 模型文件
│   │   └── minicpm-v-4.6.gguf
│   ├── package.json
│   └── tsconfig.json
├── native-modules/
│   └── sherpa-onnx/              # 统一语音 Native Module (KWS + STT + Speaker ID)
│       ├── ios/
│       ├── android/
│       └── models/               # 模型文件引用
│           ├── kws-zipformer-zh-en-3M.onnx
│           ├── sensevoice-small.onnx
│           └── 3dspeaker-eres2net.onnx
├── supabase/
│   ├── migrations/
│   │   └── 001_init.sql          # profiles + conversations 表
│   └── functions/
│       └── embed/                # Edge Function: 备用嵌入接口
├── assets/
├── app.json
├── package.json
└── tsconfig.json
```

---

## 数据流

### 流程 A：语音记事（纯语音）

```
[常驻待机] sherpa-onnx KWS 低功耗监听 "Hey Moge"
    ↓ 唤醒词命中 + 声纹验证通过
[开始录音] SenseVoice STT 启动
    ↓ VAD 检测到语句结束
Voice Perceiver → Observation { source: "voice", content: "我把 AirPods 放书桌左边了" }
    ↓
[intent-classifier] → 判定为「记事」
    ↓
[Mem0.add()] → 存入记忆 (metadata: { category: "placement" })
    ↓
[response-generator] → "好的，记住了"
    ↓
[MiniMax TTS] → 语音播报 → 回到待机
```

### 流程 A2：语音 + 视觉记事

```
用户说 "Hey Moge，记住这个放这了"
    ↓
Voice Perceiver → transcript: "记住这个放这了"（含指示词"这"）
    ↓ 触发 Camera Perceiver
Camera Perceiver → 截取 buffer 最近 5s 视频 → HTTP POST 到本地服务器
    ↓
服务器: MiniCPM-V 4.6 → "书桌上有一串银色钥匙在键盘左侧"
      → 存证据帧 → evidenceUri
      → Mem0.add(合并内容, metadata)
    ↓ 返回
App: [response-generator] → "好的，记住了，钥匙在书桌键盘旁边"
   → [MiniMax TTS] → 播报
```

### 流程 B：检索

```
[常驻待机] sherpa-onnx KWS 监听 "Hey Moge"
    ↓ 唤醒 + 声纹验证
Voice Perceiver → Observation { source: "voice", content: "我的钥匙在哪" }
    ↓
[intent-classifier] → 判定为「检索」
    ↓
[Mem0.search()] → 命中相关 facts（含 evidenceUri）
    ↓
[response-generator] → "你之前放在书桌键盘左侧，我当时拍了照片"
    ↓
[MiniMax TTS] → 语音播报
[UI] → 展示记忆卡片 + 证据截图
```

### 流程 C：主动提醒

```
Calendar Perceiver → Observation { source: "calendar", content: "14:00 Agent Context 会议" }
    ↓
[decision-engine] → 判断是否需要提醒
    ↓
[Mem0.search()] → 检索关联记忆
    ↓
[response-generator] → 拼装上下文话术
    ↓
[MiniMax TTS] → 语音播报
[UI] → 显示 ReminderCard
```

---

## 数据库设计 (Supabase)

Mem0 OSS 使用 Supabase pgvector 作为向量存储后端，表结构由 Mem0 自动管理。
额外需要的表：

```sql
-- 主人档案（Phase 1 仅一条）
create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  preferences jsonb default '{}',
  created_at timestamptz default now()
);

-- 对话历史（保留最近上下文用）
create table conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  messages jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## Mem0 记忆方案

### 初始化

```typescript
import { Memory } from "mem0ai/oss";

const memory = new Memory({
  vectorStore: {
    provider: "supabase",
    config: {
      url: process.env.SUPABASE_URL,
      apiKey: process.env.SUPABASE_ANON_KEY,
      collectionName: "looi_memories",
      dimension: 1536,
    }
  },
  llm: {
    provider: "openai",
    config: { model: "gpt-5-mini" }  // 用于 fact 提取，轻量即可
  },
  embedder: {
    provider: "openai",
    config: { model: "text-embedding-3-small" }
  }
});
```

### Metadata 分类标签

每次 `memory.add()` 时附带 metadata，支持后续精确筛选：

```typescript
// src/memory/metadata.ts
export type MemoryCategory =
  | "placement"        // 物品放置："我把X放在Y"
  | "preference"       // 偏好："我喜欢X"
  | "reminder"         // 提醒相关："提醒我X"
  | "note"             // 通用笔记
  | "calendar";        // 日历关联记忆

export interface MemoryMetadata {
  category: MemoryCategory;
  timestamp: string;          // ISO 时间
  source: "voice" | "calendar" | "manual";
}
```

### 使用示例

```typescript
// 记事
await memory.add(
  [{ role: "user", content: "我把 AirPods 放书桌左边了" }],
  {
    userId: "owner-1",
    metadata: { category: "placement", timestamp: new Date().toISOString(), source: "voice" }
  }
);

// 检索（语义搜索）
const results = await memory.search("AirPods 在哪", {
  filters: { userId: "owner-1" }
});

// 按类别筛选（如：列出所有放置记忆）
const placements = await memory.getAll({
  filters: { userId: "owner-1", metadata: { category: "placement" } }
});
```

---

## 语音栈集成方案 (sherpa-onnx 统一框架)

Phase 1 统一使用 **sherpa-onnx** 框架，一个 Native Module 同时提供三个能力：

| 能力 | 模型 | 大小 |
|------|------|------|
| 唤醒词 (KWS) | Zipformer zh-en | ~3MB |
| 声纹验证 (Speaker ID) | 3D-Speaker ERes2Net | ~20MB |
| 语音识别 (STT) | SenseVoice | ~254MB |

sherpa-onnx 已有 React Native 社区包（`react-native-sherpa-onnx`），底层 C++ 支持全部能力。

降级方案：如果 RN 桥接 KWS/Speaker ID 复杂度过高，Phase 1 先用 Whisper API 做 STT 后备，sherpa-onnx 全量集成放到 Phase 1.5。

---

## 唤醒词方案 ("Hey Moge")

### 技术选型：sherpa-onnx KWS (Zipformer)

- 模型：`sherpa-onnx-kws-zipformer-zh-en-3M`（中英双语）
- 模型大小：~3MB
- 原理：小型 ASR + 受限解码，仅识别关键词列表中的词
- 自定义方式：写 keywords.txt 即可，**无需训练**
- 开源：Apache 2.0

```
# keywords.txt
嘿 魔 戈 :1.5 #0.25
```

---

## 声纹验证方案 (3D-Speaker)

### 技术选型：sherpa-onnx Speaker ID

- 模型：`3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx`
- 参数量：17.8M
- 模型大小：~20MB
- 推理速度：小米9级 (SD855) 约 100-200ms
- 原理：提取声纹 embedding → cosine similarity 比对
- 中文优化：训练数据含大量中文语料

### 注册流程

```
首次使用 → App 引导 "请说三遍 Hey Moge"
         → 取三段音频 → ERes2Net → 三个 embedding → 平均
         → 存入本地 SecureStore（声纹不出设备）
```

### 验证流程

```
唤醒词命中 → 取唤醒词音频段 → ERes2Net embedding
          → cosine similarity vs 注册模板
          → > 0.6 → 确认是主人 → 进入 LISTENING
          → < 0.6 → 忽略 → 回到 SLEEPING
```

---

## 状态机

```
┌─────────────┐   唤醒词命中    ┌─────────────┐
│   SLEEPING  │ ─────────────→ │  VERIFYING   │
│ (KWS 3MB)   │                │ (Speaker ID) │
└─────────────┘                └──────┬───────┘
       ↑                              │ 声纹通过
       │                       ┌──────▼───────┐
       │                       │  LISTENING    │
       │                       │ (SenseVoice)  │
       │                       └──────┬───────┘
       │                              │ VAD 静音超时
       │        ┌─────────────┐       │
       │        │ PROCESSING  │ ←─────┘
       │        │  (LLM+TTS)  │
       │        └──────┬───────┘
       │               │ 播报结束
       └───────────────┘
```

### 细节

1. **SLEEPING 态**：仅 KWS (Zipformer 3MB) 运行，极低功耗
2. **VERIFYING 态**：唤醒词音频段送入 3D-Speaker，cosine 比对声纹（~100-200ms）
3. **LISTENING 态**：声纹通过后，SenseVoice 接管麦克风，VAD 判断说话结束
4. **PROCESSING 态**：STT 结果送入服务器 LLM → 生成回复 → TTS 播报
5. **多轮对话**：播报结束后可设置短窗口（3-5 秒）直接进入 LISTENING，无需再次唤醒
6. **声纹拒绝**：cosine < 0.6 → 忽略本次唤醒，回到 SLEEPING
7. **打断**：播报期间检测到唤醒词可中断当前 TTS

---

## 关键接口定义

```typescript
// src/core/context-service.ts — Mem0 薄封装
export interface ContextService {
  remember(messages: Message[], metadata: MemoryMetadata): Promise<void>;
  search(query: string, filters?: { category?: MemoryCategory }): Promise<MemoryResult[]>;
  getAll(filters?: { category?: MemoryCategory }): Promise<MemoryResult[]>;
}

// src/llm/intent-classifier.ts
export type UserIntent = "store" | "search" | "remind" | "chat";
export function classifyIntent(transcript: string): Promise<UserIntent>;

// src/llm/response-generator.ts
export function generateResponse(
  intent: UserIntent,
  context: { facts: MemoryResult[]; transcript: string }
): Promise<string>;

// src/memory/metadata.ts
export type MemoryCategory = "placement" | "preference" | "reminder" | "note" | "calendar";
export interface MemoryMetadata {
  category: MemoryCategory;
  timestamp: string;
  source: "voice" | "calendar" | "manual";
}
```

---

## 实现步骤（按顺序）

### Step 1: 项目脚手架
- `npx create-expo-app@latest` (SDK 56)
- 配置 Expo Router + TypeScript
- 安装依赖：zustand, @supabase/supabase-js, mem0ai, @mariozechner/pi-ai, react-native-sherpa-onnx, expo-camera

### Step 2: Observation 核心层
- 实现 observation.ts 类型定义
- 实现 perceiver.ts 接口
- 实现 Perceiver 调度器（管理多个 perceiver 的生命周期）

### Step 3: 本地服务器搭建
- 初始化 server/ 项目（Express/Fastify + TypeScript）
- 集成 MiniCPM-V 4.6 GGUF（llama.cpp 绑定）
- 实现 REST API：POST /api/vision/describe（视频/图片 → 场景描述）
- 实现 WebSocket /ws/frames（接收实时帧流）
- 实现 scene-analyzer（连续帧 → 事件检测）
- 验证：发一张图片 → 返回合理描述

### Step 4: Mem0 + Supabase 搭建（部署在服务器）
- 创建 Supabase 项目（含 Storage bucket）
- 配置 Mem0 OSS 使用 Supabase pgvector 后端
- 实现 context-service.ts（remember / search / getAll）
- 定义 metadata 分类标签
- 写测试：add 一条 placement 记忆 → search 能找回来 → 按 category filter 能筛选

### Step 5: LLM 层（部署在服务器）
- 配置 pi-ai model
- 实现 intent-classifier（判断：记事 / 检索 / 闲聊）
- 实现 response-generator（拿 Mem0 facts 生成回复）
- 写测试：给定 transcript → 验证意图分类 + 回复质量

### Step 6: 语音层（sherpa-onnx 统一集成）
- 配置 sherpa-onnx Native Module（KWS + Speaker ID + SenseVoice STT）
- 配置 keywords.txt（"嘿 魔 戈"）
- 实现 voice-perceiver.ts（KWS 唤醒 → 声纹验证 → STT → Observation）
- 实现 speaker-id.ts（注册流程 + 验证逻辑）
- 接 MiniMax TTS 做流式播放
- 验证完整语音对话循环：唤醒 → 声纹确认 → 录音 → 识别 → 回复 → 回到待机
- 降级路径：如 sherpa-onnx RN 桥接遇阻，先接 Whisper API 做 STT

### Step 7: 摄像头层
- 实现 camera-perceiver.ts（expo-camera 双模式：streaming + smart_capture）
- 实现 mode-switcher.ts（根据充电/网络状态切换模式）
- 实现 light-detector.ts（帧差法 + YOLO-Nano 轻量检测）
- 实现 uploader.ts（WebSocket 帧流 + HTTP 视频片段上传）
- 实现 voice+camera 联合触发逻辑（指示词检测 → 截取 buffer 上传）
- 验证：用户说"记住这个" → 视频上传服务器 → MiniCPM-V 理解 → 存入记忆

### Step 8: UI
- 对话主界面（语音按钮 + 气泡）
- 记忆列表页（含证据缩略图）
- 提醒卡片组件

### Step 9: 日历提醒
- 实现 calendar-perceiver.ts
- 定时检查 + 本地通知
- 拼装提醒话术

### Step 10: 人脸识别预研（可选，为 Phase 2 铺路）
- 调研设备端 / 服务器端人脸识别方案
- 确认和声纹的融合策略
- 预留 Perceiver 接口

---

## 验收标准（Phase 1）

1. ✅ 用户语音说"我把钥匙放抽屉里了" → 系统确认记住
2. ✅ 用户说"记住这个放这了" → 系统截帧 + 存储记忆（含证据图片）
3. ✅ 用户问"我钥匙放哪了" → 系统返回正确位置 + 展示证据截图
4. ✅ 日历有事件即将开始 → 系统推送提醒
5. ✅ 不确定时明确说"我不记得" → 不编造
6. ✅ 语音输入 → 语音回复，全程免手操作（"Hey Moge" 唤醒）
7. ✅ iOS + Android 双平台可运行

---

## 风险与降级

| 风险 | 降级方案 |
|------|----------|
| sherpa-onnx RN 桥接复杂 | 先用 Whisper API 做 STT，KWS 用按钮模拟，逐步替换 |
| 3D-Speaker 声纹误判率高 | 调整 threshold，或加 multi-turn 确认 |
| Mem0 语义检索不够精准 | 结合 metadata category filter 做精确筛选 |
| Mem0 fact 提取遗漏关键信息 | 调整 Mem0 的 LLM prompt 或加 custom instructions |
| Vision LLM 调用成本/延迟 | MiniCPM-V 在本地服务器运行，零云端成本；服务器离线时降级为纯语音模式 |
| MiniMax TTS 延迟高 | 加预加载 + 分段合成 |
| pi-ai 不支持某 provider | 直接调 provider SDK 作为 fallback |
| 模型总体积大 (~277MB) | 首次启动按需下载，非全量打包 |
