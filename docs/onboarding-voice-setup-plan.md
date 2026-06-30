# 首次引导与语音初始化改造 Plan

更新时间：2026-06-30 CST

## 背景

当前 APP 的核心能力已经可运行，但首进体验仍像开发诊断面板：

- 语音模型下载入口藏在设置页，用户不知道为什么要下载、下载什么、下载后能做什么。
- 声纹录入是单次按住录音，缺少质量反馈，也不覆盖不同说话状态。
- 设置页混合了用户设置、模型管理、声纹注册、机器人连接和 smoke test，信息层级过重。
- 首页直接进入 RobotFace，缺少“设备是否已准备好”的明确状态。

本计划将首进体验改为一条明确的设备初始化流程：模型就绪 -> 主人声纹 -> 权限/设备能力 -> 进入首页。

## 目标

- 用户首次进入 APP 时，有清晰的引导 UI 完成必要初始化。
- 语音模型下载从“诊断能力”升级为首进流程的第一步。
- 声纹注册按 `docs/speaker-id-multi-enrollment.md` 改为多样本录入，提升 owner 通过率。
- 设置页从“功能堆叠”改为“设备健康 + 常用设置 + 高级诊断”。
- 首页能反映关键能力就绪状态，并提供轻量修复入口。

## 非目标

- 不在本阶段重写语音主链路、LLM、TTS 或记忆系统。
- 不直接修改 Expo prebuild 产物；需要原生能力时通过 `app.json` 或 config plugin 处理。
- 不把 smoke test 暴露为普通用户的主要入口。
- 不在第一版实现声纹自动自适应更新；只保留手动追加录入和 score 记录。

## 当前可复用能力

- 模型检查：`checkAllSherpaModelReadiness()` in `src/voice/sherpa-models.ts`
- 模型下载：`downloadMissingSherpaModels()` in `src/voice/sherpa-model-download.ts`
- 声纹服务：`speakerIdService` in `src/voice/speaker-id.ts`
- 实时录音样本：`liveSampleRecorder` in `src/voice/live-sample-recorder.ts`
- 用户状态：`useUserStore` in `src/store/user.ts`
- 现有首页：`app/(tabs)/index.tsx`
- 现有设置页：`app/(tabs)/settings.tsx`
- 声纹多样本方案：`docs/speaker-id-multi-enrollment.md`

## 产品流程

### 1. 首次进入

新增 onboarding 入口，例如 `app/onboarding.tsx`。

首进时不要直接进入首页，而是先计算 setup readiness：

- 语音模型是否全部就绪
- 主人声纹是否已注册
- 麦克风权限是否可用
- 相机权限是否已启用或已跳过
- 日历权限是否已启用或已跳过
- LOOI 机器人是否已连接或已跳过

建议 readiness 结果由一个独立模块聚合，例如：

- `src/setup/setup-readiness.ts`
- `src/setup/setup-storage.ts`

首页或 RootLayout 根据 readiness 决定是否跳转 onboarding。

### 2. 模型下载

用户第一步看到的是“本地语音能力准备”，而不是模型文件名。

展示能力维度：

- 实时听懂你说话：Streaming ASR
- 唤醒词：KWS
- 主人识别：Speaker ID
- 语音边界检测：VAD
- 标点整理：Punctuation

交互要求：

- 进入步骤后自动检查模型。
- 缺模型时显示主按钮：`下载并安装`。
- 下载中显示当前阶段 label、进度条、失败重试。
- 全部 ready 后才能进入声纹录入。
- 已 ready 时直接显示完成态，允许继续下一步。

### 3. 多样本声纹录入

按 `docs/speaker-id-multi-enrollment.md` 实现。

录入步骤：

| 序号 | 文案 | 目的 |
| --- | --- | --- |
| 1 | 请用正常音量说一句话 | 基线 |
| 2 | 请稍微轻声说一句话 | 低能量覆盖 |
| 3 | 请稍微快一点说一句话 | 语速变化覆盖 |
| 4 | 请自然地多说几句话 | 日常状态 |
| 5 | 请稍微离远一点说一句话 | 远场覆盖，可选 |

交互要求：

- 最少完成 3 段即可注册。
- 推荐完成 4-5 段以提高稳定性。
- 每段支持开始、停止、重录。
- 每段录完显示质量反馈：有效时长、是否太短、是否几乎静音。
- 注册完成后写入 owner 声纹，并进入下一步。
- 后续设置页支持追加录入。

### 4. 权限与设备能力

麦克风为必需能力；相机、日历、机器人连接可以跳过。

建议步骤：

- 麦克风：必需，未授权时阻断继续。
- 相机：用于视觉记忆，可跳过。
- 日历：用于提醒感知，可跳过。
- LOOI 机器人：用于实体动作，可跳过。

跳过的能力需要被记录，避免每次启动重复打扰。

### 5. 完成页

完成页只做确认，不做营销页。

展示：

- 模型：已就绪
- 主人声纹：已录入 N 段
- 麦克风：已启用
- 相机/日历/机器人：已启用或已跳过

主按钮：`进入 LOOI`

## 可验收需求矩阵

| ID | 需求 | 设计落点 | 验收证据 |
| --- | --- | --- | --- |
| R1 | 首次安装不直接进入粗糙首页，而是进入初始化流程 | `app/onboarding.tsx` + setup readiness 路由判断 | 清空本地数据后启动 APP，首屏为 onboarding，且当前步骤为模型检查 |
| R2 | 用户能在首进流程下载必需语音模型 | 模型步骤接入 `checkAllSherpaModelReadiness()` 和 `downloadMissingSherpaModels()` | 缺模型状态显示下载入口；下载成功后 readiness 变为 ready；失败时可重试 |
| R3 | 模型状态以用户能力展示，而不是文件名/诊断日志 | 模型步骤展示 ASR/KWS/Speaker/VAD/Punctuation 能力 | 截图或人工检查：主 UI 不出现长文件名、路径、debug dump |
| R4 | 声纹注册改为多样本流程 | 声纹步骤按 3-5 个 prompt 录入 | 新用户最少 3 段有效样本后可完成；少于 3 段不能完成 |
| R5 | 声纹模板可支撑后续解释和替换 | `StoredSpeakerTemplate[]` 持久化 metadata | MMKV payload 中存在 `templates[].embedding/createdAt/source/durationMs/quality/promptId` |
| R6 | v1 单样本声纹不丢失 | `speaker-id.ts` 自动迁移 | 准备 v1 payload 后启动，读取为 v2，样本数为 1，centroid 可用 |
| R7 | 验证使用多模板本地比对 | `centroid + max(template similarity)` | 单元测试覆盖 centroid 命中、template 命中、低分拒绝 |
| R8 | 第一版不做自动自适应更新 | Deferred 策略 + 无自动写模板路径 | 验证通过后模板数量不自动增加，centroid 不因验证样本自动变化 |
| R9 | 设置页支持手动追加录入 | 声纹管理区追加样本 | 已注册用户追加一段有效样本后样本数增加，metadata source 为 `settings-append` |
| R10 | 设置页从诊断堆叠改为分层管理 | 健康摘要 / 常用设置 / 高级诊断 | Smoke tests 默认折叠；普通用户首屏只见健康和常用操作 |
| R11 | 首页能处理未就绪状态 | 首页读取 setup readiness | 删除模型或清除声纹后回首页显示修复入口，并能回到对应 onboarding 步骤 |
| R12 | 权限/机器人可跳过但不重复打扰 | setup skip 持久化 | 跳过相机/日历/机器人后重启，不再次强制弹出该步骤 |

## UI 方向

整体保持现有 LOOI 深色设备感，但降低诊断面板密度。动效只用于状态变化和步骤切换，不能影响录音、下载、权限授权等核心操作。

### Onboarding

- 使用分步进度条：`模型 -> 声纹 -> 权限 -> 完成`
- 中央区域只呈现当前步骤的主操作。
- 侧边或底部展示紧凑状态摘要。
- `RobotFace` 可以作为状态反馈元素，但不要占满所有操作空间。
- 避免把文件名、debug 结果、长日志暴露给普通用户。

### 首页

首页继续以 RobotFace 为第一视觉，但需要处理未就绪状态：

- 如果模型缺失：显示轻量修复入口，跳回 onboarding 的模型步骤。
- 如果声纹缺失：显示轻量修复入口，跳回声纹步骤。
- 快捷入口从字母按钮改为明确动作：
  - 对话
  - 记住这个
  - 查看记忆
  - 设置

### 设置页

设置页重组为三层：

1. 设备健康摘要
   - 模型
   - 声纹
   - 服务器
   - 机器人
   - 相机
   - 日历

2. 常用设置
   - 声纹管理：查看样本数、追加录入、清除声纹
   - 模型管理：检查、下载、重新检查
   - 机器人连接：扫描、连接、忘记
   - 功能开关：唤醒词、TTS、相机、日历

3. 高级诊断
   - KWS smoke
   - VAD smoke
   - 语音 smoke
   - 声纹验证 smoke
   - 视觉记忆 smoke
   - 日历提醒 smoke

高级诊断默认折叠。

## 技术设计

### Setup readiness

新增统一状态层，避免 onboarding、首页、设置页各自重复判断。

建议类型：

```typescript
type SetupStep = "models" | "speaker" | "permissions" | "done";

type SetupReadiness = {
  modelsReady: boolean;
  speakerEnrolled: boolean;
  speakerSampleCount: number;
  microphoneReady: boolean;
  cameraReady: boolean;
  calendarReady: boolean;
  robotReady: boolean;
  skipped: {
    camera: boolean;
    calendar: boolean;
    robot: boolean;
  };
  requiredReady: boolean;
  nextStep: SetupStep;
};
```

持久化建议：

- 记录 onboarding 是否完成。
- 记录可选能力是否跳过。
- 不把模型 ready 和声纹 enrolled 只存在 store 里，启动时应重新检查真实状态。

### 多样本声纹服务

修改 `src/voice/speaker-id.ts`。

数据结构升级：

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

interface StoredSpeakerEmbeddingV2 {
  version: 2;
  speakerName: string;
  templates: StoredSpeakerTemplate[];
  centroid: number[];
  createdAt: string;
  updatedAt: string;
}
```

实现要求：

- 保持 MMKV key 不变。
- 支持 v1 自动迁移到 v2。
- v1 单 embedding 迁移时包装成一个 `StoredSpeakerTemplate`，并补齐 source、durationMs、quality 默认值。
- `enroll()` 支持接收多段 samples 或多段 embedding。
- 新增 `appendEnrollmentSample()` 或等价方法，用于设置页追加录入。
- 新增 `getEnrollmentSummary()`，返回样本数量、版本、更新时间。
- 验证改为本地 cosine similarity：
  - `cosine(input, centroid)`
  - `max(cosine(input, template.embedding))`
  - 取二者最大值与 threshold 比较
- 不再依赖 native registry 的单 speaker verify 作为唯一判定。
- 第一版只做手动追加录入，不做自动自适应更新，避免误通过样本污染模板池。
- 模板数量达到上限后的手动追加替换策略必须基于 metadata 可解释：优先替换低质量模板，其次替换与其他模板平均相似度最高的冗余模板，最后替换最老且长期未命中的模板。
- 自适应更新只有在 score 日志和 non-owner 回归样本足够后，才作为单独阶段重新评估，并且默认关闭。

### 声纹 score 记录

第一版需要记录验证分数，但不能把验证样本自动写入模板。

建议记录结构：

```typescript
type SpeakerVerificationTrace = {
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
};
```

记录要求：

- 只记录分数和模板 ID，不记录原始音频。
- 默认保留最近有限条数，例如 100 条。
- non-owner 诊断样本必须标记为 `diagnostic-non-owner`。
- 未来评估自适应更新时，必须先审计这些 score 分布。

### 录音质量判断

在 UI 或 voice helper 中加入轻量质量检查：

- 有效样本长度至少约 2 秒。
- 去掉低能量边缘后仍需满足最短长度。
- 过短、近乎静音时要求重录。

可以先复用 `liveSampleRecorder` 的 trim 结果，再补一个质量函数，例如：

```typescript
type EnrollmentSampleQuality = {
  ok: boolean;
  durationMs: number;
  reason?: "too-short" | "too-quiet";
};
```

### 路由建议

- `app/onboarding.tsx`
- `src/setup/setup-readiness.ts`
- `src/setup/setup-storage.ts`
- `src/setup/OnboardingScreen.tsx` 或 `src/ui/onboarding/*`
- `src/ui/settings/*` 用于逐步拆分当前大 settings 文件

## 实施计划

### Phase 0：准备与进度记录

- [ ] 在 `progress.md` 新增本改造章节。
- [ ] 将阶段性未知项写入 `todo.md`。
- [ ] 确认当前工作树，避免覆盖用户改动。

### Phase 1：Setup readiness 基础设施

- [ ] 新增 setup readiness 聚合模块。
- [ ] 接入模型检查、声纹状态、权限状态、机器人状态。
- [ ] 增加可选能力 skip 持久化。
- [ ] 首页或 RootLayout 能识别是否需要进入 onboarding。

### Phase 2：模型下载 onboarding

- [ ] 新增 onboarding route 和基础布局。
- [ ] 实现步骤进度与状态摘要。
- [ ] 接入模型检查。
- [ ] 接入模型下载进度。
- [ ] 处理下载失败、重试、已就绪三种状态。

### Phase 3：声纹服务多样本改造

- [ ] `StoredSpeakerEmbedding` 升级到 v2。
- [ ] 实现 v1 -> v2 自动迁移。
- [ ] 将模板存储设计为对象数组，包含 `embedding`、`createdAt`、`source`、`durationMs`、`quality`、可选 `promptId`。
- [ ] 实现 centroid 计算。
- [ ] 实现 cosine similarity 本地验证。
- [ ] 支持多样本 enroll。
- [ ] 支持追加录入。
- [ ] 增加 enrollment summary。
- [ ] 为手动追加录入实现可解释的模板上限和替换策略。
- [ ] 记录 owner / non-owner 验证 score，为未来是否开启自适应更新提供依据。

### Deferred：自适应声纹更新

- [ ] 暂不实现自动自适应更新。
- [ ] 暂不在验证通过后自动融合 centroid。
- [ ] 暂不在验证通过后自动写入或替换模板。
- [ ] 等有足够 score 日志和 non-owner 回归样本后，再作为单独阶段评估。
- [ ] 如果未来实现，必须有实验开关或开发者开关，默认关闭，并支持审计/回滚。

### Phase 4：多样本声纹 onboarding UI

- [ ] 实现 3-5 段分步录音。
- [ ] 增加每段质量反馈。
- [ ] 支持重录单段。
- [ ] 最少 3 段后允许完成。
- [ ] 完成后刷新 user store 和 setup readiness。

### Phase 5：权限与设备能力步骤

- [ ] 麦克风权限作为必需项。
- [ ] 相机权限可启用或跳过。
- [ ] 日历权限可启用或跳过。
- [ ] 机器人连接可扫描连接或跳过。
- [ ] 完成页写入 onboarding completed。

### Phase 6：首页未就绪状态

- [ ] 首页读取 setup readiness。
- [ ] 缺模型或缺声纹时展示修复入口。
- [ ] 快捷入口改为清晰动作。
- [ ] 保留 RobotFace 作为主视觉。

### Phase 7：设置页重组

- [ ] 顶部健康摘要改为真实 readiness 状态。
- [ ] 声纹区支持样本数、追加录入、清除。
- [ ] 模型区保留检查、下载、重新检查。
- [ ] 机器人区保留扫描、连接、忘记。
- [ ] smoke tests 移入默认折叠的高级诊断。
- [ ] 逐步拆分 `settings.tsx`，降低单文件复杂度。

### Phase 8：验证

- [ ] `pnpm exec tsc --noEmit`
- [ ] `pnpm test`
- [ ] 如涉及服务端接口，运行 `pnpm --dir server test`
- [ ] React 改动后运行 React Doctor。
- [ ] iOS 模拟器验证首进流程。
- [ ] 验证模型缺失 -> 下载 -> ready。
- [ ] 验证 v1 单样本声纹自动迁移到 v2。
- [ ] 验证新用户 3 段声纹注册成功。
- [ ] 验证 4-5 段推荐录入成功。
- [ ] 验证 owner 通过、诊断 non-owner 拒绝。
- [ ] 验证清除声纹后回到未就绪状态。
- [ ] 验证设置页追加录入后样本数增加。
- [ ] 验证通过一次 owner 后模板数量不自动增加。
- [ ] 验证 score trace 只记录分数和模板 ID，不记录原始音频。

## 阶段门禁

### Gate A：Plan 可验收

- [x] 文档列出首进流程、模型下载、声纹多样本、权限/设备能力、首页修复入口、设置页重组。
- [x] 文档明确第一版不做自动自适应更新。
- [x] 文档给出数据结构、迁移策略、验证策略、score 记录策略。
- [x] 文档给出可验收需求矩阵和每项验收证据。
- [x] `todo.md` 记录仍需真机或产品决策确认的事项。

### Gate B：基础能力可验收

- [ ] setup readiness 可以在冷启动时重新计算真实状态。
- [ ] 模型检查和下载在 onboarding 可用。
- [ ] 声纹 v2 数据结构、迁移和多模板验证有单元测试。
- [ ] 自动自适应更新不存在可执行路径。

### Gate C：用户流程可验收

- [ ] 清空本地数据后可以从 onboarding 走到首页。
- [ ] 中断下载、拒绝权限、录音太短、清除声纹都有可恢复路径。
- [ ] 设置页能完成追加录入和清除声纹。
- [ ] 首页在模型或声纹缺失时能引导修复。

### Gate D：设备验收

- [ ] iOS 模拟器完成首进流程。
- [ ] 真实 iOS 设备完成模型下载、3 段声纹录入、owner 验证、non-owner 拒绝。
- [ ] 真实设备记录至少一轮 score trace，用于后续阈值审计。

## 验收标准

- 首次安装后，用户能在不进入设置页的情况下完成模型下载和声纹录入。
- 模型缺失时，首页不会静默失败，而是给出明确修复入口。
- 声纹注册至少包含 3 段有效样本。
- 声纹模板持久化为对象数组，包含 embedding、创建时间、来源、时长、质量信息和可选 prompt ID。
- 老的 v1 声纹数据不会丢失，启动后可自动迁移。
- 声纹验证使用多模板策略，owner 在不同音量、语速下通过率高于单样本方案。
- 第一版不会因为一次验证通过而自动修改 centroid 或模板池。
- 设置页不再把 smoke test 作为主要内容。
- 用户可以在设置页追加录入声纹样本。
- 验证 score 被记录用于后续阈值和自适应更新评估，但不保存原始音频。
- iOS 模拟器完成首进流程无崩溃；真机验收记录写入 `todo.md` 或后续 docs。

## 风险与待确认

- 模型下载体积和网络失败体验需要在真机上验证。
- iOS 模拟器音频输入限制可能影响声纹验收，最终仍需真实设备测试。
- 多模板 max-similarity 会提高通过率，也可能略微提高 false accept rate，需要用诊断 non-owner 音频做回归。
- 当前 `settings.tsx` 已经较大，重组时应分阶段拆分，避免一次性重构扩大风险。
- 如果 onboarding 需要权限状态持久化，需确认现有 permission API 与 Expo SDK 版本兼容。
