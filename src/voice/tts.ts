import { createAudioPlayer, type AudioPlayer } from "expo-audio";

const MINIMAX_TTS_URL = "https://api.minimax.chat/v1/t2a_v2";

interface TTSOptions {
  text: string;
  voiceId?: string;
  speed?: number;
}

/**
 * MiniMax TTS — stream synthesis and playback
 */
export class TTSService {
  private apiKey: string;
  private groupId: string;
  private player: AudioPlayer | null = null;
  private isPlaying = false;

  constructor() {
    this.apiKey = process.env.EXPO_PUBLIC_MINIMAX_API_KEY || "";
    this.groupId = process.env.EXPO_PUBLIC_MINIMAX_GROUP_ID || "";
  }

  /**
   * Synthesize text to speech and play it
   */
  async speak(options: TTSOptions): Promise<void> {
    const { text, voiceId = "male-qn-qingse", speed = 1.0 } = options;

    if (!text.trim()) return;

    // Stop any currently playing audio
    await this.stop();

    try {
      const response = await fetch(
        MINIMAX_TTS_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: "speech-02-hd",
            text,
            stream: false,
            voice_setting: {
              voice_id: voiceId,
              speed,
              vol: 1.0,
              pitch: 0,
            },
            audio_setting: {
              sample_rate: 32000,
              bitrate: 128000,
              format: "mp3",
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.base_resp?.status_code !== 0) {
        throw new Error(`TTS error: ${data.base_resp?.status_msg || "unknown"}`);
      }

      // data.data.audio is hex-encoded MP3 audio
      const audioHex = data.data?.audio;
      if (!audioHex) {
        throw new Error("No audio data in TTS response");
      }

      // Convert hex to base64 for audio URI
      const hexToBase64 = (hex: string): string => {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        // In React Native, we can use btoa or a polyfill
        const binary = String.fromCharCode(...bytes);
        return btoa(binary);
      };

      const audioBase64 = hexToBase64(audioHex);

      // Create audio from base64
      const audioUri = `data:audio/mp3;base64,${audioBase64}`;
      const player = createAudioPlayer({ uri: audioUri }, { updateInterval: 250 });

      this.player = player;
      this.isPlaying = true;
      player.play();

      // Wait for playback to finish
      return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (!player.playing && player.currentStatus.didJustFinish) {
            clearInterval(interval);
            this.isPlaying = false;
            this.cleanup();
            resolve();
          }
        }, 250);
      });
    } catch (error) {
      this.isPlaying = false;
      console.error("[TTS] Error:", error);
      throw error;
    }
  }

  /**
   * Stop current playback
   */
  async stop(): Promise<void> {
    if (this.player) {
      try {
        this.player.pause();
      } catch {
        // Already stopped
      }
      this.cleanup();
    }
    this.isPlaying = false;
  }

  /**
   * Check if currently speaking
   */
  get speaking(): boolean {
    return this.isPlaying;
  }

  private async cleanup(): Promise<void> {
    if (this.player) {
      try {
        this.player.remove();
      } catch {
        // Ignore cleanup errors
      }
      this.player = null;
    }
  }
}

export const ttsService = new TTSService();
