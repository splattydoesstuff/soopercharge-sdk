import { BasePerceiver } from "../core/perceiver";
import { getRuntimeProfile } from "../core/runtime-profile";
import { useUserStore } from "../store/user";
import { getVoiceModule } from "../voice/lazy-services";

/**
 * Lightweight voice runtime facade. It keeps cold start free of Sherpa,
 * AudioStudio, and expo-audio until voice is explicitly needed.
 */
export class VoiceRuntime extends BasePerceiver {
  name = "voice";
  private loaded = false;
  private unsubscribeVoice: (() => void) | null = null;

  async start(): Promise<void> {
    if (this.isActive) return;
    this.isActive = true;

    const prefs = useUserStore.getState().preferences;
    if (!getRuntimeProfile().allowsWakewordAutostart || !prefs.wakeWordEnabled) {
      return;
    }

    await this.ensureLoaded();
    const { voicePerceiver } = await getVoiceModule();
    await voicePerceiver.start();
  }

  async stop(): Promise<void> {
    this.isActive = false;
    if (!this.loaded) return;

    const { voicePerceiver } = await getVoiceModule();
    await voicePerceiver.stop();
  }

  async trigger(): Promise<void> {
    await this.ensureLoaded();
    const { voicePerceiver } = await getVoiceModule();
    await voicePerceiver.start();
    voicePerceiver.trigger();
  }

  async finishListening(): Promise<void> {
    if (!this.loaded) return;

    const { voicePerceiver } = await getVoiceModule();
    await voicePerceiver.finishListening();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const { voicePerceiver } = await getVoiceModule();
    this.unsubscribeVoice = voicePerceiver.onObservation((observation) => {
      this.emit(observation);
    });
  }
}

export const voiceRuntime = new VoiceRuntime();
