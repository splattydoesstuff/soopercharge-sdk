import { useCallback, useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Switch,
  ScrollView,
  useColorScheme,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUserStore } from "@/src/store/user";
import { checkServerHealth } from "@/src/server-api/client";
import { speakerIdService } from "@/src/voice/speaker-id";
import { sttService } from "@/src/voice/stt";

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const {
    preferences,
    updatePreferences,
    serverConnected,
    setServerConnected,
    name,
    voiceEnrolled,
    setVoiceEnrolled,
    setVoiceState,
  } = useUserStore();
  const [enrolling, setEnrolling] = useState(false);
  const [savingEnrollment, setSavingEnrollment] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    const connected = await checkServerHealth();
    setServerConnected(connected);
  }, [setServerConnected]);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  useEffect(() => {
    speakerIdService
      .refreshEnrollmentStatus()
      .then(setVoiceEnrolled)
      .catch(() => setVoiceEnrolled(false));
  }, [setVoiceEnrolled]);

  const startEnrollment = useCallback(async () => {
    if (enrolling || savingEnrollment) return;

    setEnrollmentError(null);
    setEnrolling(true);
    setVoiceState("listening");

    try {
      await sttService.startRecording();
    } catch (error) {
      console.error("[Settings] Failed to start speaker enrollment:", error);
      setEnrollmentError("录音启动失败");
      setEnrolling(false);
      setVoiceState("sleeping");
    }
  }, [enrolling, savingEnrollment, setVoiceState]);

  const finishEnrollment = useCallback(async () => {
    if (!enrolling) return;

    setEnrolling(false);
    setSavingEnrollment(true);
    setVoiceState("verifying");

    try {
      const audioUri = await sttService.stopRecording();
      await speakerIdService.enrollFromFile(audioUri);
      setVoiceEnrolled(true);
      setEnrollmentError(null);
    } catch (error) {
      console.error("[Settings] Failed to save speaker enrollment:", error);
      setEnrollmentError("声纹保存失败");
      setVoiceEnrolled(false);
    } finally {
      setSavingEnrollment(false);
      setVoiceState("sleeping");
    }
  }, [enrolling, setVoiceEnrolled, setVoiceState]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? "#111827" : "#F9FAFB" }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDark ? "#F9FAFB" : "#111827" }]}>
            个人信息
          </Text>
          <View style={[styles.card, { backgroundColor: isDark ? "#1F2937" : "#FFFFFF" }]}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: isDark ? "#D1D5DB" : "#374151" }]}>称呼</Text>
              <Text style={[styles.value, { color: isDark ? "#F9FAFB" : "#111827" }]}>
                {name}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: isDark ? "#D1D5DB" : "#374151" }]}>
                声纹
              </Text>
              <Text style={[styles.value, { color: isDark ? "#F9FAFB" : "#111827" }]}>
                {voiceEnrolled ? "已注册" : "未注册"}
              </Text>
            </View>
            <Pressable
              style={[
                styles.enrollButton,
                enrolling && styles.enrollButtonActive,
                savingEnrollment && styles.disabledButton,
              ]}
              onPressIn={startEnrollment}
              onPressOut={finishEnrollment}
              disabled={savingEnrollment}
            >
              <Text style={styles.enrollButtonText}>
                {savingEnrollment ? "保存中..." : enrolling ? "松开完成" : "按住录入本次会话声纹"}
              </Text>
            </Pressable>
            {enrollmentError ? <Text style={styles.errorText}>{enrollmentError}</Text> : null}
          </View>
        </View>

        {/* Server connection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDark ? "#F9FAFB" : "#111827" }]}>
            服务器
          </Text>
          <View style={[styles.card, { backgroundColor: isDark ? "#1F2937" : "#FFFFFF" }]}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: isDark ? "#D1D5DB" : "#374151" }]}>
                本地服务器
              </Text>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: serverConnected ? "#10B981" : "#EF4444" },
                  ]}
                />
                <Text style={[styles.value, { color: isDark ? "#F9FAFB" : "#111827" }]}>
                  {serverConnected ? "已连接" : "未连接"}
                </Text>
              </View>
            </View>
            <Pressable style={styles.checkButton} onPress={checkConnection}>
              <Text style={styles.checkButtonText}>重新检测</Text>
            </Pressable>
          </View>
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDark ? "#F9FAFB" : "#111827" }]}>
            功能开关
          </Text>
          <View style={[styles.card, { backgroundColor: isDark ? "#1F2937" : "#FFFFFF" }]}>
            <View style={styles.switchRow}>
              <Text style={[styles.label, { color: isDark ? "#D1D5DB" : "#374151" }]}>
                语音回复
              </Text>
              <Switch
                value={preferences.ttsEnabled}
                onValueChange={(v) => updatePreferences({ ttsEnabled: v })}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={[styles.label, { color: isDark ? "#D1D5DB" : "#374151" }]}>
                摄像头
              </Text>
              <Switch
                value={preferences.cameraEnabled}
                onValueChange={(v) => updatePreferences({ cameraEnabled: v })}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={[styles.label, { color: isDark ? "#D1D5DB" : "#374151" }]}>
                日历提醒
              </Text>
              <Switch
                value={preferences.calendarEnabled}
                onValueChange={(v) => updatePreferences({ calendarEnabled: v })}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={[styles.label, { color: isDark ? "#D1D5DB" : "#374151" }]}>
                唤醒词（Phase 1.5）
              </Text>
              <Switch
                value={preferences.wakeWordEnabled}
                onValueChange={(v) => updatePreferences({ wakeWordEnabled: v })}
                disabled
              />
            </View>
          </View>
        </View>

        {/* Version */}
        <View style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: isDark ? "#6B7280" : "#9CA3AF" }]}>
            LOOI v1.0.0 · Phase 1 Memory Loop MVP
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  card: { borderRadius: 12, padding: 16, gap: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 15 },
  value: { fontSize: 15, fontWeight: "500" },
  checkButton: {
    backgroundColor: "#6D28D9",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  checkButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  enrollButton: {
    backgroundColor: "#6D28D9",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  enrollButtonActive: { backgroundColor: "#EF4444" },
  disabledButton: { opacity: 0.6 },
  enrollButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  errorText: { color: "#EF4444", fontSize: 13 },
  versionContainer: { alignItems: "center", paddingVertical: 24 },
  versionText: { fontSize: 13 },
});
