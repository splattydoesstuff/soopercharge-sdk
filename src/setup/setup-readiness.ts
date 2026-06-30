import { getRecordingPermissionsAsync } from "expo-audio";
import * as Calendar from "expo-calendar/legacy";
import { Camera } from "expo-camera";

import { getLooiRobotRuntimeState } from "@/src/device-tools/looi-robot";
import { getSavedLooiRobot } from "@/src/device-tools/looi-robot-autoconnect";
import { checkAllSherpaModelReadiness, type SherpaModelCheck } from "@/src/voice/sherpa-models";
import { speakerIdService } from "@/src/voice/speaker-id";
import { getSetupStorageState, type SetupSkipState } from "./setup-storage";

export type SetupStep = "models" | "speaker" | "permissions" | "done";

export type SetupModelReadiness = {
  asr: SherpaModelCheck;
  streamingAsr: SherpaModelCheck;
  punctuation: SherpaModelCheck;
  kws: SherpaModelCheck;
  speaker: SherpaModelCheck;
  vad: SherpaModelCheck;
};

export type SetupReadiness = {
  modelsReady: boolean;
  modelStatus: SetupModelReadiness | null;
  speakerEnrolled: boolean;
  speakerSampleCount: number;
  microphoneReady: boolean;
  cameraReady: boolean;
  calendarReady: boolean;
  robotReady: boolean;
  skipped: SetupSkipState;
  onboardingCompleted: boolean;
  requiredReady: boolean;
  nextStep: SetupStep;
};

export function areSherpaModelsReady(status: SetupModelReadiness): boolean {
  return Boolean(
    status.streamingAsr.ready &&
      status.punctuation.ready &&
      status.kws.ready &&
      status.speaker.ready &&
      status.vad.ready
  );
}

export async function computeSetupReadiness(): Promise<SetupReadiness> {
  const storageState = getSetupStorageState();

  const [modelResult, speakerSummary, microphoneReady, cameraReady, calendarReady, robotReady] =
    await Promise.all([
      checkAllSherpaModelReadiness().catch((error) => {
        console.warn("[Setup] Failed to check Sherpa model readiness:", error);
        return null;
      }),
      getSpeakerSummary(),
      getMicrophoneReady(),
      getCameraReady(),
      getCalendarReady(),
      getRobotReady(),
    ]);

  const modelsReady = modelResult ? areSherpaModelsReady(modelResult) : false;
  const speakerEnrolled = speakerSummary.enrolled;
  const speakerSampleCount = speakerSummary.sampleCount;
  const optionalReady =
    (cameraReady || storageState.skipped.camera) &&
    (calendarReady || storageState.skipped.calendar) &&
    (robotReady || storageState.skipped.robot);
  const requiredReady = modelsReady && speakerEnrolled && microphoneReady && optionalReady;

  return {
    modelsReady,
    modelStatus: modelResult,
    speakerEnrolled,
    speakerSampleCount,
    microphoneReady,
    cameraReady,
    calendarReady,
    robotReady,
    skipped: storageState.skipped,
    onboardingCompleted: storageState.onboardingCompleted,
    requiredReady,
    nextStep: getNextSetupStep({
      modelsReady,
      speakerEnrolled,
      microphoneReady,
      optionalReady,
    }),
  };
}

function getNextSetupStep(state: {
  modelsReady: boolean;
  speakerEnrolled: boolean;
  microphoneReady: boolean;
  optionalReady: boolean;
}): SetupStep {
  if (!state.modelsReady) return "models";
  if (!state.speakerEnrolled) return "speaker";
  if (!state.microphoneReady || !state.optionalReady) return "permissions";
  return "done";
}

async function getSpeakerSummary(): Promise<{ enrolled: boolean; sampleCount: number }> {
  const service = speakerIdService as typeof speakerIdService & {
    getEnrollmentSummary?: () => Promise<{ sampleCount?: number; templates?: unknown[] } | null>;
  };

  if (service.getEnrollmentSummary) {
    const summary = await service.getEnrollmentSummary().catch((error) => {
      console.warn("[Setup] Failed to read speaker enrollment summary:", error);
      return null;
    });
    const sampleCount = summary?.sampleCount ?? summary?.templates?.length ?? 0;
    return {
      enrolled: sampleCount > 0,
      sampleCount,
    };
  }

  const enrolled = await speakerIdService.getStoredEnrollmentStatus().catch(() => false);
  return { enrolled, sampleCount: enrolled ? 1 : 0 };
}

async function getMicrophoneReady(): Promise<boolean> {
  try {
    const permission = await getRecordingPermissionsAsync();
    return Boolean(permission.granted);
  } catch (error) {
    console.warn("[Setup] Failed to check microphone permission:", error);
    return false;
  }
}

async function getCameraReady(): Promise<boolean> {
  try {
    const permission = await Camera.getCameraPermissionsAsync();
    return Boolean(permission.granted);
  } catch (error) {
    console.warn("[Setup] Failed to check camera permission:", error);
    return false;
  }
}

async function getCalendarReady(): Promise<boolean> {
  try {
    const permission = await Calendar.getCalendarPermissionsAsync();
    return Boolean(permission.granted);
  } catch (error) {
    console.warn("[Setup] Failed to check calendar permission:", error);
    return false;
  }
}

async function getRobotReady(): Promise<boolean> {
  try {
    const runtimeState = getLooiRobotRuntimeState();
    if (runtimeState.connected) return true;
    return Boolean(await getSavedLooiRobot());
  } catch (error) {
    console.warn("[Setup] Failed to check robot readiness:", error);
    return false;
  }
}
