import { StyleSheet, Text, View } from "react-native";
import { DeviceShell } from "@/src/ui/DeviceShell";
import { looiTheme } from "@/src/ui/looi-theme";
import { useConversationStore } from "@/src/store/conversation";
import { useUserStore } from "@/src/store/user";

const capabilityRows = [
  {
    title: "今日提醒",
    body: "现有链路会在日历观察触发时发送通知并尝试语音播报。",
    time: "待日历事件触发",
  },
  {
    title: "日历事件",
    body: "日历感知器负责读取系统日历，设置页保留真实日历 smoke 入口。",
    time: "Calendar perceiver",
  },
  {
    title: "关联上下文",
    body: "提醒响应会搜索相关记忆作为上下文，不在本页新增后端 schema。",
    time: "Memory search",
  },
] as const;

export default function RemindersScreen() {
  const messages = useConversationStore((state) => state.messages);
  const calendarEnabled = useUserStore((state) => state.preferences.calendarEnabled);
  const reminderMessages = messages.filter((message) => message.intent === "remind");

  return (
    <DeviceShell title="提醒" eyebrow="REMINDER SPACE">
      <View style={styles.hero}>
        <View>
          <Text style={styles.heroLabel}>安静提醒面板</Text>
          <Text style={styles.heroCopy}>
            LOOI 当前只展示已有日历和提醒链路的状态，不创建新的提醒模型。
          </Text>
        </View>
        <View style={[styles.statusPill, calendarEnabled && styles.statusPillActive]}>
          <Text style={[styles.statusText, calendarEnabled && styles.statusTextActive]}>
            {calendarEnabled ? "日历开启" : "日历关闭"}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        {capabilityRows.map((row) => (
          <View key={row.title} style={styles.card}>
            <Text style={styles.cardTime}>{row.time}</Text>
            <Text style={styles.cardTitle}>{row.title}</Text>
            <Text style={styles.cardBody}>{row.body}</Text>
          </View>
        ))}
      </View>

      <View style={styles.emptyPanel}>
        <View style={styles.emptyLine} />
        <Text style={styles.emptyTitle}>
          {reminderMessages.length > 0 ? "最近提醒已写入对话" : "当前没有待展示提醒"}
        </Text>
        <Text style={styles.emptyText}>
          需要真实链路验证时，在设置里的日历提醒能力区运行诊断。
        </Text>
      </View>
    </DeviceShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 112,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: looiTheme.surface,
    padding: 18,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
  },
  heroLabel: {
    color: looiTheme.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
  },
  heroCopy: {
    color: looiTheme.muted,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 520,
  },
  statusPill: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: looiTheme.line,
    justifyContent: "center",
  },
  statusPillActive: {
    borderColor: looiTheme.lineActive,
    backgroundColor: "rgba(40, 213, 255, 0.08)",
  },
  statusText: {
    color: looiTheme.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  statusTextActive: {
    color: looiTheme.cyan,
  },
  grid: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  card: {
    flexGrow: 1,
    flexBasis: 220,
    minHeight: 154,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: "rgba(8, 18, 30, 0.62)",
    padding: 16,
  },
  cardTime: {
    color: looiTheme.cyan,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 16,
  },
  cardTitle: {
    color: looiTheme.text,
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardBody: {
    color: looiTheme.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  emptyPanel: {
    marginTop: 16,
    minHeight: 160,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: looiTheme.blackGlass,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyLine: {
    width: 72,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(40, 213, 255, 0.38)",
    marginBottom: 16,
  },
  emptyTitle: {
    color: looiTheme.text,
    fontSize: 21,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    color: looiTheme.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});
