# LOOI UI Redesign — 机器人本体化全量方案

> 目标：把当前 demo 式 Tab App 改成“屏幕就是机器人本身”的横屏优先体验  
> 设计依据：[design/page-design.md](../../design/page-design.md)、[design/首屏示例.png](../../design/首屏示例.png)、[design/记忆示例.png](../../design/记忆示例.png)

---

## 目标

完成一次全量 UI 信息架构和视觉重做：

- 默认首屏不再是对话列表、状态栏、Tab 导航，而是一张全屏机器人脸
- 对话、记忆、提醒、设置全部变成从机器人本体展开的二级功能空间
- 视觉方向采用“安静实体感”：克制、可信、像一个桌面机器人设备
- 保留 Phase 1 已验证的语音、视觉、记忆、日历、诊断能力，不重写业务链路
- 横屏作为主体验，竖屏只保证可用和不重叠

---

## 当前问题

| 当前实现 | 问题 | 改造方向 |
|---------|------|----------|
| `Tabs` 常驻底部导航 | 像普通管理 App，不像机器人本体 | 去掉全局 Tab，改成机器人首页 + 功能空间 |
| 首页是聊天列表 | 默认体验像 ChatGPT demo | 首页只显示机器人脸和临时反馈 |
| 状态用文字栏表达 | 机器人的状态感弱 | 用眼睛、嘴型、波纹和字幕表达 |
| 记忆页是筛选列表 | 像数据库浏览器 | 改成按时间组织的记忆片段空间 |
| 设置页暴露大量诊断项 | 像测试后台 | 诊断能力收纳到设备面板 |
| 紫色 chip / 气泡风格 | demo 感强，缺少产品气质 | 建立统一的低噪声实体设备视觉系统 |

---

## 架构决策

| 项 | 方案 |
|----|------|
| 主导航 | 不再使用 `Tabs` 作为全局 UI，改为无 header 的功能 shell |
| 首页 | `app/(tabs)/index.tsx` 作为机器人本体首页 |
| 功能空间 | 对话、记忆、提醒、设置从机器人首页进入 |
| 机器人形象 | 新增可复用 `RobotFace`，全屏和小头像共用状态模型 |
| 状态来源 | 继续使用 `useUserStore.voiceState`、`useConversationStore` |
| 相机链路 | `CameraFrameFeeder` 保留在首页后台运行 |
| 设置诊断 | 功能不删除，只做分组、收纳和视觉降噪 |
| 横屏 | 修改 Expo orientation 为横屏优先 |
| 样式技术 | 引入 NativeWind v4 作为样式基础设施，设计 token 统一写入 Tailwind theme |
| 新依赖边界 | 只新增样式基础设施，不引入重型 UI 组件库 / gesture 依赖，优先用 RN 内置能力 |

---

## 设计规范

设计方向以 `design/首屏示例.png` 和 `design/记忆示例.png` 为准：黑色设备屏、低噪声纹理、青蓝发光状态、玻璃质感功能卡片、窄轨导航，以及持续存在的机器人头部状态锚点。

### 视觉原则

- **机器人优先**：首屏只呈现机器人脸，功能页也必须保留右上角小机器人头像，不能退化成普通 App 页面。
- **设备屏质感**：背景是近黑色发光屏幕，不使用大面积纯白、紫色渐变或普通 SaaS 卡片。
- **青蓝为唯一主强调色**：主高亮使用 cyan / electric blue，紫色只允许作为禁用或历史遗留状态的低权重辅助色。
- **信息低噪声**：默认态只保留当前任务必需信息，状态说明以眼睛、嘴型、波纹、短字幕表达。
- **玻璃卡片轻浮层**：卡片是半透明黑蓝底、细描边、轻内发光，避免厚重阴影和卡片套卡片。
- **横屏密度优先**：横屏采用左侧窄轨 + 主内容网格；竖屏改为顶部/底部紧凑入口，只保证不遮挡关键操作。

### 设计 Token

这些 token 需要落到 `tailwind.config.js` 的 `theme.extend` 中，组件只引用 token，不在页面里散落临时颜色。

| 类型 | Token | 建议值 | 用途 |
|------|-------|--------|------|
| 背景 | `looi-bg` | `#03070d` | App 根背景 |
| 背景 | `looi-bg-raised` | `#07111d` | 功能页主面板 |
| 背景 | `looi-surface` | `rgba(8, 18, 30, 0.72)` | 卡片 / 面板 |
| 描边 | `looi-line` | `rgba(84, 167, 255, 0.22)` | 默认边框 |
| 描边 | `looi-line-active` | `rgba(40, 213, 255, 0.72)` | 选中边框 |
| 文本 | `looi-text` | `#edf7ff` | 主文字 |
| 文本 | `looi-muted` | `#8c9bad` | 次级文字 |
| 强调 | `looi-cyan` | `#28d5ff` | 主状态、按钮、眼睛 |
| 强调 | `looi-blue` | `#1f7cff` | 深层辉光和选中态 |
| 状态 | `looi-ok` | `#4de7b4` | 成功 / 已记住 |
| 状态 | `looi-warn` | `#ffd166` | 提醒 / 需要确认 |
| 状态 | `looi-danger` | `#ff5c7a` | 错误 / 失败 |
| 半径 | `looi-card` | `22` | 大功能卡片 |
| 半径 | `looi-pill` | `999` | chip / 控制器 |
| 阴影 | `looi-glow` | cyan glow | 机器人眼睛、激活按钮 |

### 背景与纹理

- 根背景使用近黑色，叠加极弱点阵 / 网格纹理，透明度控制在 6%-12%。
- 首页眼睛发光可以使用 cyan 到 blue 的径向渐变；光晕只围绕机器人脸和关键状态，不铺满页面。
- 功能页背景允许右上角放置机器人头部区域，但不能抢过主内容层级。
- 不使用离散装饰光球、bokeh、随机渐变块。

### 排版

- 中文主标题使用较粗字重，功能页标题接近示例图的大号设备 UI 标题。
- 正文保持高可读，优先系统中文字体；如果后续引入字体，必须通过 `expo-font` 加载并记录在 `docs/`。
- 字号分层建议：标题 32-44、卡片标题 18-24、正文 14-17、辅助信息 12-14。
- 字距保持默认，不使用负字距；按钮文字必须在最小竖屏宽度下不截断。

### 组件规范

| 组件 | 规范 |
|------|------|
| `RobotFace` | 全屏模式占据首屏视觉中心；小头像模式用于功能页右上角；状态模型统一，不复制状态逻辑 |
| 功能 Shell | 横屏左侧窄轨导航，宽度约 88-112；当前项用 cyan 描边和柔光，不使用底部 Tab |
| 快捷面板 | 点击机器人后临时出现，胶囊按钮，3-5 秒无操作淡出 |
| 记忆卡片 | 玻璃表面 + 细描边 + evidence 图片；标题、时间、来源、标签层级固定 |
| 搜索框 | 大号圆角输入，左侧搜索图标，右侧筛选图标；占据记忆页顶部主操作位 |
| 筛选 chip | 胶囊形，选中态 cyan 描边和文字；未选中低亮描边 |
| `VoiceButton` | 改为设备控制器，使用波形/麦克风状态图标和按压光效，不再像普通表单按钮 |
| 提醒卡片 | 时间数字使用 cyan 强调；开关使用蓝色轨道，避免系统默认样式割裂 |
| 设置面板 | 诊断项默认收纳；高频能力卡片化，日志/JSON 结果低层级展示 |

### 图标与图像

- 主要 UI 图标使用线性图标风格，stroke 约 2，颜色在 `looi-muted` 与 `looi-cyan` 间切换。
- 不再用 emoji 承担主图标；emoji 仅允许出现在用户生成内容或临时调试文本里。
- evidence 图片必须保留真实图像内容，不做过度暗化或模糊，保证用户能识别物品位置。

### 动效

- 首页待机：眼睛轻微呼吸、低频眨眼、底部弱波形。
- listening：眼睛聚焦，底部波形增强。
- processing：视线微偏，波形变为较慢扫描。
- speaking：嘴型或中部弧线随状态变化。
- 功能页进入：机器人缩小为右上角头像，功能面板从后方展开；不做普通页面硬切。
- 所有动画优先使用 `react-native-reanimated` 或 RN Animated，不新增动画库。

---

## NativeWind v4 技术选型

NativeWind v4 作为 UI 重做的样式基础设施，用于把设计 token、响应式布局和状态样式集中到 Tailwind 配置中。它不是 UI 组件库，不改变 Expo Router、业务 store、perceiver、memory、reminder 链路。

### 引入原因

- 当前页面大量 `StyleSheet.create` 容易继续产生临时颜色、间距和卡片样式。
- UI 重做涉及首页、对话、记忆、提醒、设置多个页面，需要统一 token 和组件语义。
- NativeWind 可以让 React Native 组件直接使用 `className`，把颜色、半径、间距、状态样式收敛到 Tailwind theme。
- 项目已有 `react-native-reanimated` 和 `react-native-safe-area-context`，NativeWind 的关键 peer dependency 已在依赖中。

### 安装与配置

执行时使用 pnpm：

```bash
pnpm add nativewind
pnpm add -D tailwindcss@^3.4.17 prettier-plugin-tailwindcss@^0.5.11 babel-preset-expo
pnpm exec tailwindcss init
```

需要新增或修改：

- `tailwind.config.js`
  - `content` 覆盖 `app/**/*.{js,jsx,ts,tsx}`、`src/**/*.{js,jsx,ts,tsx}`、`components/**/*.{js,jsx,ts,tsx}`
  - `presets: [require("nativewind/preset")]`
  - 在 `theme.extend` 写入 LOOI 颜色、半径、阴影、字体尺寸 token
- `global.css`
  - 添加 `@tailwind base;`
  - 添加 `@tailwind components;`
  - 添加 `@tailwind utilities;`
- `babel.config.js`
  - 使用 `["babel-preset-expo", { jsxImportSource: "nativewind" }]`
  - 添加 `"nativewind/babel"`
- `metro.config.js`
  - 使用 `withNativeWind(config, { input: "./global.css" })`
- `app/_layout.tsx`
  - import `../global.css`
- `nativewind-env.d.ts`
  - 添加 `/// <reference types="nativewind/types" />`
- `app.json`
  - web bundler 使用 Metro：`expo.web.bundler = "metro"`

### 使用边界

- 新增和重做组件优先使用 `className` + token。
- 复杂动态样式、尺寸测量、动画插值仍保留 `StyleSheet` / inline style / Reanimated style。
- 迁移现有 `StyleSheet` 按触达页面逐步进行，不为了“全量 className 化”重写无关组件。
- 不使用 NativeWind class 写业务状态判断；业务状态仍来自现有 hooks/store。
- 不新增 Tailwind UI、shadcn、gluestack、Tamagui 等组件体系。
- 所有新增依赖必须写入根 `package.json`，使用 `pnpm-lock.yaml` 锁定。

---

## Step 0: 执行准备

**任务：**
- [ ] 创建或恢复 `progress.md`
  - [ ] 按本计划拆成 step + checkbox
  - [ ] 每完成一个阶段更新进度
- [ ] 创建或恢复 `todo.md`
  - [ ] 记录 UI 改造中发现但暂不解决的问题
  - [ ] 阶段性结论落到 `docs/`
- [ ] 保留当前工作区已有改动，不回滚无关文件
- [ ] 使用 `pnpm` 执行所有脚本
- [ ] 每个可验证阶段完成后提交一次 commit
- [ ] 引入 NativeWind v4 基础设施
  - [ ] 安装 `nativewind`
  - [ ] 安装 `tailwindcss@^3.4.17`、`prettier-plugin-tailwindcss@^0.5.11`、`babel-preset-expo`
  - [ ] 新增 `tailwind.config.js`、`global.css`、`metro.config.js`、`nativewind-env.d.ts`
  - [ ] 修改或新增 `babel.config.js`
  - [ ] 在 `app/_layout.tsx` 导入 `global.css`
  - [ ] 在 `app.json` 配置 web Metro bundler
  - [ ] 将 LOOI 设计 token 写入 Tailwind theme

---

## Step 1: 路由与应用外壳

**任务：**
- [ ] 修改 `app/(tabs)/_layout.tsx`
  - [ ] 移除常驻 `Tabs` 视觉结构
  - [ ] 关闭 header
  - [ ] 保留现有页面 route 名称，降低迁移成本
- [ ] 修改 `app.json`
  - [ ] 将 `orientation` 调整为横屏优先
- [ ] 新增共享功能空间外壳
  - [ ] 标题区
  - [ ] 右上角小机器人头像
  - [ ] 临时功能导航：对话 / 记忆 / 提醒 / 设置
  - [ ] 返回机器人入口
- [ ] 确保从任何功能页都能返回机器人首页

**验收：**
- [ ] App 启动后不再显示底部 Tab
- [ ] 页面顶部不再出现默认 Expo Router header
- [ ] 现有 `index` / `memories` / `settings` 页面仍可访问

---

## Step 2: 机器人本体首页

**任务：**
- [ ] 新增 `RobotFace`
  - [ ] 全屏模式
  - [ ] 小头像模式
  - [ ] 待机、聆听、思考、播报、验证状态
- [ ] 首页默认只显示机器人脸
  - [ ] 不显示导航
  - [ ] 不显示消息列表
  - [ ] 不显示设置状态
  - [ ] 不显示记忆卡片
- [ ] 点击机器人脸显示临时快捷面板
  - [ ] 对话
  - [ ] 记忆
  - [ ] 提醒
  - [ ] 设置
- [ ] 快捷面板无操作后自动淡出
- [ ] 保留极弱底部手势暗示
- [ ] 将 `CameraFrameFeeder` 挂在首页，继续喂相机帧

**状态映射：**
- [ ] `sleeping`：自然待机、轻微眨眼
- [ ] `listening`：眼睛聚焦、下方呼吸波纹
- [ ] `processing`：视线偏移、轻思考动效
- [ ] `speaking`：嘴型/波形变化
- [ ] `verifying`：短暂聚焦、验证感反馈

**验收：**
- [ ] 横屏首页第一眼只看到机器人本体
- [ ] 点击后能打开功能入口
- [ ] 语音状态变化时机器人脸有明确反馈
- [ ] 相机后台喂帧链路未被移除

---

## Step 3: 对话空间重做

**任务：**
- [ ] 将当前 `index` 中的聊天列表迁移成“对话功能空间”
- [ ] 机器人回答居中展示
- [ ] 用户原话弱化展示
- [ ] 证据图片作为视觉重点
- [ ] 保留 `VoiceButton` 的按住说话能力
- [ ] `ChatBubble` 继续支持 `message.evidenceUri`
- [ ] 空态不再显示 demo 文案，改成安静等待状态

**验收：**
- [ ] 按住说话仍调用 `voicePerceiver.trigger()`
- [ ] 松开仍调用 `voicePerceiver.finishListening()`
- [ ] assistant 消息带 `evidenceUri` 时仍展示图片
- [ ] 页面不像传统 ChatGPT 左右气泡

---

## Step 4: 记忆空间重做

**任务：**
- [ ] 将记忆页改成“机器人脑内记忆片段”
- [ ] 按时间组织：今天 / 昨天 / 更早
- [ ] 记忆卡片支持：
  - [ ] 摘要
  - [ ] 时间
  - [ ] 分类
  - [ ] evidence 图片缩略图
- [ ] 分类筛选保留，但降级为功能区控件
- [ ] `MemoryCard` 继续支持 `memory.metadata?.evidenceUri`

**验收：**
- [ ] `memoryService.getAll(filters)` 调用不变
- [ ] 分类筛选仍可用
- [ ] 有证据图的记忆仍显示图片
- [ ] 页面观感不再像数据库列表

---

## Step 5: 提醒空间新增

**任务：**
- [ ] 新增提醒功能空间页面
- [ ] 展示今日提醒、日历事件、关联上下文三个区域
- [ ] 复用现有日历和 reminder 能力作为入口
- [ ] 没有提醒数据时显示安静空态
- [ ] 首页提醒事件以临时覆盖卡片出现，不做常驻侧栏

**约束：**
- [ ] 不新增后端 schema
- [ ] 不发明复杂提醒模型
- [ ] 只基于现有 `calendarPerceiver` / `reminderScheduler` 能力做 UI 接入

**验收：**
- [ ] 快捷面板可以进入提醒页
- [ ] 没有数据时页面完整可用
- [ ] 不影响现有日历 smoke 测试

---

## Step 6: 设置空间重做

**任务：**
- [ ] 将设置页改为“设备与能力面板”
- [ ] 分组保留现有能力：
  - [ ] 主人身份 / 声纹
  - [ ] 语音模型 / KWS
  - [ ] 视觉记忆
  - [ ] 日历提醒
  - [ ] 服务器连接
  - [ ] 功能开关
- [ ] smoke / diagnostic 结果默认收纳
- [ ] 诊断按钮仍可操作
- [ ] 保留 anti-regression 依赖的关键字符串和调用

**验收：**
- [ ] 声纹录入、语音诊断、KWS 测试仍可触发
- [ ] 视觉诊断仍调用 `observeService.voiceVisual`
- [ ] 日历诊断仍调用 `reminderScheduler.processCalendarObservation`
- [ ] `pnpm test` 中 settings 相关检查通过
- [ ] 页面不再像 Phase 1 测试后台

---

## Step 7: 视觉系统统一

**任务：**
- [ ] 基于 NativeWind theme 建立统一设计 token
  - [ ] 背景：`looi-bg` / `looi-bg-raised`
  - [ ] 主体：`looi-surface`
  - [ ] 描边：`looi-line` / `looi-line-active`
  - [ ] 强调：`looi-cyan` / `looi-blue`，不再大面积紫色
  - [ ] 状态：`looi-ok` / `looi-warn` / `looi-danger`
- [ ] 统一组件半径、间距、阴影
- [ ] 建立设备屏背景纹理和弱网格层
- [ ] 建立玻璃卡片、胶囊 chip、左侧窄轨导航、小机器人头像四类基础样式
- [ ] 移除 emoji 作为主要 UI 图标
- [ ] `VoiceButton` 改成实体感控制器
- [ ] 避免页面内卡片套卡片
- [ ] 确保横屏和竖屏文本不重叠
- [ ] 新增 / 重做 UI 组件优先使用 NativeWind `className`
- [ ] 复杂动画和动态计算样式保留 `StyleSheet` / Reanimated style

**验收：**
- [ ] UI 不再读作紫色 demo
- [ ] 首页、对话、记忆、提醒、设置视觉一致
- [ ] 小机器人头像和全屏机器人脸状态一致
- [ ] 移动端文字不溢出按钮或卡片
- [ ] 页面视觉与 `design/首屏示例.png`、`design/记忆示例.png` 的设备屏方向一致
- [ ] 页面中无新增临时 hex 颜色，新增颜色必须来自 Tailwind theme token

---

## Step 8: 测试与回归

**自动检查：**
- [ ] `pnpm test`
- [ ] `pnpm exec tsc --noEmit`
- [ ] `pnpm exec expo start --web` 可正常编译 NativeWind / Metro 配置

**手动冒烟：**
- [ ] 启动 App 后默认进入机器人脸
- [ ] 点击机器人脸打开快捷面板
- [ ] 进入对话页并返回机器人
- [ ] 按住说话，状态从 listening → processing → sleeping
- [ ] 视觉诊断返回 evidence 后，对话页显示图片
- [ ] 记忆页加载并展示 evidence 图片
- [ ] 设置页可运行 KWS / 声纹 / 视觉 / 日历诊断
- [ ] 横屏无明显重叠
- [ ] 竖屏不崩溃、不遮挡关键操作

---

## 执行顺序

```text
Step 0 进度与 todo
        │
Step 1 路由外壳
        │
Step 2 机器人首页
        │
        ├── Step 3 对话空间
        ├── Step 4 记忆空间
        ├── Step 5 提醒空间
        └── Step 6 设置空间
        │
Step 7 视觉系统统一
        │
Step 8 测试与回归
```

**建议 commit 节点：**
- [ ] commit 1: progress/todo + NativeWind setup + route shell
- [ ] commit 2: robot face home
- [ ] commit 3: conversation + memory redesign
- [ ] commit 4: reminders + settings redesign
- [ ] commit 5: visual polish + tests

---

## 验收矩阵

| # | 标准 | 关键依赖 |
|---|------|----------|
| 1 | 默认首屏是机器人脸 | Step 1 + Step 2 |
| 2 | 无常驻 Tab / header | Step 1 |
| 3 | 点击机器人可进入功能空间 | Step 2 |
| 4 | 对话仍可语音输入 | Step 3 |
| 5 | evidence 图片仍展示 | Step 3 + Step 4 |
| 6 | 记忆筛选仍可用 | Step 4 |
| 7 | 提醒空间可访问 | Step 5 |
| 8 | 设置诊断能力不丢 | Step 6 |
| 9 | 横屏体验完整 | Step 7 |
| 10 | anti-regression 通过 | Step 8 |
| 11 | NativeWind v4 样式基础设施可编译 | Step 0 + Step 8 |
| 12 | 视觉符合设计参考图 | Step 7 + Step 8 |

---

## 明确不做

- [ ] 不重写 server API
- [ ] 不改 Mem0 / memory 存储结构
- [ ] 不改语音状态机业务逻辑
- [ ] 不新增复杂提醒后端模型
- [ ] 不引入大型 UI 框架
- [ ] 不为了 NativeWind 迁移而重写无关业务组件
- [ ] 不把诊断能力删除，只做收纳和视觉降噪

---

## 默认假设

- 当前 Phase 1 核心能力已经验证，UI 改造以“不破坏链路”为第一约束
- 横屏是主场景，符合桌面机器人设备定位
- 竖屏只做兼容，不作为主要设计基准
- `.claude/plans/ui-redesign.md` 作为本方案落地文件
- 实施时需要保留用户已有工作区改动，不回滚无关文件
