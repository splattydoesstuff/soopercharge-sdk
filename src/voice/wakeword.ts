import { sherpaVoiceAdapter } from "./sherpa-adapter";

export type WakewordState = "idle" | "listening" | "detected" | "unavailable";

type WakewordCallback = () => void;

export class WakewordService {
  private listeners: WakewordCallback[] = [];
  private listening = false;
  private _state: WakewordState = "idle";

  async start(): Promise<void> {
    if (this.listening) return;

    try {
      await sherpaVoiceAdapter.initializeKws();
      this.listening = true;
      this._state = "listening";
    } catch (error) {
      this._state = "unavailable";
      console.warn("[Wakeword] Native KWS unavailable:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.listening = false;
    this._state = "idle";
  }

  async acceptSamples(samples: number[], sampleRate = 16000): Promise<void> {
    if (!this.listening) return;

    const result = await sherpaVoiceAdapter.acceptKwsSamples(samples, sampleRate);
    if (result.detected) {
      this.notifyDetected();
    }
  }

  trigger(): void {
    this.notifyDetected();
  }

  onWakeword(callback: WakewordCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== callback);
    };
  }

  private notifyDetected(): void {
    this._state = "detected";
    for (const listener of this.listeners) {
      listener();
    }
    this._state = this.listening ? "listening" : "idle";
  }

  get state(): WakewordState {
    return this._state;
  }
}

export const wakewordService = new WakewordService();
