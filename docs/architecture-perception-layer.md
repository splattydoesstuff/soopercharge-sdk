# LOOI 架构设计：感知与观察层

## 设计原则

LOOI 的输入不是"语音"，而是"观察"。任何模态的感知——语音、摄像头、日历、传感器——最终都归一为一条 Observation，统一进入记忆系统。

这意味着：
- 新增一个输入模态 = 新增一个 Perceiver，不改下游
- 记忆层只认 Observation，不关心它是怎么来的
- 证据（图片、音频片段）与记忆文本分离存储，通过 URI 关联

---

## 系统分层

```
┌─────────────────── App（iOS/Android）───────────────────┐
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              感知层 (Perceivers)                  │    │
│  │                                                   │    │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────────┐   │    │
│  │  │  Voice  │  │  Camera  │  │   Calendar   │   │    │
│  │  │Perceiver│  │Perceiver │  │  Perceiver   │   │    │
│  │  │(on-device)│ │(采集+轻检)│ │(expo-calendar)│   │    │
│  │  └────┬────┘  └────┬─────┘  └──────┬───────┘   │    │
│  └───────┼─────────────┼───────────────┼───────────┘    │
│          │             │               │                 │
│          ▼             │               ▼                 │
│   Observation          │        Observation              │
│   (voice完成)          │        (calendar完成)            │
│                        │                                 │
└────────────────────────┼─────────────────────────────────┘
                         │ HTTP / WebSocket
                         ▼
┌─────────────────── 本地服务器 (M2 Max) ──────────────────┐
│                                                           │
│  ┌─────────────────────────────────────────────────┐     │
│  │         MiniCPM-V 4.6 视觉理解                    │     │
│  │   帧/视频 → 场景描述 → Observation (camera完成)    │     │
│  └──────────────────────┬──────────────────────────┘     │
│                          │                                │
│                          ▼                                │
│  ┌─────────────────────────────────────────────────┐     │
│  │         记忆层 (Mem0 + PostgreSQL pgvector)       │     │
│  │   Observation.content → Mem0.add(content, meta)   │     │
│  └──────────────────────┬──────────────────────────┘     │
│                          │                                │
│                          ▼                                │
│  ┌─────────────────────────────────────────────────┐     │
│  │         决策层 (Decision Engine + LLM)            │     │
│  │   意图识别 / 是否回复 / 是否提醒 / 是否存储       │     │
│  └──────────────────────┬──────────────────────────┘     │
│                          │                                │
└──────────────────────────┼────────────────────────────────┘
                           │ HTTP response
                           ▼
┌─────────────────── App ──────────────────────────────────┐
│  ┌─────────────────────────────────────────────────┐     │
│  │              输出层 (Output)                      │     │
│  │                                                   │     │
│  │  语音 (MiniMax TTS) / 屏幕卡片 / 通知            │     │
│  └─────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

---

## Observation 数据模型

```typescript
/**
 * 观察来源——每种 Perceiver 对应一个 source 类型
 */
export type ObservationSource =
  | "voice"          // 纯语音输入
  | "camera"         // 纯视觉输入（自动截帧、用户触发拍照）
  | "voice+camera"   // 语音 + 同步截帧（用户说"记住这个"时）
  | "calendar"       // 日历事件同步
  | "system";        // 系统级事件（如 app 启动、位置变化）

/**
 * 记忆分类标签——用于 Mem0 metadata filter
 */
export type MemoryCategory =
  | "placement"      // 物品放置
  | "preference"     // 用户偏好
  | "reminder"       // 提醒事项
  | "scene"          // 场景描述（视觉记录）
  | "note"           // 通用笔记
  | "calendar";      // 日历关联

/**
 * Observation 元数据
 */
export interface ObservationMetadata {
  category: MemoryCategory;
  source: ObservationSource;
  timestamp: string;           // ISO 8601
  confidence?: number;         // 0-1，感知置信度
  location?: string;           // 可选：地理位置或空间位置描述
}

/**
 * 统一观察模型——所有 Perceiver 的输出都是这个
 */
export interface Observation {
  /** 文本内容：语音 transcript 或 Vision LLM 对图像的描述 */
  content: string;

  /** 原始证据 URI（本地服务器 HTTP 路径） */
  evidenceUri?: string;

  /** 元数据 */
  metadata: ObservationMetadata;
}
```

---

## Perceiver 接口

```typescript
/**
 * 所有感知器的统一接口
 */
export interface Perceiver {
  /** 感知器名称 */
  name: string;

  /** 启动感知 */
  start(): Promise<void>;

  /** 停止感知 */
  stop(): Promise<void>;

  /** 订阅观察事件 */
  onObservation(handler: (observation: Observation) => void): void;
}
```

每种 Perceiver 的职责是：接收原始输入 → 转化为 Observation → 通知下游。

---

## Voice Perceiver

基于 **sherpa-onnx** 统一框架，一个 Native Module 完成唤醒 + 声纹 + 识别。

```
麦克风音频流 → sherpa-onnx KWS (Zipformer 3MB) 检测 "Hey Moge"
                 ↓ 命中
              3D-Speaker ERes2Net (~20MB) 声纹验证
                 ↓ cosine > 0.6 (确认是主人)
              SenseVoice STT (~254MB)
                 ↓
              transcript → Observation { source: "voice", content: transcript }
```

**输入**：音频流
**输出**：`Observation { source: "voice", content: "我把 AirPods 放书桌左边了" }`
**身份验证**：唤醒词音频段同时用于声纹比对，非主人的唤醒直接忽略

---

## Camera Perceiver

### 推理部署

MiniCPM-V 4.6 部署在本地服务器（M2 Max, 96GB），App 通过 HTTP REST API 送入视频/帧数据。

```
┌──────────────────┐          HTTP / WebSocket         ┌────────────────────────┐
│    App (iOS/Android)   │  ───────────────────────→  │   本地服务器 (M2 Max)     │
│                        │                             │                          │
│  - expo-camera 录制    │                             │  - MiniCPM-V 4.6 推理    │
│  - 环形帧 buffer      │                             │  - Mem0 + Embedding      │
│  - 轻量事件检测       │                             │  - PostgreSQL 连接       │
│  - 自适应上传策略     │                             │  - Evidence 存储         │
└──────────────────┘                                   └────────────────────────┘
```

### 双模式视频输入

根据设备状态自动切换两种工作模式：

#### 模式 A：实时帧流（Streaming Mode）

**激活条件**：设备充电中 / Wi-Fi 稳定 / 固定位置

```
App 摄像头 → 10-15fps 编码 → WebSocket 推送到服务器
                                    ↓
                          服务器连续理解场景
                                    ↓
                          主动检测事件（物品放置、人物出入）
                                    ↓
                          Observation { source: "camera", ... }
```

- 服务器可以**主动发现事件**，不依赖用户触发
- 适合"桌面固定机器人"形态
- 服务器维护帧窗口状态，做连续场景理解

#### 模式 B：智能截帧（Smart Capture Mode）

**激活条件**：电池供电 / 移动中 / 网络不稳

```
App 摄像头 → 每 2-5s 截帧 → 本地环形 buffer（不上传）
                                    ↓
                          本地轻量检测（YOLO/运动检测）
                                    ↓ 检测到事件候选
                          截取 buffer 最近 5-10s → 打包上传服务器
                                    ↓
                          MiniCPM-V 4.6 视频理解
                                    ↓
                          Observation { source: "camera", ... }
```

- 平时几乎零网络开销
- 本地轻量模型做初筛：运动检测 / YOLO 物体变化 / 手部动作
- 有事件候选时才上传视频片段给服务器深度理解

### 模式切换策略

```typescript
type CameraMode = "streaming" | "smart_capture";

function decideCameraMode(): CameraMode {
  if (isCharging && isWifiStable) return "streaming";
  return "smart_capture";
}
```

| 条件 | 模式 | 帧率 | 网络开销 |
|------|------|------|----------|
| 充电 + Wi-Fi | streaming | 10-15fps | 持续 |
| 电池 or 移动 | smart_capture | 0.2-0.5fps 截帧 | 仅触发时上传 |
| 网络断开 | smart_capture (本地缓存) | 0.2fps | 恢复后同步 |

### 视觉模型：MiniCPM-V 4.6

- 1.3B 参数，GGUF 格式 ~2GB 内存
- 官方适配 iOS / Android / HarmonyOS，有现成部署 demo
- 支持单图/多图/视频理解 + OCR
- 30+ 语言支持（中文优秀）
- 基于 llama.cpp 推理
- 部署在本地服务器，零云端成本，隐私数据不出本地网络

### 本地轻量检测（Smart Capture 的触发器）

在 App 端运行，用于判断"是否需要送视频到服务器"：

| 检测类型 | 方案 | 大小 | 用途 |
|----------|------|------|------|
| 运动检测 | 帧差法 (纯算法) | 0 | 画面有变化时才关注 |
| 物体变化 | YOLO-Nano / MobileNet | ~5MB | 检测物体出现/消失 |
| 手部动作 | MediaPipe Hands | ~10MB | 检测拿起/放下动作 |

这些轻量模型只做"要不要触发"的判断，不做理解。

**触发模式（Phase 1）**：

| 模式 | 触发条件 | 说明 |
|------|----------|------|
| 指令截帧 | 用户说"记住这个" / "看看这是什么" | 立即截取最近 buffer + 上传 |
| 语音伴随帧 | 每次语音输入时同步截取 | 作为上下文佐证 |
| 轻量检测触发 | YOLO/运动检测发现场景变化 | smart_capture 模式下自动触发 |
| 持续流 | 充电 + Wi-Fi | streaming 模式下服务器主动分析 |

**视觉推理**：App 端不做视觉理解，只做帧采集和轻量触发检测。所有视觉理解由本地服务器的 MiniCPM-V 4.6 完成。

---

## Voice + Camera 联合

当用户语音中包含指示词（"这个"、"这里"、"放这了"）时，自动触发截帧并合并为一条联合 Observation：

```typescript
// 联合观察示例
{
  source: "voice+camera",
  content: "用户说「我把钥匙放这了」。画面显示：木质书桌表面，一串银色钥匙放在键盘左侧。",
  evidenceUri: "storage://evidence/2026-06-26T14:32:00Z.jpg",
  metadata: {
    category: "placement",
    source: "voice+camera",
    timestamp: "2026-06-26T14:32:00Z"
  }
}
```

---

## Calendar Perceiver

```
系统日历 → expo-calendar 轮询（每 60s）
              ↓
           检测到新事件或即将开始的事件
              ↓
           Observation { source: "calendar", content: 事件摘要 }
```

---

## Evidence 存储

原始证据（图片、音频片段）存入本地服务器文件存储，记忆中只保留 URI 引用：

```
server/data/evidence/
├── evidence/
│   ├── images/
│   │   └── 2026-06-26T14-32-00Z_placement.jpg
│   └── audio/
│       └── 2026-06-26T14-32-00Z_voice.webm  (可选)
```

检索记忆时，如果有 `evidenceUri`，UI 可以展示当时的截图作为佐证。

---

## 数据流全景

```
用户说 "Hey Moge，我把钥匙放这了"
    │
    ├─→ Voice Perceiver: transcript = "我把钥匙放这了"
    │
    ├─→ Camera Perceiver: 检测到指示词"这" → 截帧 → MiniCPM-V 4.6 (本地)
    │       → scene = "书桌上一串银色钥匙在键盘左侧"
    │       → 图片上传 Storage → evidenceUri
    │
    └─→ 合并为 Observation {
          source: "voice+camera",
          content: "用户说把钥匙放这了。画面：书桌键盘左侧有一串银色钥匙。",
          evidenceUri: "storage://...",
          metadata: { category: "placement", ... }
        }
            │
            ▼
        Mem0.add(content, metadata)
            │
            ▼
        Response: "好的，记住了，钥匙在书桌键盘左侧"
            │
            ▼
        MiniMax TTS → 播报
```

---

## 扩展性

这个架构天然支持后续模态扩展：

| 未来 Perceiver | 输入 | Observation content |
|----------------|------|---------------------|
| 人脸识别 | 摄像头帧 | "识别到主人靠近" |
| 物体跟踪 | 连续帧 | "AirPods 从手中放到桌面" |
| 位置传感器 | GPS/蓝牙 | "主人到达办公室" |
| 屏幕截图 | 系统 API | "主人在看邮件，标题：xxx" |
| 智能家居 | IoT 事件 | "客厅灯已关闭" |

每个新 Perceiver 只需实现 `Perceiver` 接口，产出 `Observation`，下游不用改。
