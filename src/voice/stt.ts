import { Audio } from "expo-av";
import { sherpaVoiceAdapter } from "./sherpa-adapter";

/**
 * STT Service — Speech-to-Text
 * Phase 1 target: device-side sherpa-onnx SenseVoice ASR.
 */
export class STTService {
  private recording: Audio.Recording | null = null;
  private isRecording = false;

  /**
   * Start recording audio
   */
  async startRecording(): Promise<void> {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      this.recording = recording;
      this.isRecording = true;
    } catch (error) {
      console.error("[STT] Failed to start recording:", error);
      throw error;
    }
  }

  /**
   * Stop recording and transcribe
   */
  async stopAndTranscribe(): Promise<string> {
    const uri = await this.stopRecording();
    return await this.transcribeFile(uri);
  }

  /**
   * Stop recording and return the local audio file URI without transcribing it.
   */
  async stopRecording(): Promise<string> {
    if (!this.recording) {
      throw new Error("No active recording");
    }

    try {
      await this.recording.stopAndUnloadAsync();
      this.isRecording = false;

      const uri = this.recording.getURI();
      this.recording = null;

      if (!uri) {
        throw new Error("No recording URI");
      }

      return uri;
    } catch (error) {
      this.isRecording = false;
      this.recording = null;
      console.error("[STT] Failed to stop recording:", error);
      throw error;
    }
  }

  /**
   * Cancel current recording without transcribing
   */
  async cancel(): Promise<void> {
    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch {
        // Ignore
      }
      this.recording = null;
      this.isRecording = false;
    }
  }

  get recording_active(): boolean {
    return this.isRecording;
  }

  /**
   * Transcribe the recorded audio file on device with sherpa-onnx.
   */
  async transcribeFile(audioUri: string): Promise<string> {
    return sherpaVoiceAdapter.transcribeFile(audioUri);
  }
}

export const sttService = new STTService();
