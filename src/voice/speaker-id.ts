import { sherpaVoiceAdapter } from "./sherpa-adapter";

const OWNER_SPEAKER_NAME = "owner";

export class SpeakerIdService {
  private enrolled = false;
  private readonly verificationThreshold = 0.6;

  async refreshEnrollmentStatus(): Promise<boolean> {
    this.enrolled = await sherpaVoiceAdapter.hasSpeaker(OWNER_SPEAKER_NAME);
    return this.enrolled;
  }

  get isEnrolled(): boolean {
    return this.enrolled;
  }

  async enroll(audioSamples: number[] = []): Promise<void> {
    if (audioSamples.length === 0) {
      throw new Error("Speaker enrollment requires audio samples");
    }

    const embedding = await sherpaVoiceAdapter.computeSpeakerEmbedding(audioSamples);
    await sherpaVoiceAdapter.registerSpeaker(OWNER_SPEAKER_NAME, embedding);
    this.enrolled = true;
  }

  async enrollFromFile(audioUri: string): Promise<void> {
    const embedding = await sherpaVoiceAdapter.computeSpeakerFileEmbedding(audioUri);
    await sherpaVoiceAdapter.registerSpeaker(OWNER_SPEAKER_NAME, embedding);
    this.enrolled = true;
  }

  async verifySamples(audioSamples: number[]): Promise<boolean> {
    if (!this.enrolled) {
      await this.refreshEnrollmentStatus();
    }
    if (!this.enrolled || audioSamples.length === 0) {
      return false;
    }

    const embedding = await sherpaVoiceAdapter.computeSpeakerEmbedding(audioSamples);
    return sherpaVoiceAdapter.verifySpeaker(
      OWNER_SPEAKER_NAME,
      embedding,
      this.verificationThreshold
    );
  }

  async verifyFile(audioUri: string): Promise<boolean> {
    if (!this.enrolled) {
      await this.refreshEnrollmentStatus();
    }
    if (!this.enrolled) {
      return false;
    }

    const embedding = await sherpaVoiceAdapter.computeSpeakerFileEmbedding(audioUri);
    return sherpaVoiceAdapter.verifySpeaker(
      OWNER_SPEAKER_NAME,
      embedding,
      this.verificationThreshold
    );
  }

  async verify(): Promise<boolean> {
    return this.verifySamples([]);
  }

  get threshold(): number {
    return this.verificationThreshold;
  }
}

export const speakerIdService = new SpeakerIdService();
