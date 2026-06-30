import { startLooiRobotAutoConnection } from "@/src/device-tools/looi-robot-autoconnect";
import {
  computeSetupReadiness,
  type SetupReadiness,
} from "@/src/setup/setup-readiness";
import { ConversationOverlay } from "@/src/ui/ConversationOverlay";
import { ImageOverlay } from "@/src/ui/ImageOverlay";
import { looiTheme } from "@/src/ui/looi-theme";
import { RobotFace } from "@/src/ui/RobotFace";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import regularSymbolWeight from "expo-symbols/androidWeights/regular";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const quickActions = [
  {
    id: "conversation",
    label: "对话",
    href: "/conversation",
    symbol: { ios: "message.fill", android: "chat" },
  },
  {
    id: "remember",
    label: "记住这个",
    href: "/memories",
    symbol: { ios: "square.and.pencil", android: "edit_note" },
  },
  {
    id: "memories",
    label: "查看记忆",
    href: "/memories",
    symbol: { ios: "brain.head.profile", android: "psychology" },
  },
  {
    id: "settings",
    label: "设置",
    href: "/settings",
    symbol: { ios: "gearshape.fill", android: "settings" },
  },
] as const;

export default function IndexScreen() {
  const router = useRouter();
  const [quickPanelVisible, setQuickPanelVisible] = useState(false);
  const [readiness, setReadiness] = useState<SetupReadiness | null>(null);

  useEffect(() => {
    if (!quickPanelVisible) return;
    const timer = setTimeout(() => setQuickPanelVisible(false), 4200);
    return () => clearTimeout(timer);
  }, [quickPanelVisible]);

  useEffect(() => {
    startLooiRobotAutoConnection().catch((error) => {
      console.warn("[Home] LOOI robot auto-connect failed:", error);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    computeSetupReadiness()
      .then((next) => {
        if (!cancelled) setReadiness(next);
      })
      .catch((error) => {
        console.warn("[Home] Failed to compute setup readiness:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const repairStep =
    readiness?.modelsReady === false
      ? "models"
      : readiness?.speakerEnrolled === false
        ? "speaker"
        : null;

  return (
    <SafeAreaView style={styles.home}>
      <View style={styles.faceStage}>
        {repairStep ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.replace(`/onboarding?step=${repairStep}` as never)
            }
            style={styles.repairBanner}
          >
            <Text style={styles.repairTitle}>
              {repairStep === "models" ? "语音模型未就绪" : "主人声纹未录入"}
            </Text>
            <Text style={styles.repairText}>打开初始化流程修复</Text>
          </Pressable>
        ) : null}
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
          <View style={styles.quickRow}>
            {quickActions.map((action) => (
              <Pressable
                key={action.id}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => {
                  setQuickPanelVisible(false);
                  router.replace(action.href);
                }}
                style={styles.quickAction}
              >
                <SymbolView
                  name={action.symbol}
                  size={25}
                  tintColor={looiTheme.cyan}
                  weight={{ ios: "semibold", android: regularSymbolWeight }}
                  fallback={<View style={styles.iconFallback} />}
                />
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
    top: "75%",
    alignSelf: "center",
    minWidth: 312,
    maxWidth: "86%",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: looiTheme.lineActive,
    backgroundColor: "rgba(3, 13, 24, 0.86)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  repairBanner: {
    position: "absolute",
    top: 34,
    alignSelf: "center",
    zIndex: 4,
    minWidth: 300,
    maxWidth: "86%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: looiTheme.lineActive,
    backgroundColor: "rgba(3, 13, 24, 0.88)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  repairTitle: {
    color: looiTheme.text,
    fontSize: 15,
    fontWeight: "800",
  },
  repairText: {
    color: looiTheme.cyan,
    fontSize: 12,
    fontWeight: "700",
  },
  quickRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  quickAction: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: "rgba(40, 213, 255, 0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconFallback: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: looiTheme.cyan,
  },
});
