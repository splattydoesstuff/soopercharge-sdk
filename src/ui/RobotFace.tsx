import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useUserStore, VoiceState } from "@/src/store/user";
import { looiStatusLabels, looiTheme } from "@/src/ui/looi-theme";

type RobotFaceMode = "fullscreen" | "avatar";

type RobotFaceProps = {
  mode?: RobotFaceMode;
  onPress?: () => void;
  labelVisible?: boolean;
};

export function RobotFace({
  mode = "fullscreen",
  onPress,
  labelVisible = mode === "fullscreen",
}: RobotFaceProps) {
  const voiceState = useUserStore((state) => state.voiceState);
  const pulse = useSharedValue(0);
  const blink = useSharedValue(1);
  const isAvatar = mode === "avatar";
  const face = useMemo(() => getFaceForState(voiceState), [voiceState]);

  useEffect(() => {
    const duration = voiceState === "listening" ? 720 : 1400;
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration }), withTiming(0, { duration })),
      -1
    );
    return () => cancelAnimation(pulse);
  }, [pulse, voiceState]);

  useEffect(() => {
    const runBlink = () => {
      blink.value = withSequence(withTiming(0.16, { duration: 70 }), withTiming(1, { duration: 110 }));
    };
    const timer = setInterval(runBlink, voiceState === "processing" ? 2600 : 4200);
    return () => {
      clearInterval(timer);
      cancelAnimation(blink);
    };
  }, [blink, voiceState]);

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.42, voiceState === "sleeping" ? 0.64 : 0.92]),
    transform: [
      { scale: interpolate(pulse.value, [0, 1], [1, voiceState === "sleeping" ? 1.05 : 1.18]) },
    ],
  }));

  const eyeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: blink.value }],
  }));

  const risingWaveStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: interpolate(pulse.value, [0, 1], [0.88, 1.18]) }],
  }));

  const fallingWaveStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: interpolate(pulse.value, [0, 1], [1.18, 0.82]) }],
  }));

  const content = (
    <View style={[styles.wrap, isAvatar ? styles.avatarWrap : styles.fullscreenWrap]}>
      {isAvatar ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            styles.avatarGlow,
            glowAnimatedStyle,
            {
              backgroundColor: face.glow,
            },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.head,
          isAvatar ? styles.avatarHead : styles.fullscreenExpression,
        ]}
      >
        <View style={[styles.browRow, isAvatar && styles.avatarBrowRow]}>
          <View style={[styles.brow, isAvatar && styles.avatarBrow, face.browStyle]} />
          <View style={[styles.brow, isAvatar && styles.avatarBrow, face.browStyle]} />
        </View>
        <View style={[styles.eyeRow, isAvatar && styles.avatarEyeRow]}>
          <Animated.View
            style={[
              styles.eye,
              isAvatar && styles.avatarEye,
              eyeAnimatedStyle,
              {
                backgroundColor: face.eye,
              },
              voiceState === "processing" && styles.eyeLookingLeft,
            ]}
          />
          <Animated.View
            style={[
              styles.eye,
              isAvatar && styles.avatarEye,
              eyeAnimatedStyle,
              {
                backgroundColor: face.eye,
              },
              voiceState === "processing" && styles.eyeLookingLeft,
            ]}
          />
        </View>
        <View style={[styles.mouthArea, isAvatar && styles.avatarMouthArea]}>
          {face.mouth === "wave" ? (
            <View style={styles.waveRow}>
              {[0, 1, 2, 3, 4].map((index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.waveBar,
                    isAvatar && styles.avatarWaveBar,
                    index % 2 === 0 ? risingWaveStyle : fallingWaveStyle,
                    {
                      opacity: voiceState === "sleeping" ? 0.45 : 0.92,
                    },
                  ]}
                />
              ))}
            </View>
          ) : (
            <View
              style={[
                styles.mouth,
                isAvatar && styles.avatarMouth,
                face.mouth === "smile" && styles.smileMouth,
                face.mouth === "flat" && styles.flatMouth,
              ]}
            />
          )}
        </View>
      </View>
      {labelVisible ? (
        <View style={[styles.caption, isAvatar && styles.avatarCaption]}>
          <Text style={[styles.captionText, isAvatar && styles.avatarCaptionText]}>
            {looiStatusLabels[voiceState]}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.pressable}>
      {content}
    </Pressable>
  );
}

function getFaceForState(voiceState: VoiceState) {
  switch (voiceState) {
    case "listening":
      return {
        eye: looiTheme.cyan,
        glow: "rgba(40, 213, 255, 0.28)",
        mouth: "wave" as const,
        browStyle: styles.focusBrow,
      };
    case "processing":
      return {
        eye: looiTheme.blue,
        glow: "rgba(31, 124, 255, 0.28)",
        mouth: "flat" as const,
        browStyle: styles.thinkingBrow,
      };
    case "speaking":
      return {
        eye: looiTheme.ok,
        glow: "rgba(77, 231, 180, 0.22)",
        mouth: "wave" as const,
        browStyle: styles.focusBrow,
      };
    case "verifying":
      return {
        eye: looiTheme.warn,
        glow: "rgba(255, 209, 102, 0.2)",
        mouth: "smile" as const,
        browStyle: styles.focusBrow,
      };
    case "sleeping":
    default:
      return {
        eye: looiTheme.cyan,
        glow: "rgba(40, 213, 255, 0.16)",
        mouth: "smile" as const,
        browStyle: styles.restBrow,
      };
  }
}

const styles = StyleSheet.create({
  pressable: {
    alignItems: "center",
    justifyContent: "center",
  },
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenWrap: {
    width: "100%",
    minHeight: 360,
  },
  avatarWrap: {
    width: 92,
    height: 92,
  },
  glow: {
    position: "absolute",
    borderRadius: 999,
  },
  fullscreenGlow: {
    width: 520,
    height: 300,
  },
  avatarGlow: {
    width: 98,
    height: 72,
  },
  head: {
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenExpression: {
    width: 560,
    height: 320,
  },
  avatarHead: {
    width: 80,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: "rgba(3, 12, 22, 0.78)",
    shadowColor: looiTheme.cyan,
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  browRow: {
    position: "absolute",
    top: 54,
    left: 108,
    right: 108,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  avatarBrowRow: {
    top: 10,
    left: 16,
    right: 16,
  },
  brow: {
    width: 96,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(237, 247, 255, 0.24)",
  },
  avatarBrow: {
    width: 17,
    height: 2,
  },
  restBrow: {
    opacity: 0.45,
  },
  focusBrow: {
    opacity: 0.82,
    backgroundColor: "rgba(40, 213, 255, 0.48)",
  },
  thinkingBrow: {
    opacity: 0.66,
    transform: [{ rotate: "-4deg" }],
  },
  eyeRow: {
    width: 340,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  avatarEyeRow: {
    width: 44,
  },
  eye: {
    width: 100,
    height: 60,
    borderRadius: 34,
    shadowColor: looiTheme.cyan,
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  avatarEye: {
    width: 14,
    height: 10,
    borderRadius: 7,
    shadowRadius: 7,
  },
  eyeLookingLeft: {
    marginLeft: -10,
    marginRight: 10,
  },
  mouthArea: {
    height: 70,
    marginTop: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMouthArea: {
    height: 16,
    marginTop: 8,
  },
  mouth: {
    width: 112,
    height: 38,
    borderBottomWidth: 6,
    borderColor: "rgba(40, 213, 255, 0.78)",
  },
  avatarMouth: {
    width: 22,
    height: 8,
    borderBottomWidth: 2,
  },
  smileMouth: {
    borderRadius: 999,
  },
  flatMouth: {
    height: 4,
    borderBottomWidth: 0,
    borderRadius: 999,
    backgroundColor: "rgba(40, 213, 255, 0.72)",
  },
  waveRow: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  waveBar: {
    width: 10,
    height: 32,
    borderRadius: 999,
    backgroundColor: looiTheme.cyan,
  },
  avatarWaveBar: {
    width: 3,
    height: 9,
    gap: 2,
  },
  caption: {
    marginTop: 30,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: "rgba(8, 18, 30, 0.58)",
  },
  avatarCaption: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  captionText: {
    color: looiTheme.text,
    fontSize: 15,
    fontWeight: "600",
  },
  avatarCaptionText: {
    fontSize: 10,
  },
});
