import { AudioStudioModule, type RecordingConfig } from "@siteed/audio-studio";
import { wakewordService } from "./wakeword";

type EventSubscription = {
  remove: () => void;
};

type AudioDataPayload = {
  deltaSize?: number;
  pcmFloat32?: Float32Array | number[];
  buffer?: Float32Array;
};

const KWS_SAMPLE_RATE = 16000;
const MAX_QUEUED_SAMPLES = KWS_SAMPLE_RATE * 3;

const recordingConfig: RecordingConfig = {
  sampleRate: KWS_SAMPLE_RATE,
  channels: 1,
  encoding: "pcm_32bit",
  interval: 100,
  streamFormat: "float32",
  keepAwake: false,
  output: {
    primary: { enabled: false },
  },
  ios: {
    audioSession: {
      category: "Record",
      mode: "Measurement",
    },
  },
  android: {
    audioFocusStrategy: "interactive",
  },
};

export class KwsAudioFeeder {
  private desiredRunning = false;
  private started = false;
  private listener: EventSubscription | null = null;
  private accepting = false;
  private queuedSamples: number[] | null = null;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private warnedMissingFloatPayload = false;

  async start(): Promise<void> {
    this.desiredRunning = true;
    if (this.stopPromise) {
      await this.stopPromise;
    }
    if (this.started) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.startInternal();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async stop(): Promise<void> {
    this.desiredRunning = false;
    if (this.startPromise) {
      await this.startPromise.catch(() => undefined);
    }
    if (!this.started) return;
    if (this.stopPromise) return this.stopPromise;

    this.stopPromise = this.stopInternal();

    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = null;
    }
  }

  get isRunning(): boolean {
    return this.started;
  }

  private async startInternal(): Promise<void> {
    try {
      if (!this.desiredRunning) return;

      const permissions = await AudioStudioModule.requestPermissionsAsync?.();
      if (permissions && !permissions.granted) {
        throw new Error("Microphone permission not granted");
      }
      if (!this.desiredRunning) return;

      this.listener = AudioStudioModule.addListener(
        "AudioData",
        (event: AudioDataPayload) => {
          this.handleAudioEvent(event);
        }
      );

      await AudioStudioModule.prepareRecording(recordingConfig);
      if (!this.desiredRunning) {
        this.listener?.remove();
        this.listener = null;
        return;
      }

      await AudioStudioModule.startRecording(recordingConfig);
      this.started = true;

      if (!this.desiredRunning) {
        await this.stopInternal();
      }
    } catch (error) {
      this.listener?.remove();
      this.listener = null;
      this.started = false;
      console.warn("[KWS AudioFeeder] Failed to start:", error);
      throw error;
    }
  }

  private async stopInternal(): Promise<void> {
    this.started = false;
    this.queuedSamples = null;

    this.listener?.remove();
    this.listener = null;

    try {
      await AudioStudioModule.stopRecording();
    } catch (error) {
      console.warn("[KWS AudioFeeder] Failed to stop:", error);
    }
  }

  private handleAudioEvent(event: AudioDataPayload): void {
    if (!this.started || event.deltaSize === 0) return;

    const audioData = event.pcmFloat32 ?? event.buffer;
    if (audioData == null) {
      if (!this.warnedMissingFloatPayload) {
        this.warnedMissingFloatPayload = true;
        console.warn("[KWS AudioFeeder] AudioData event did not include float PCM payload");
      }
      return;
    }

    const samples = Array.isArray(audioData) ? audioData : Array.from(audioData);
    this.enqueueSamples(samples);
  }

  private enqueueSamples(samples: number[]): void {
    this.queuedSamples = this.queuedSamples ? this.queuedSamples.concat(samples) : samples;
    if (this.queuedSamples.length > MAX_QUEUED_SAMPLES) {
      this.queuedSamples = this.queuedSamples.slice(-MAX_QUEUED_SAMPLES);
    }

    if (!this.accepting) {
      this.drainSamples();
    }
  }

  private async drainSamples(): Promise<void> {
    this.accepting = true;

    try {
      while (this.started && this.queuedSamples) {
        const samples = this.queuedSamples;
        this.queuedSamples = null;
        await wakewordService.acceptSamples(samples, KWS_SAMPLE_RATE);
      }
    } catch (error) {
      console.warn("[KWS AudioFeeder] Failed to feed samples:", error);
    } finally {
      this.accepting = false;
      if (this.started && this.queuedSamples) {
        this.drainSamples();
      }
    }
  }
}

export const kwsAudioFeeder = new KwsAudioFeeder();
