# 声纹识别多样本注册方案

## 背景

当前声纹识别只使用单次录入的一个 embedding 作为 owner 模板。用户换一种说话方式（语速、音量、情绪、距离）后，cosine similarity 显著下降，导致频繁误拒。

## 目标

通过多样本注册，让声纹模板覆盖用户日常说话的声音变化范围，提升验证通过率，同时保持对非 owner 的拒绝能力。

## 第一版边界

- 实现多样本注册、v1 -> v2 迁移、本地多模板验证、手动追加录入。
- 记录 owner / non-owner 验证 score，用于后续阈值审计。
- 不实现验证通过后的自动模板新增、自动模板替换或 centroid 自动融合。
- 不保存原始验证音频。

## 方案设计

### 1. 注册流程

#### 引导式多样本采集

注册时引导用户录制 3-5 段不同风格的语音：

| 序号 | 提示 | 目的 |
|------|------|------|
| 1 | "请用正常音量说一句话" | 基线 |
| 2 | "请稍微轻声说一句话" | 低能量覆盖 |
| 3 | "请稍微快一点说一句话" | 语速变化覆盖 |
| 4 | "请随意说几句话" | 自然状态 |
| 5 | (可选) "请离远一点说一句话" | 远场覆盖 |

每段最少 2 秒有效语音（静音段去除后）。

#### 数据结构变更

```typescript
type SpeakerEnrollmentSource = "onboarding" | "settings-append" | "migration";

type SpeakerEnrollmentQuality = {
  ok: boolean;
  durationMs: number;
  energyMean?: number;
  reason?: "too-short" | "too-quiet" | "low-confidence";
};

interface StoredSpeakerTemplate {
  id: string;
  embedding: number[];
  createdAt: string;
  source: SpeakerEnrollmentSource;
  durationMs: number;
  quality: SpeakerEnrollmentQuality;
  promptId?: string;
  lastMatchedAt?: string;
  matchCount?: number;
}

interface StoredSpeakerEmbedding {
  version: 2; // bump version
  speakerName: string;
  // 保留多个带来源和质量元数据的模板
  templates: StoredSpeakerTemplate[];
  // 聚合后的中心 embedding（用于快速验证）
  centroid: number[];
  createdAt: string;
  updatedAt: string;
}
```

兼容 version 1：读取时如果 version === 1，将单个 embedding 包装为一个 `templates` 元素，`source` 标记为 `settings-append`，`durationMs` 和 `quality` 使用 unknown-safe 默认值，并计算 centroid。

### 2. 验证策略

采用 **centroid + max-similarity** 双重判定：

```
score = max(
  cosineSimilarity(input, centroid),
  max(cosineSimilarity(input, template.embedding) for each template in templates)
)

verified = score >= threshold
```

- centroid 匹配：覆盖「平均状态」的快速通过
- max-similarity 匹配：任何一个注册样本与当前输入接近即通过，覆盖边缘状态

阈值可以比单样本时适度提高（比如从 0.35 提到 0.40），因为多模板天然提供了更好的覆盖。

验证结果应返回可观测分数，至少包括：

- `score`
- `centroidScore`
- `bestTemplateScore`
- `bestTemplateId`
- `threshold`
- `verified`

这些数据用于日志和回归分析，不触发自动模板更新。

### 3. 暂缓渐进式自适应更新

第一版不做自动自适应更新，只支持 onboarding 注册和设置页手动追加录入。

原因：

- 自动吸收验证通过样本存在模板污染风险。
- 误通过通常发生在边界区间，单靠一次高分不一定足以证明是 owner。
- 一旦污染 centroid 或模板池，后续误通过可能被放大。

在以下前置条件满足前，不默认开启自适应更新：

- 已记录足够的 owner / non-owner score 日志，可观察阈值边界。
- 已建立覆盖不同音量、距离、语速和环境噪声的 non-owner 回归样本。
- 有明确的实验开关或开发者开关，默认关闭。
- 自适应候选样本可以被审计或回滚。

未来如果重新评估，可考虑如下策略，但必须作为单独阶段实施：

验证通过后，如果 score 高于一个 **强确认阈值**（如 0.55），将该次的 embedding 加权融合到 centroid：

```
centroid_new = normalize(0.95 * centroid_old + 0.05 * new_embedding)
```

同时可选择性替换 `templates` 中的某个模板（避免模板数量无限增长）。替换必须可解释，不能只根据数组下标决定。

模板数量上限：8 个。超过后优先替换：

1. 质量不合格或质量最低的模板：`quality.ok === false`、时长过短、能量过低。
2. 最冗余的模板：与其他模板平均相似度最高，且 `promptId` 覆盖不稀缺。
3. 最老且长期未命中的模板：`createdAt` 最早，并且 `lastMatchedAt` 为空或很久未更新。

每次替换都应记录新模板的 `source`、`durationMs`、`quality`、可选 `promptId`，这样后续可以解释“为什么替换了某个样本”。

### 4. 存储与迁移

- 仍使用 MMKV 存储，key 不变
- version 字段升到 2
- 读取 version 1 数据时自动迁移为 version 2 格式
- centroid 在每次模板变更后重新计算
- 模板元数据与 embedding 一起持久化，支撑手动追加录入、质量回溯和未来替换策略审计

### 5. 注册 UI 变更

- 注册页面改为分步引导，每步一个录音
- 每段录音完成后显示质量反馈（时长是否足够、信噪比是否 OK）
- 最少完成 3 段即可注册，4-5 段为推荐
- 支持「追加录入」：已注册用户可以在设置中补录更多样本

## 手动追加与模板上限

模板数量上限建议为 8 个。

手动追加录入时：

- 未达到上限：直接追加新模板。
- 已达到上限：必须让替换策略可解释，不能静默随机覆盖。
- 第一版可以先要求用户删除或覆盖一个低质量/最老模板；如果实现自动选择，也必须在 UI 或日志中显示原因。

自动选择替换候选的优先级：

1. 质量不合格或质量最低的模板。
2. 与其他模板平均相似度最高的冗余模板。
3. 最老且长期未命中的模板。

替换只允许发生在用户主动追加录入流程中。

## Score trace

建议记录最近有限条验证 trace，例如最近 100 条：

```typescript
interface SpeakerVerificationTrace {
  id: string;
  createdAt: string;
  verified: boolean;
  threshold: number;
  score: number;
  centroidScore: number;
  bestTemplateScore: number;
  bestTemplateId?: string;
  sampleDurationMs: number;
  source: "live" | "diagnostic-owner" | "diagnostic-non-owner" | "settings-check";
}
```

约束：

- 不记录原始音频。
- 不记录完整 embedding。
- non-owner 诊断必须标记为 `diagnostic-non-owner`。
- trace 只用于阈值审计和后续是否开启自适应更新的决策。

## 实现步骤

1. [ ] 修改 `StoredSpeakerEmbedding` 数据结构（version 2）
2. [ ] 实现 version 1 → 2 自动迁移
3. [ ] `SpeakerIdService.enroll` 支持接收多段音频，并生成模板元数据
4. [ ] 实现 centroid 计算与 max-similarity 验证逻辑
5. [ ] 修改 `verifySpeaker` 为本地多模板比对（不依赖 sherpa 内置 verify）
6. [ ] 注册 UI 改为分步引导
7. [ ] 追加录入入口
8. [ ] 记录 owner / non-owner 验证 score，为未来是否开启自适应更新提供依据
9. [ ] 增加测试证明验证通过不会自动写入或替换模板

## 暂缓项

- [ ] 渐进式自适应更新：默认不实现、不开启。等 score 日志和 non-owner 回归集足够后，作为单独阶段重新评估。

## 风险与取舍

- **安全性**：多模板 + max-similarity 会略微增加 false accept rate，但对于 owner-only 设备场景可接受
- **存储**：8 个 512 维 embedding 加少量模板元数据，MMKV 可以轻松承载
- **计算**：验证时做 8 次 cosine similarity 计算，耗时可忽略
- **模板污染**：第一版通过禁止自动自适应更新规避，后续必须基于 score trace 和 non-owner 回归集再评估

## 验收标准

- v2 payload 使用 `templates: StoredSpeakerTemplate[]`，不是裸 `number[][]`。
- v1 payload 能迁移为 v2，且 centroid 可计算。
- 新注册至少包含 3 个有效模板。
- 验证使用 `max(centroidScore, bestTemplateScore)` 判定。
- owner 验证通过和 non-owner 诊断拒绝都有 score trace。
- 验证通过后模板数量不增加，centroid 不自动变化。
- 手动追加录入可以增加模板；达到上限时替换原因可解释。

## 短期过渡

在多样本方案落地前，先将 `verificationThreshold` 从 0.45 降到 0.35，缓解误拒问题。
