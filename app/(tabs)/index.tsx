import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LazyCameraFrameFeeder } from "@/src/ui/LazyCameraFrameFeeder";
import { RobotFace } from "@/src/ui/RobotFace";
import { ConversationOverlay } from "@/src/ui/ConversationOverlay";
import { ImageOverlay } from "@/src/ui/ImageOverlay";
import { looiTheme } from "@/src/ui/looi-theme";

const quickActions = [
  { label: "对话", mark: "C", href: "/conversation" },
  { label: "记忆", mark: "M", href: "/memories" },
  { label: "提醒", mark: "R", href: "/reminders" },
  { label: "设置", mark: "S", href: "/settings" },
] as const;

export default function IndexScreen() {
  const router = useRouter();
  const [quickPanelVisible, setQuickPanelVisible] = useState(false);

  useEffect(() => {
    if (!quickPanelVisible) return;
    const timer = setTimeout(() => setQuickPanelVisible(false), 4200);
    return () => clearTimeout(timer);
  }, [quickPanelVisible]);

  return (
    <SafeAreaView style={styles.home}>
      <LazyCameraFrameFeeder />
      <View style={styles.faceStage}>
        <RobotFace
          mode="fullscreen"
          labelVisible={false}
          onPress={() => setQuickPanelVisible((visible) => !visible)}
        />
      </View>
      <ConversationOverlay />
      <ImageOverlay />
      {quickPanelVisible ? (
        <View style={styles.quickPanel}>
          <Text style={styles.quickPrompt}>今天需要我做什么？</Text>
          <View style={styles.quickRow}>
            {quickActions.map((action) => (
              <Pressable
                key={action.href}
                accessibilityRole="button"
                onPress={() => {
                  setQuickPanelVisible(false);
                  router.replace(action.href);
                }}
                style={styles.quickAction}
              >
                <Text style={styles.quickMark}>{action.mark}</Text>
                <Text style={styles.quickLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  home: {
    flex: 1,
    backgroundColor: looiTheme.bg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  faceStage: {
    width: "100%",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quickPanel: {
    position: "absolute",
    bottom: 48,
    alignSelf: "center",
    minWidth: 520,
    maxWidth: "86%",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: looiTheme.lineActive,
    backgroundColor: "rgba(3, 13, 24, 0.86)",
    paddingHorizontal: 22,
    paddingVertical: 16,
    gap: 14,
  },
  quickPrompt: {
    color: looiTheme.text,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  quickRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  quickAction: {
    minWidth: 108,
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: "rgba(40, 213, 255, 0.07)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  quickMark: {
    color: looiTheme.cyan,
    fontSize: 13,
    fontWeight: "800",
  },
  quickLabel: {
    color: looiTheme.text,
    fontSize: 14,
    fontWeight: "600",
  },
});
