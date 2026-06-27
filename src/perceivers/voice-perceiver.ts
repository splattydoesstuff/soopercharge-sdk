import { BasePerceiver } from "../core/perceiver";
import { createObservation } from "../core/observation";
import { classifyCategory, hasVisualReference } from "../memory/metadata";
import { wakewordService } from "../voice/wakeword";
import { kwsAudioFeeder } from "../voice/kws-audio-feeder";
import { speakerIdService } from "../voice/speaker-id";
import { sttService } from "../voice/stt";
import { ttsService } from "../voice/tts";
import { useUserStore } from "../store/user";
import { useConversationStore } from "../store/conversation";
import { llmService, memoryService, observeService } from "../server-api/client";
import { getRuntimeProfile } from "../core/runtime-profile";
import { cameraPerceiver } from "./camera-perceiver";

const RECORDING_START_TIMEOUT_MS = 5000;

/**
 * VoicePerceiver — orchestrates the voice pipeline:
 * Wakeword → Speaker Verification → STT → Observation
 *
 * Also handles the response side: LLM → TTS
 */
export class VoicePerceiver extends BasePerceiver {
  name = "voice";
  private unsubWakeword: (() => void) | null = null;
  private unsubPreferences: (() => void) | null = null;
  private startRecordingPromise: Promise<void> | null = null;
  private isFinishingListening = false;
  private cancelRecordingAfterStart = false;
  private allowsWakewordAutostart = true;

  async start(): Promise<void> {
    if (this.isActive) return;

    this.isActive = true;
    this.allowsWakewordAutostart = getRuntimeProfile().allowsWakewordAutostart;

    this.unsubWakeword = wakewordService.onWakeword(() => {
      this.handleWakeword();
    });

    this.unsubPreferences = useUserStore.subscribe((state, previousState) => {
      if (state.preferences.wakeWordEnabled === previousState.preferences.wakeWordEnabled) {
        return;
      }

      this.syncWakewordFeeder();
    });

    if (this.shouldRunWakewordFeeder()) {
      await this.startWakewordFeeder();
    }
  }

  async stop(): Promise<void> {
    this.isActive = false;
    await kwsAudioFeeder.stop();
    await wakewordService.stop();
    if (this.unsubWakeword) {
      this.unsubWakeword();
      this.unsubWakeword = null;
    }
    if (this.unsubPreferences) {
      this.unsubPreferences();
      this.unsubPreferences = null;
    }
  }

  /**
   * Manually trigger the voice pipeline (for button-press mode)
   */
  trigger(): void {
    this.handleWakeword();
  }

  /**
   * Handle wakeword detection
   */
  private async handleWakeword(): Promise<void> {
    const userStore = useUserStore.getState();
    const conversationStore = useConversationStore.getState();

    if (
      conversationStore.isListening ||
      conversationStore.isProcessing ||
      userStore.voiceState !== "sleeping" ||
      this.startRecordingPromise ||
      this.isFinishingListening
    ) {
      console.log("[VoicePerceiver] Ignored trigger", {
        isListening: conversationStore.isListening,
        isProcessing: conversationStore.isProcessing,
        voiceState: userStore.voiceState,
        hasStartRecordingPromise: Boolean(this.startRecordingPromise),
        isFinishingListening: this.isFinishingListening,
      });
      return;
    }

    console.log("[VoicePerceiver] Listening started");
    // Step 1: Start listening. Owner verification runs against this same audio file
    // before transcription, so accepted commands still require speaker verification.
    userStore.setVoiceState("listening");
    conversationStore.setListening(true);

    const startRecordingPromise = this.startRecordingForListening();
    this.startRecordingPromise = startRecordingPromise;

    try {
      await startRecordingPromise;
    } finally {
      if (this.startRecordingPromise === startRecordingPromise) {
        this.startRecordingPromise = null;
        if (!sttService.recording_active) {
          await this.restartWakewordFeederIfNeeded();
        }
      }
    }
  }

  /**
   * Stop listening and process the speech
   * Called by UI when user releases the button or VAD detects silence
   */
  async finishListening(): Promise<void> {
    let userStore = useUserStore.getState();
    let conversationStore = useConversationStore.getState();

    if (this.isFinishingListening) {
      console.log("[VoicePerceiver] Ignored finish: already finishing");
      return;
    }

    this.isFinishingListening = true;
    const hadListeningRequest =
      conversationStore.isListening ||
      userStore.voiceState === "listening" ||
      Boolean(this.startRecordingPromise) ||
      sttService.recording_active;

    console.log("[VoicePerceiver] Finish requested", {
      hadListeningRequest,
      isListening: conversationStore.isListening,
      voiceState: userStore.voiceState,
      recordingActive: sttService.recording_active,
      hasStartRecordingPromise: Boolean(this.startRecordingPromise),
    });

    conversationStore.setListening(false);
    if (hadListeningRequest) {
      userStore.setVoiceState("processing");
      conversationStore.setProcessing(true);
    }

    try {
      if (!sttService.recording_active && this.startRecordingPromise) {
        const recordingStarted = await this.waitForRecordingStart(this.startRecordingPromise);
        if (!recordingStarted) {
          this.cancelRecordingAfterStart = true;
          console.warn("[VoicePerceiver] Recording start timed out; cancelling when ready");
          return;
        }
      }

      userStore = useUserStore.getState();
      conversationStore = useConversationStore.getState();

      if (!sttService.recording_active) {
        console.log("[VoicePerceiver] Finish stopped: no active recording");
        if (userStore.voiceState === "listening") {
          userStore.setVoiceState("sleeping");
        }
        return;
      }

      userStore.setVoiceState("processing");
      conversationStore.setProcessing(true);

      // Step 2: Stop recording and verify owner before accepting the command.
      const audioUri = await sttService.stopRecording();
      console.log("[VoicePerceiver] Recording stopped", { audioUri });

      userStore.setVoiceState("verifying");
      const isOwner = await speakerIdService.verifyFile(audioUri);
      console.log("[VoicePerceiver] Speaker verification finished", { isOwner });
      if (!isOwner) {
        conversationStore.addMessage({
          role: "assistant",
          content: "还没有通过声纹验证。请先在设置里录入主人声纹，或重新录一段更清晰的语音。",
        });
        return;
      }

      // Step 3: Transcribe the same verified audio.
      userStore.setVoiceState("processing");
      const transcript = await sttService.transcribeFile(audioUri);
      console.log("[VoicePerceiver] STT finished", { transcript });
      if (!transcript.trim()) {
        conversationStore.addMessage({
          role: "assistant",
          content: "我没有听清刚才的话，请靠近一点再说一次。",
        });
        userStore.setVoiceState("sleeping");
        conversationStore.setProcessing(false);
        return;
      }

      conversationStore.setCurrentTranscript(transcript);
      conversationStore.addMessage({ role: "user", content: transcript });

      // Step 4: Emit observation
      const category = classifyCategory(transcript);
      const observation = createObservation(transcript, "voice", category);
      this.emit(observation);

      // Step 5: Process with LLM
      console.log("[VoicePerceiver] Classifying intent", { transcript });
      const intent = await llmService.classifyIntent(transcript);
      console.log("[VoicePerceiver] Intent classified", { intent });
      let response: string;
      let evidenceUri: string | undefined;

      if (intent === "store" && hasVisualReference(transcript) && cameraPerceiver.hasFrame) {
        const latestFrame = cameraPerceiver.getLatestFrame();
        if (!latestFrame) {
          throw new Error("Camera frame disappeared before voice+visual processing");
        }

        const jointObservation = createObservation(transcript, "voice+camera", "placement");
        const result = await observeService.voiceVisual(
          transcript,
          latestFrame,
          jointObservation.metadata
        );

        response = result.response;
        evidenceUri = result.evidenceUri;
        console.log("[VoicePerceiver] Voice+visual observation processed", { evidenceUri });
        this.emit({
          ...jointObservation,
          content: result.description,
          evidenceUri: result.evidenceUri,
          metadata: {
            ...jointObservation.metadata,
            evidenceUri: result.evidenceUri,
          },
        });
      } else if (intent === "store") {
        await memoryService.remember(
          [{ role: "user", content: transcript }],
          observation.metadata
        );
        console.log("[VoicePerceiver] Memory stored");
        response = await llmService.generateResponse(intent, {
          facts: [],
          transcript,
        });
      } else if (intent === "search") {
        const facts = await memoryService.search(transcript);
        console.log("[VoicePerceiver] Memory searched", { facts: facts.length });
        response = await llmService.generateResponse(intent, { facts, transcript });
        evidenceUri = facts.find((fact) => fact.metadata?.evidenceUri)?.metadata?.evidenceUri;
      } else {
        response = await llmService.generateResponse(intent, {
          facts: [],
          transcript,
        });
      }

      // Step 6: Add assistant response
      console.log("[VoicePerceiver] Assistant response generated", { response });
      conversationStore.addMessage({ role: "assistant", content: response, evidenceUri });

      // Step 7: TTS playback
      userStore.setVoiceState("speaking");
      conversationStore.setSpeaking(true);

      if (userStore.preferences.ttsEnabled) {
        await ttsService.speak({ text: response });
      }
    } catch (error) {
      if (error instanceof Error && error.message === "No active recording") {
        return;
      }

      console.warn("[VoicePerceiver] Processing stopped:", error);
      conversationStore.addMessage({
        role: "assistant",
        content: "抱歉，处理时出了点问题，请再试一次。",
      });
    } finally {
      userStore.setVoiceState("sleeping");
      conversationStore.setProcessing(false);
      conversationStore.setSpeaking(false);
      this.isFinishingListening = false;
      await sttService.resumeWakewordFeederIfPaused();
      await this.restartWakewordFeederIfNeeded();
    }
  }

  private async startRecordingForListening(): Promise<void> {
    const userStore = useUserStore.getState();
    const conversationStore = useConversationStore.getState();

    try {
      await kwsAudioFeeder.stop();
      await sttService.startRecording();
      if (this.cancelRecordingAfterStart) {
        await sttService.cancel();
      }
    } catch (error) {
      console.error("[VoicePerceiver] Failed to start recording:", error);
      userStore.setVoiceState("sleeping");
      conversationStore.setListening(false);
      await this.restartWakewordFeederIfNeeded();
    } finally {
      this.cancelRecordingAfterStart = false;
    }
  }

  private async waitForRecordingStart(startRecordingPromise: Promise<void>): Promise<boolean> {
    return Promise.race([
      startRecordingPromise.then(() => true),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), RECORDING_START_TIMEOUT_MS);
      }),
    ]);
  }

  private async startWakewordFeeder(): Promise<void> {
    try {
      await wakewordService.start();
      await kwsAudioFeeder.start();
    } catch (error) {
      console.warn("[VoicePerceiver] Wakeword audio feeder unavailable:", error);
    }
  }

  private async restartWakewordFeederIfNeeded(): Promise<void> {
    if (!this.shouldRunWakewordFeeder()) {
      return;
    }

    await this.startWakewordFeeder();
  }

  private shouldRunWakewordFeeder(): boolean {
    const userStore = useUserStore.getState();
    const conversationStore = useConversationStore.getState();

    return (
      this.isActive &&
      this.allowsWakewordAutostart &&
      userStore.preferences.wakeWordEnabled &&
      userStore.voiceState === "sleeping" &&
      !conversationStore.isListening &&
      !conversationStore.isProcessing &&
      !this.startRecordingPromise &&
      !this.isFinishingListening
    );
  }

  private syncWakewordFeeder(): void {
    if (this.shouldRunWakewordFeeder()) {
      this.startWakewordFeeder();
    } else {
      kwsAudioFeeder.stop().catch((error) => {
        console.warn("[VoicePerceiver] Failed to stop wakeword audio feeder:", error);
      });
    }
  }
}

export const voicePerceiver = new VoicePerceiver();
