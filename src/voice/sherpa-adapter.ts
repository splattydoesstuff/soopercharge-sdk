import SherpaOnnx, {
  type AsrModelConfig,
  type KWSModelConfig,
  type SpeakerIdModelConfig,
} from "@siteed/sherpa-onnx.rn";

const DEFAULT_STT_MODEL_DIR = "sherpa-onnx/sensevoice";
const DEFAULT_STT_MODEL_FILE = "model.int8.onnx";
const DEFAULT_STT_TOKENS_FILE = "tokens.txt";
const DEFAULT_KWS_MODEL_DIR = "sherpa-onnx/kws";
const DEFAULT_SPEAKER_MODEL_DIR = "sherpa-onnx/speaker";
const DEFAULT_SPEAKER_MODEL_FILE = "model.onnx";
const DEFAULT_KEYWORDS_FILE = "keywords.txt";
const DEFAULT_SAMPLE_RATE = 16000;

function env(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function parseIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getSherpaAsrConfig(): AsrModelConfig {
  return {
    modelDir: env("EXPO_PUBLIC_SHERPA_STT_MODEL_DIR", DEFAULT_STT_MODEL_DIR),
    modelType: "sense_voice",
    streaming: false,
    language: env("EXPO_PUBLIC_SHERPA_STT_LANGUAGE", "zh"),
    useItn: true,
    numThreads: parseIntEnv("EXPO_PUBLIC_SHERPA_NUM_THREADS", 2),
    decodingMethod: "greedy_search",
    modelFiles: {
      model: env("EXPO_PUBLIC_SHERPA_STT_MODEL_FILE", DEFAULT_STT_MODEL_FILE),
      tokens: env("EXPO_PUBLIC_SHERPA_STT_TOKENS_FILE", DEFAULT_STT_TOKENS_FILE),
    },
    provider: "cpu",
  };
}

export function getSherpaKwsConfig(): KWSModelConfig {
  return {
    modelDir: env("EXPO_PUBLIC_SHERPA_KWS_MODEL_DIR", DEFAULT_KWS_MODEL_DIR),
    keywordsFile: env("EXPO_PUBLIC_SHERPA_KEYWORDS_FILE", DEFAULT_KEYWORDS_FILE),
    modelType: env("EXPO_PUBLIC_SHERPA_KWS_MODEL_TYPE", "zipformer2"),
    numThreads: parseIntEnv("EXPO_PUBLIC_SHERPA_NUM_THREADS", 2),
    provider: "cpu",
  };
}

export function getSherpaSpeakerConfig(): SpeakerIdModelConfig {
  return {
    modelDir: env("EXPO_PUBLIC_SHERPA_SPEAKER_MODEL_DIR", DEFAULT_SPEAKER_MODEL_DIR),
    modelFile: env("EXPO_PUBLIC_SHERPA_SPEAKER_MODEL_FILE", DEFAULT_SPEAKER_MODEL_FILE),
    sampleRate: DEFAULT_SAMPLE_RATE,
    numThreads: parseIntEnv("EXPO_PUBLIC_SHERPA_NUM_THREADS", 2),
    provider: "cpu",
  };
}

export class SherpaVoiceAdapter {
  private asrReady = false;
  private kwsReady = false;
  private speakerReady = false;

  async initializeAsr(config: AsrModelConfig = getSherpaAsrConfig()): Promise<void> {
    if (this.asrReady) return;
    const result = await SherpaOnnx.ASR.initialize(config);
    if (!result.success) {
      throw new Error(result.error || "Sherpa ASR initialization failed");
    }
    this.asrReady = true;
  }

  async transcribeFile(fileUri: string): Promise<string> {
    await this.initializeAsr();
    const result = await SherpaOnnx.ASR.recognizeFromFile(fileUri);
    if (!result.success) {
      throw new Error(result.error || "Sherpa ASR recognition failed");
    }
    return result.text?.trim() || "";
  }

  async initializeKws(config: KWSModelConfig = getSherpaKwsConfig()): Promise<void> {
    if (this.kwsReady) return;
    const result = await SherpaOnnx.KWS.init(config);
    if (!result.success) {
      throw new Error(result.error || "Sherpa KWS initialization failed");
    }
    this.kwsReady = true;
  }

  async acceptKwsSamples(samples: number[], sampleRate = DEFAULT_SAMPLE_RATE) {
    await this.initializeKws();
    return SherpaOnnx.KWS.acceptWaveform(sampleRate, samples);
  }

  async initializeSpeaker(
    config: SpeakerIdModelConfig = getSherpaSpeakerConfig()
  ): Promise<void> {
    if (this.speakerReady) return;
    const result = await SherpaOnnx.SpeakerId.init(config);
    if (!result.success) {
      throw new Error(result.error || "Sherpa Speaker ID initialization failed");
    }
    this.speakerReady = true;
  }

  async computeSpeakerEmbedding(samples: number[], sampleRate = DEFAULT_SAMPLE_RATE): Promise<number[]> {
    await this.initializeSpeaker();
    const processResult = await SherpaOnnx.SpeakerId.processSamples(sampleRate, samples);
    if (!processResult.success) {
      throw new Error(processResult.error || "Sherpa speaker sample processing failed");
    }
    const embedding = await SherpaOnnx.SpeakerId.computeEmbedding();
    if (!embedding.success) {
      throw new Error(embedding.error || "Sherpa speaker embedding failed");
    }
    return embedding.embedding;
  }
}

export const sherpaVoiceAdapter = new SherpaVoiceAdapter();
