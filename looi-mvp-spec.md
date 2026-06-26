# LOOI MVP 规格

## 目标

做一个“识人 - 记事 - 检索 - 主动提醒 - 语音和身体反馈”的随身上下文机器人，不做通用助手。（基于 expo 56）

## MVP 范围

只实现 3 个闭环场景：

1. 识别主人并建立会话
2. 记住物品放在哪里
3. 在合适时机主动提醒

## 场景 1：识别主人并建立会话

**User Story:** 作为主人，我希望机器人能认出我并恢复上下文，这样它能直接接上我刚才在做的事。

**Acceptance Criteria:**
1. WHEN 主人靠近 THEN 系统 SHALL 输出人脸候选身份列表
2. WHEN 主人开始说话 THEN 系统 SHALL 用声纹完成二次确认
3. WHEN 身份确认成功 THEN 系统 SHALL 加载该主人的近期上下文、偏好和待办
4. WHEN 主人进入可跟踪范围 THEN 系统 SHALL 让云台持续朝向主人
5. WHEN 会话建立成功 THEN 系统 SHALL 语音播报带上下文的话术
6. WHEN 身份不确定 THEN 系统 SHALL 先追问确认，而不是直接绑定错误身份

**示例输出：**
“晚上好，你半小时前说要找充电线，需要继续找吗？”

## 场景 2：记住物品放在哪里

**User Story:** 作为主人，我希望机器人记住我把物品放到了哪里，这样我之后可以直接问回来。

**Acceptance Criteria:**
1. WHEN 摄像头检测到主人持有物品 THEN 系统 SHALL 生成物体跟踪候选
2. WHEN 检测到手与物品分离 THEN 系统 SHALL 生成放置事件候选
3. WHEN 放置事件候选成立 THEN 系统 SHALL 保存前后数秒证据帧
4. WHEN 事件落入可解释空间位置 THEN 系统 SHALL 生成位置描述
5. WHEN 主人询问物品位置 THEN 系统 SHALL 检索相关记忆并返回最近一次可信事件
6. WHEN 返回记忆结果 THEN 系统 SHALL 同步展示当时截图或证据卡片
7. WHEN 证据不足 THEN 系统 SHALL 明确说明不确定位置

**示例输出：**
“你今天 14:32 把它放在书桌左侧第二层，我当时看到了。”

## 场景 3：主动提醒

**User Story:** 作为主人，我希望机器人能在合适时机主动提醒我重要事项，这样我不会错过会议或关联记忆。

**Acceptance Criteria:**
1. WHEN 日历中存在即将开始的事件 THEN 系统 SHALL 生成提醒候选
2. WHEN 机器人检测到主人在附近 THEN 系统 SHALL 尝试进行人物识别
3. WHEN 当前场景适合打扰 THEN 系统 SHALL 发出语音提醒
4. WHEN 提醒与历史会议内容相关 THEN 系统 SHALL 拼装相关记忆摘要
5. WHEN 提醒发生 THEN 系统 SHALL 在屏幕上展示对应卡片
6. WHEN 当前场景不适合打扰 THEN 系统 SHALL 延迟提醒或只做轻提示

**示例输出：**
“五分钟后是 Agent Context 会议。昨天会议里提到的检索评测结果，我已经放在屏幕上了。”

## 非目标

- 不做多主人自治切换
- 不做完整视觉通用助手
- 不做长期无人监督学习闭环
- 不做复杂规划代理
- 不做全量外部系统接入

## 设计

### 系统分层

1. 感知层
   - 人脸候选识别
   - 声纹确认
   - 人物跟踪
   - 物体检测
   - 日历事件拉取

2. 事件层
   - 把原始感知整理成结构化事件
   - 统一表示 `who / what / where / when / evidence`

3. 记忆层
   - 主人档案
   - 近期上下文
   - 事件记忆
   - 证据帧索引

4. 决策层
   - 是否打扰
   - 是否提醒
   - 是否追问确认
   - 是否检索旧记忆

5. 输出层
   - 语音回复
   - 云台朝向
   - 身体动作
   - 屏幕卡片

### 统一事件模型

```ts
type IdentityCandidate = {
  personId: string;
  confidence: number;
};

type MemoryEventKind = "identity" | "placement" | "calendar_reminder";

type MemoryEvent = {
  id: string;
  kind: MemoryEventKind;
  timestamp: string;
  subjectId?: string;
  objectName?: string;
  locationText?: string;
  evidenceFrameId?: string;
  evidenceVideoId?: string;
  relatedCalendarEventId?: string;
  confidence: number;
};

interface ContextService {
  loadRecentContext(personId: string): Promise<void>;
  rememberEvent(event: MemoryEvent): Promise<void>;
  searchMemory(query: string, personId: string): Promise<MemoryEvent[]>;
}
```

### 运行原则

- 先只支持 1 个主人
- 先只支持少量高价值物品
- 先只支持日历和本地记忆两类提醒源
- 先优先可解释结果，不优先黑盒自治
- 先保证“说得对、记得住、找得到”，再扩展能力

## 验收标准

1. WHEN 主人靠近 THEN 系统 SHALL 完成会话建立
2. WHEN 主人询问“我的 AirPods 放哪了” THEN 系统 SHALL 返回最近一次可信放置事件
3. WHEN 会议即将开始且主人在附近 THEN 系统 SHALL 主动提醒并展示卡片
4. WHEN 证据不足 THEN 系统 SHALL 明确说明“不确定”，而不是编造
5. WHEN 同一事件被再次检索 THEN 系统 SHALL 返回同一条可追溯记忆记录
