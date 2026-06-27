import { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Href, usePathname, useRouter } from "expo-router";
import { RobotFace } from "@/src/ui/RobotFace";
import { looiTheme } from "@/src/ui/looi-theme";

type DeviceShellProps = {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  scroll?: boolean;
  onReturnHome?: () => void;
};

const navItems = [
  { href: "/conversation", matchPath: "/conversation", label: "对话", shortLabel: "C" },
  { href: "/memories", matchPath: "/memories", label: "记忆", shortLabel: "M" },
  { href: "/reminders", matchPath: "/reminders", label: "提醒", shortLabel: "R" },
  { href: "/settings", matchPath: "/settings", label: "设置", shortLabel: "S" },
] as const;

export function DeviceShell({
  title,
  eyebrow,
  children,
  scroll = true,
  onReturnHome,
}: DeviceShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const returnHome = () => {
    if (onReturnHome) {
      onReturnHome();
      return;
    }
    router.replace("/");
  };
  const content = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fixedContent}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundGrid} pointerEvents="none" />
      <View style={styles.frame}>
        <View style={styles.rail}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回机器人"
            onPress={returnHome}
            style={styles.homeButton}
          >
            <Text style={styles.homeMark}>LOOI</Text>
          </Pressable>
          <View style={styles.navStack}>
            {navItems.map((item) => {
              const active = pathname === item.matchPath;
              return (
                <Pressable
                  key={item.href}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    if (active) return;
                    router.replace(item.href as Href);
                  }}
                  style={StyleSheet.flatten([
                    styles.navItem,
                    active && styles.navItemActive,
                  ])}
                >
                  <Text style={[styles.navShort, active && styles.navShortActive]}>
                    {item.shortLabel}
                  </Text>
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.main}>
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
              <Text style={styles.title}>{title}</Text>
            </View>
            <RobotFace mode="avatar" onPress={returnHome} />
          </View>
          {content}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: looiTheme.bg,
  },
  backgroundGrid: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.12,
    backgroundColor: looiTheme.bg,
    borderColor: looiTheme.line,
    borderWidth: 1,
  },
  frame: {
    flex: 1,
    flexDirection: "row",
    padding: 14,
    gap: 14,
  },
  rail: {
    width: 104,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: looiTheme.rail,
    alignItems: "center",
    paddingVertical: 14,
  },
  homeButton: {
    width: 72,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: "rgba(40, 213, 255, 0.06)",
  },
  homeMark: {
    color: looiTheme.text,
    fontSize: 12,
    fontWeight: "700",
  },
  navStack: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 10,
  },
  navItem: {
    width: 78,
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  navItemActive: {
    borderColor: looiTheme.lineActive,
    backgroundColor: "rgba(40, 213, 255, 0.08)",
  },
  navShort: {
    color: looiTheme.muted,
    fontSize: 18,
    fontWeight: "700",
  },
  navShortActive: {
    color: looiTheme.cyan,
  },
  navLabel: {
    color: looiTheme.muted,
    fontSize: 12,
  },
  navLabelActive: {
    color: looiTheme.text,
  },
  main: {
    flex: 1,
    borderRadius: 30,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: looiTheme.bgRaised,
  },
  header: {
    minHeight: 122,
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleBlock: {
    flex: 1,
    paddingRight: 18,
  },
  eyebrow: {
    color: looiTheme.cyan,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  title: {
    color: looiTheme.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
  fixedContent: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
});
