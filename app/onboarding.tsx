import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import * as Calendar from "expo-calendar/legacy";
import { Camera } from "expo-camera";

import { RobotFace } from "@/src/ui/RobotFace";
import { looiTheme } from "@/src/ui/looi-theme";
import { downloadMissingSherpaModels, type SherpaModelDownloadProgress } from "@/src/voice/sherpa-model-download";
import { speakerIdService } from "@/src/voice/speaker-id";
import { liveSampleRecorder } from "@/src/voice/live-sample-recorder";
import {
  computeSetupReadiness,
  type SetupReadiness,
  type SetupStep,
} from "@/src/setup/setup-readiness";
import {
  setOnboardingCompleted,
  setOptionalCapabilitySkipped,
  type OptionalSetupCapability,
} from "@/src/setup/setup-storage";

type EnrollmentPrompt = {
  id: string;
  title: string;
  helper: string;
  phrase: string;
  optional?: boolean;
};

type RecordedEnrollmentSample = {
  promptId: string;
  samples: number[];
  quality: EnrollmentSampleQuality;
};

type EnrollmentSampleQuality = {
  ok: boolean;
  durationMs: number;
  energyMean: number;
  reason?: "too-short" | "too-quiet";
};

const setupSteps: { id: SetupStep; label: string }[] = [
  { id: "models", label: "模型" },
  { id: "speaker", label: "声纹" },
  { id: "permissions", label: "权限" },
  { id: "done", label: "完成" },
];

const modelCapabilities = [
  { key: "streamingAsr", label: "实时听懂你说话" },
  { key: "kws", label: "唤醒词" },
  { key: "speaker", label: "主人识别" },
  { key: "vad", label: "语音边界检测" },
  { key: "punctuation", label: "标点整理" },
] as const;

const enrollmentPrompts: EnrollmentPrompt[] = [
  {
    id: "normal",
    title: "正常音量",
    helper: "自然语速，录满约 2 秒。",
    phrase: "你好 LOOI, today I want to set up my voice.",
  },
  {
    id: "quiet",
    title: "轻声一点",
    helper: "覆盖低音量状态。",
    phrase: "LOOI, please remember my soft voice, 这也是我。",
  },
  {
    id: "fast",
    title: "稍快语速",
    helper: "覆盖语速变化。",
    phrase: "今天的天气不错, let's get things done quickly.",
  },
  {
    id: "natural",
    title: "日常说话",
    helper: "像平时一样连续说完。",
    phrase: "我刚刚把钥匙放在桌上, please remind me later.",
  },
  {
    id: "far",
    title: "远一点",
    helper: "可选，用于远场覆盖。",
    phrase: "Hey LOOI, can you hear me from here? 我在远一点的位置说话。",
    optional: true,
  },
];

const minEnrollmentSamples = 3;
const sampleRate = 16000;

type AudioStudioPermissionModule = {
  getPermissionsAsync?: () => Promise<{ granted?: boolean; status?: string }>;
  requestPermissionsAsync?: () => Promise<{ granted?: boolean; status?: string }>;
};

async function requestMicrophoneAccess(): Promise<void> {
  const existing = await getRecordingPermissionsAsync();
  if (!existing.granted) {
    const next = await requestRecordingPermissionsAsync();
    if (!next.granted) throw new Error("麦克风未授权");
  }

  const { AudioStudioModule } = await import("@siteed/audio-studio");
  const audioStudio = AudioStudioModule as AudioStudioPermissionModule;
  const studioExisting = await audioStudio.getPermissionsAsync?.();
  if (studioExisting && !studioExisting.granted) {
    const studioNext = await audioStudio.requestPermissionsAsync?.();
    if (!studioNext?.granted) throw new Error("麦克风未授权");
  }
}

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ step?: string }>();
  const [activeStep, setActiveStep] = useState<SetupStep>(normalizeSetupStep(params.step));
  const [readiness, setReadiness] = useState<SetupReadiness | null>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(true);
  const [modelProgress, setModelProgress] = useState<SherpaModelDownloadProgress | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [recordingPromptId, setRecordingPromptId] = useState<string | null>(null);
  const [enrollmentBusy, setEnrollmentBusy] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [recordedSamples, setRecordedSamples] = useState<Record<string, RecordedEnrollmentSample>>({});
  const [permissionBusy, setPermissionBusy] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const validSampleCount = useMemo(
    () => Object.values(recordedSamples).filter((sample) => sample.quality.ok).length,
    [recordedSamples]
  );

  const refreshReadiness = useCallback(async () => {
    setLoadingReadiness(true);
    try {
      const next = await computeSetupReadiness();
      setReadiness(next);
      setActiveStep((current) => (current === "done" ? current : next.nextStep));
    } finally {
      setLoadingReadiness(false);
    }
  }, []);

  useEffect(() => {
    refreshReadiness().catch((error) => {
      console.warn("[Onboarding] Failed to load setup readiness:", error);
      setLoadingReadiness(false);
    });
  }, [refreshReadiness]);

  useEffect(() => {
    setActiveStep(normalizeSetupStep(params.step));
  }, [params.step]);

  const goToStep = useCallback((step: SetupStep) => {
    setActiveStep(step);
    router.setParams({ step });
  }, [router]);

  const downloadModels = useCallback(async () => {
    if (modelBusy) return;
    setModelBusy(true);
    setModelError(null);
    setModelProgress(null);
    try {
      await downloadMissingSherpaModels(setModelProgress);
      await refreshReadiness();
      goToStep("speaker");
    } catch (error) {
      console.error("[Onboarding] Model download failed:", error);
      setModelError(error instanceof Error ? error.message : "模型下载失败");
    } finally {
      setModelBusy(false);
    }
  }, [goToStep, modelBusy, refreshReadiness]);

  const startPromptRecording = useCallback(async (promptId: string) => {
    if (recordingPromptId || enrollmentBusy) return;
    setEnrollmentError(null);
    setRecordingPromptId(promptId);
    try {
      await liveSampleRecorder.start();
    } catch (error) {
      console.error("[Onboarding] Failed to start enrollment recording:", error);
      await liveSampleRecorder.cancel().catch(() => undefined);
      setRecordingPromptId(null);
      setEnrollmentError("录音启动失败，请检查麦克风权限。");
    }
  }, [enrollmentBusy, recordingPromptId]);

  const stopPromptRecording = useCallback(async () => {
    if (!recordingPromptId) return;
    const promptId = recordingPromptId;
    setRecordingPromptId(null);
    try {
      const samples = await liveSampleRecorder.stop();
      const quality = assessEnrollmentSampleQuality(samples);
      setRecordedSamples((current) => ({
        ...current,
        [promptId]: { promptId, samples, quality },
      }));
      if (!quality.ok) {
        setEnrollmentError(getQualityMessage(quality));
      } else {
        setEnrollmentError(null);
      }
    } catch (error) {
      console.error("[Onboarding] Failed to finish enrollment recording:", error);
      setEnrollmentError("录音保存失败，请重试。");
    } finally {
      await liveSampleRecorder.cancel().catch(() => undefined);
    }
  }, [recordingPromptId]);

  const completeSpeakerEnrollment = useCallback(async () => {
    if (validSampleCount < minEnrollmentSamples || enrollmentBusy) return;
    setEnrollmentBusy(true);
    setEnrollmentError(null);
    try {
      const samples = enrollmentPrompts
        .map((prompt) => recordedSamples[prompt.id])
        .filter((sample): sample is RecordedEnrollmentSample => Boolean(sample?.quality.ok));
      const service = speakerIdService as typeof speakerIdService & {
        enroll?: (
          samples:
            | number[]
            | Array<{
                samples: number[];
                promptId: string;
                durationMs: number;
                quality: EnrollmentSampleQuality;
              }>,
          options?: { source: "onboarding" }
        ) => Promise<void>;
      };
      const multiSamples = samples.map((sample) => ({
        samples: sample.samples,
        promptId: sample.promptId,
        durationMs: sample.quality.durationMs,
        quality: sample.quality,
      }));
      await service.enroll?.(multiSamples, { source: "onboarding" });
      await refreshReadiness();
      goToStep("permissions");
    } catch (error) {
      console.error("[Onboarding] Speaker enrollment failed:", error);
      setEnrollmentError(error instanceof Error ? error.message : "声纹注册失败");
    } finally {
      setEnrollmentBusy(false);
    }
  }, [enrollmentBusy, goToStep, recordedSamples, refreshReadiness, validSampleCount]);

  const requestMicrophone = useCallback(async () => {
    setPermissionBusy("microphone");
    setPermissionError(null);
    try {
      await requestMicrophoneAccess();
      await refreshReadiness();
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : "麦克风授权失败");
    } finally {
      setPermissionBusy(null);
    }
  }, [refreshReadiness]);

  const requestCamera = useCallback(async () => {
    setPermissionBusy("camera");
    setPermissionError(null);
    try {
      const permission = await Camera.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error("相机未授权");
      await refreshReadiness();
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : "相机授权失败");
    } finally {
      setPermissionBusy(null);
    }
  }, [refreshReadiness]);

  const requestCalendar = useCallback(async () => {
    setPermissionBusy("calendar");
    setPermissionError(null);
    try {
      const permission = await Calendar.requestCalendarPermissionsAsync();
      if (!permission.granted) throw new Error("日历未授权");
      await refreshReadiness();
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : "日历授权失败");
    } finally {
      setPermissionBusy(null);
    }
  }, [refreshReadiness]);

  const skipCapability = useCallback(async (capability: OptionalSetupCapability) => {
    setOptionalCapabilitySkipped(capability, true);
    await refreshReadiness();
  }, [refreshReadiness]);

  const finishOnboarding = useCallback(async () => {
    setOnboardingCompleted(true);
    await refreshReadiness();
    router.replace("/");
  }, [refreshReadiness, router]);

  const canEnterDone = readiness?.requiredReady ?? false;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.frame}>
        <View style={styles.topBar}>
          {setupSteps.map((step, index) => {
            const active = step.id === activeStep;
            const complete = isStepComplete(step.id, readiness);
            return (
              <Pressable
                key={step.id}
                accessibilityRole="button"
                onPress={() => goToStep(step.id)}
                style={[
                  styles.topStep,
                  active && styles.topStepActive,
                  complete && styles.topStepComplete,
                ]}
              >
                <View style={[styles.stepNumber, complete && styles.stepNumberComplete]}>
                  <Text style={styles.stepNumberText}>{complete ? "✓" : index + 1}</Text>
                </View>
                <View style={styles.topStepCopy}>
                  <Text style={[styles.topStepLabel, active && styles.topStepLabelActive]}>
                    {step.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.main}>
          {loadingReadiness ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={looiTheme.cyan} />
              <Text style={styles.mutedText}>正在检查设备状态</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.stageHeader}>
                <View style={styles.stageTitleBlock}>
                  <Text style={styles.eyebrow}>LOOI 初始化</Text>
                  <Text style={styles.title}>{getStepTitle(activeStep)}</Text>
                </View>
                <RobotFace mode="avatar" labelVisible={false} />
              </View>
              {activeStep === "models" ? (
                <ModelsStep
                  readiness={readiness}
                  busy={modelBusy}
                  progress={modelProgress}
                  error={modelError}
                  onDownload={downloadModels}
                  onContinue={() => goToStep("speaker")}
                />
              ) : null}
              {activeStep === "speaker" ? (
                <SpeakerStep
                  samples={recordedSamples}
                  validSampleCount={validSampleCount}
                  recordingPromptId={recordingPromptId}
                  busy={enrollmentBusy}
                  error={enrollmentError}
                  onStart={startPromptRecording}
                  onStop={stopPromptRecording}
                  onComplete={completeSpeakerEnrollment}
                  microphoneReady={Boolean(readiness?.microphoneReady)}
                  microphoneBusy={permissionBusy === "microphone"}
                  onRequestMicrophone={requestMicrophone}
                />
              ) : null}
              {activeStep === "permissions" ? (
                <PermissionsStep
                  readiness={readiness}
                  busyKey={permissionBusy}
                  error={permissionError}
                  onRequestMicrophone={requestMicrophone}
                  onRequestCamera={requestCamera}
                  onRequestCalendar={requestCalendar}
                  onSkip={skipCapability}
                  onContinue={() => goToStep("done")}
                />
              ) : null}
              {activeStep === "done" ? (
                <DoneStep readiness={readiness} canFinish={canEnterDone} onFinish={finishOnboarding} />
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function ModelsStep({
  readiness,
  busy,
  progress,
  error,
  onDownload,
  onContinue,
}: {
  readiness: SetupReadiness | null;
  busy: boolean;
  progress: SherpaModelDownloadProgress | null;
  error: string | null;
  onDownload: () => void;
  onContinue: () => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.grid}>
        {modelCapabilities.map((capability) => {
          const ready = readiness?.modelStatus?.[capability.key].ready ?? false;
          return (
            <View key={capability.key} style={styles.statusRow}>
              <Text style={styles.statusLabel}>{capability.label}</Text>
              <StatusBadge ready={ready} readyText="已就绪" pendingText="待安装" />
            </View>
          );
        })}
      </View>
      {progress ? (
        <View style={styles.progressBlock}>
          <Text style={styles.progressLabel}>{progress.label}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress.progress * 100)}%` }]} />
          </View>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.actionRow}>
        {readiness?.modelsReady ? (
          <PrimaryButton label="继续录入声纹" onPress={onContinue} />
        ) : (
          <PrimaryButton label={busy ? "正在安装" : "下载并安装"} onPress={onDownload} disabled={busy} />
        )}
      </View>
    </View>
  );
}

function SpeakerStep({
  samples,
  validSampleCount,
  recordingPromptId,
  busy,
  error,
  onStart,
  onStop,
  onComplete,
  microphoneReady,
  microphoneBusy,
  onRequestMicrophone,
}: {
  samples: Record<string, RecordedEnrollmentSample>;
  validSampleCount: number;
  recordingPromptId: string | null;
  busy: boolean;
  error: string | null;
  onStart: (promptId: string) => void;
  onStop: () => void;
  onComplete: () => void;
  microphoneReady: boolean;
  microphoneBusy: boolean;
  onRequestMicrophone: () => void;
}) {
  return (
    <View style={styles.section}>
      {!microphoneReady ? (
        <View style={styles.permissionGate}>
          <View>
            <Text style={styles.statusLabel}>麦克风权限</Text>
            <Text style={styles.statusMeta}>声纹录入需要先启用麦克风</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onRequestMicrophone}
            disabled={microphoneBusy}
            style={styles.smallButton}
          >
            <Text style={styles.smallButtonText}>{microphoneBusy ? "处理中" : "启用麦克风"}</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={styles.sectionHint}>至少完成 3 段，推荐 4-5 段。</Text>
      <View style={styles.promptList}>
        {enrollmentPrompts.map((prompt, index) => {
          const sample = samples[prompt.id];
          const recording = recordingPromptId === prompt.id;
          return (
            <View key={prompt.id} style={styles.promptItem}>
              <View style={styles.promptCopy}>
                <Text style={styles.promptTitle}>
                  {index + 1}. {prompt.title}
                </Text>
                <Text style={styles.promptPhrase}>{prompt.phrase}</Text>
                <Text style={styles.promptHelper}>{prompt.helper}</Text>
                {sample ? <Text style={sample.quality.ok ? styles.qualityOk : styles.qualityBad}>{formatQuality(sample.quality)}</Text> : null}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={recording ? onStop : () => onStart(prompt.id)}
                disabled={!microphoneReady || Boolean(recordingPromptId && !recording) || busy}
                style={[styles.smallButton, recording && styles.smallButtonActive]}
              >
                <Text style={styles.smallButtonText}>{recording ? "停止" : sample ? "重录" : "开始"}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.actionRow}>
        <PrimaryButton
          label={busy ? "正在注册" : `完成注册 (${validSampleCount}/3)`}
          onPress={onComplete}
          disabled={!microphoneReady || busy || validSampleCount < minEnrollmentSamples || Boolean(recordingPromptId)}
        />
      </View>
    </View>
  );
}

function PermissionsStep({
  readiness,
  busyKey,
  error,
  onRequestMicrophone,
  onRequestCamera,
  onRequestCalendar,
  onSkip,
  onContinue,
}: {
  readiness: SetupReadiness | null;
  busyKey: string | null;
  error: string | null;
  onRequestMicrophone: () => void;
  onRequestCamera: () => void;
  onRequestCalendar: () => void;
  onSkip: (capability: OptionalSetupCapability) => void;
  onContinue: () => void;
}) {
  const optionalReady =
    Boolean(readiness?.cameraReady || readiness?.skipped.camera) &&
    Boolean(readiness?.calendarReady || readiness?.skipped.calendar) &&
    Boolean(readiness?.robotReady || readiness?.skipped.robot);
  const canContinue = Boolean(readiness?.microphoneReady && optionalReady);
  return (
    <View style={styles.section}>
      <PermissionRow
        title="麦克风"
        required
        ready={Boolean(readiness?.microphoneReady)}
        busy={busyKey === "microphone"}
        actionLabel="启用"
        onAction={onRequestMicrophone}
      />
      <PermissionRow
        title="相机"
        ready={Boolean(readiness?.cameraReady)}
        skipped={Boolean(readiness?.skipped.camera)}
        busy={busyKey === "camera"}
        actionLabel="启用"
        onAction={onRequestCamera}
        onSkip={() => onSkip("camera")}
      />
      <PermissionRow
        title="日历"
        ready={Boolean(readiness?.calendarReady)}
        skipped={Boolean(readiness?.skipped.calendar)}
        busy={busyKey === "calendar"}
        actionLabel="启用"
        onAction={onRequestCalendar}
        onSkip={() => onSkip("calendar")}
      />
      <PermissionRow
        title="LOOI 机器人"
        ready={Boolean(readiness?.robotReady)}
        skipped={Boolean(readiness?.skipped.robot)}
        actionLabel="稍后连接"
        onAction={() => onSkip("robot")}
        onSkip={() => onSkip("robot")}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.actionRow}>
        <PrimaryButton label="继续" onPress={onContinue} disabled={!canContinue} />
      </View>
    </View>
  );
}

function PermissionRow({
  title,
  ready,
  required,
  skipped,
  busy,
  actionLabel,
  onAction,
  onSkip,
}: {
  title: string;
  ready: boolean;
  required?: boolean;
  skipped?: boolean;
  busy?: boolean;
  actionLabel: string;
  onAction: () => void;
  onSkip?: () => void;
}) {
  return (
    <View style={styles.statusRow}>
      <View>
        <Text style={styles.statusLabel}>{title}</Text>
        <Text style={styles.statusMeta}>{required ? "必需能力" : skipped ? "已跳过" : "可选能力"}</Text>
      </View>
      {ready || skipped ? (
        <StatusBadge ready={ready} readyText={ready ? "已启用" : "已跳过"} pendingText="待处理" />
      ) : (
        <View style={styles.permissionActions}>
          <Pressable accessibilityRole="button" onPress={onAction} disabled={busy} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>{busy ? "处理中" : actionLabel}</Text>
          </Pressable>
          {onSkip ? (
            <Pressable accessibilityRole="button" onPress={onSkip} disabled={busy} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>跳过</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

function DoneStep({
  readiness,
  canFinish,
  onFinish,
}: {
  readiness: SetupReadiness | null;
  canFinish: boolean;
  onFinish: () => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.grid}>
        <SummaryRow label="模型" value={readiness?.modelsReady ? "已就绪" : "待处理"} ok={Boolean(readiness?.modelsReady)} />
        <SummaryRow label="主人声纹" value={`已录入 ${readiness?.speakerSampleCount ?? 0} 段`} ok={Boolean(readiness?.speakerEnrolled)} />
        <SummaryRow label="麦克风" value={readiness?.microphoneReady ? "已启用" : "待授权"} ok={Boolean(readiness?.microphoneReady)} />
        <SummaryRow label="相机" value={readiness?.cameraReady ? "已启用" : readiness?.skipped.camera ? "已跳过" : "待处理"} ok={Boolean(readiness?.cameraReady || readiness?.skipped.camera)} />
        <SummaryRow label="日历" value={readiness?.calendarReady ? "已启用" : readiness?.skipped.calendar ? "已跳过" : "待处理"} ok={Boolean(readiness?.calendarReady || readiness?.skipped.calendar)} />
        <SummaryRow label="机器人" value={readiness?.robotReady ? "已连接" : readiness?.skipped.robot ? "已跳过" : "待处理"} ok={Boolean(readiness?.robotReady || readiness?.skipped.robot)} />
      </View>
      <View style={styles.actionRow}>
        <PrimaryButton label="进入 LOOI" onPress={onFinish} disabled={!canFinish} />
      </View>
    </View>
  );
}

function SummaryRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={ok ? styles.qualityOk : styles.qualityBad}>{value}</Text>
    </View>
  );
}

function StatusBadge({
  ready,
  readyText,
  pendingText,
}: {
  ready: boolean;
  readyText: string;
  pendingText: string;
}) {
  return (
    <View style={[styles.badge, ready ? styles.badgeReady : styles.badgePending]}>
      <Text style={[styles.badgeText, ready ? styles.badgeTextReady : styles.badgeTextPending]}>
        {ready ? readyText : pendingText}
      </Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryButton, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function normalizeSetupStep(step?: string | string[]): SetupStep {
  const value = Array.isArray(step) ? step[0] : step;
  if (value === "models" || value === "speaker" || value === "permissions" || value === "done") {
    return value;
  }
  return "models";
}

function getStepTitle(step: SetupStep): string {
  switch (step) {
    case "models":
      return "本地语音能力准备";
    case "speaker":
      return "录入主人声纹";
    case "permissions":
      return "权限与设备能力";
    case "done":
      return "初始化完成";
  }
}

function isStepComplete(step: SetupStep, readiness: SetupReadiness | null): boolean {
  if (!readiness) return false;
  switch (step) {
    case "models":
      return readiness.modelsReady;
    case "speaker":
      return readiness.speakerEnrolled;
    case "permissions":
      return readiness.microphoneReady &&
        (readiness.cameraReady || readiness.skipped.camera) &&
        (readiness.calendarReady || readiness.skipped.calendar) &&
        (readiness.robotReady || readiness.skipped.robot);
    case "done":
      return readiness.requiredReady && readiness.onboardingCompleted;
  }
}

function assessEnrollmentSampleQuality(samples: number[]): EnrollmentSampleQuality {
  const durationMs = Math.round((samples.length / sampleRate) * 1000);
  const energyMean = samples.length
    ? samples.reduce((sum, sample) => sum + Math.abs(sample), 0) / samples.length
    : 0;

  if (durationMs < 1800) {
    return { ok: false, durationMs, energyMean, reason: "too-short" };
  }
  if (energyMean < 0.008) {
    return { ok: false, durationMs, energyMean, reason: "too-quiet" };
  }
  return { ok: true, durationMs, energyMean };
}

function getQualityMessage(quality: EnrollmentSampleQuality): string {
  if (quality.reason === "too-short") return "这段太短，请录满约 2 秒。";
  if (quality.reason === "too-quiet") return "这段声音太轻，请靠近一点重录。";
  return "这段录音质量不足，请重录。";
}

function formatQuality(quality: EnrollmentSampleQuality): string {
  const duration = `${(quality.durationMs / 1000).toFixed(1)}s`;
  if (quality.ok) return `有效样本 ${duration}`;
  return `${getQualityMessage(quality)} (${duration})`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: looiTheme.bg,
  },
  frame: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 8,
  },
  topBar: {
    height: 42,
    flexDirection: "row",
    gap: 8,
  },
  topStep: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: looiTheme.line,
    backgroundColor: "rgba(7, 17, 29, 0.72)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8,
  },
  topStepActive: {
    borderColor: looiTheme.lineActive,
    backgroundColor: "rgba(40, 213, 255, 0.1)",
  },
  topStepComplete: {
    backgroundColor: "rgba(77, 231, 180, 0.07)",
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: looiTheme.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(237, 247, 255, 0.05)",
  },
  stepNumberComplete: {
    borderColor: "rgba(77, 231, 180, 0.65)",
    backgroundColor: "rgba(77, 231, 180, 0.14)",
  },
  stepNumberText: {
    color: looiTheme.text,
    fontSize: 12,
    fontWeight: "900",
  },
  topStepCopy: {
    flex: 1,
    minWidth: 0,
  },
  topStepLabel: {
    color: looiTheme.text,
    fontSize: 13,
    fontWeight: "900",
  },
  topStepLabelActive: {
    color: looiTheme.cyan,
  },
  main: {
    flex: 1,
    borderWidth: 1,
    borderColor: looiTheme.line,
    borderRadius: 24,
    backgroundColor: looiTheme.bgRaised,
    overflow: "hidden",
  },
  stageHeader: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    marginBottom: 14,
  },
  stageTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: looiTheme.cyan,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 3,
  },
  title: {
    color: looiTheme.text,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "800",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  section: {
    gap: 16,
  },
  sectionHint: {
    color: looiTheme.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusRow: {
    flexGrow: 1,
    flexBasis: 260,
    minHeight: 64,
    borderWidth: 1,
    borderColor: looiTheme.line,
    borderRadius: 16,
    backgroundColor: looiTheme.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  permissionGate: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: "rgba(255, 209, 102, 0.45)",
    borderRadius: 16,
    backgroundColor: "rgba(255, 209, 102, 0.08)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statusLabel: {
    color: looiTheme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  statusMeta: {
    color: looiTheme.muted,
    fontSize: 12,
    marginTop: 4,
  },
  mutedText: {
    color: looiTheme.muted,
    fontSize: 14,
  },
  badge: {
    minWidth: 74,
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  badgeReady: {
    borderColor: "rgba(77, 231, 180, 0.45)",
    backgroundColor: "rgba(77, 231, 180, 0.08)",
  },
  badgePending: {
    borderColor: "rgba(255, 209, 102, 0.38)",
    backgroundColor: "rgba(255, 209, 102, 0.08)",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  badgeTextReady: {
    color: looiTheme.ok,
  },
  badgeTextPending: {
    color: looiTheme.warn,
  },
  progressBlock: {
    gap: 8,
  },
  progressLabel: {
    color: looiTheme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: looiTheme.whiteSoft,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: looiTheme.cyan,
  },
  promptList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  promptItem: {
    flexGrow: 1,
    flexBasis: 320,
    minHeight: 118,
    borderWidth: 1,
    borderColor: looiTheme.line,
    borderRadius: 16,
    backgroundColor: looiTheme.surface,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  promptCopy: {
    flex: 1,
    gap: 5,
  },
  promptTitle: {
    color: looiTheme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  promptPhrase: {
    color: looiTheme.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  promptHelper: {
    color: looiTheme.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  qualityOk: {
    color: looiTheme.ok,
    fontSize: 12,
    fontWeight: "700",
  },
  qualityBad: {
    color: looiTheme.warn,
    fontSize: 12,
    fontWeight: "700",
  },
  permissionActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  smallButton: {
    minWidth: 72,
    minHeight: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: looiTheme.lineActive,
    backgroundColor: "rgba(40, 213, 255, 0.1)",
    paddingHorizontal: 12,
  },
  smallButtonActive: {
    borderColor: "rgba(255, 92, 122, 0.7)",
    backgroundColor: "rgba(255, 92, 122, 0.1)",
  },
  smallButtonText: {
    color: looiTheme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryButton: {
    minWidth: 66,
    minHeight: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: looiTheme.line,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: looiTheme.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  actionRow: {
    alignItems: "flex-start",
    paddingTop: 2,
  },
  primaryButton: {
    minWidth: 180,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: looiTheme.cyan,
    paddingHorizontal: 18,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: "#00131d",
    fontSize: 15,
    fontWeight: "900",
  },
  errorText: {
    color: looiTheme.danger,
    fontSize: 13,
    lineHeight: 18,
  },
});
