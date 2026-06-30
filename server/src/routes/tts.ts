import { FastifyInstance } from "fastify";
import { config } from "../config.js";

const MINIMAX_TTS_URL = "https://api.minimax.chat/v1/t2a_v2";
const STREAMING_TEXT_MAX_LENGTH = 1200;

type TtsRequestOptions = {
  text: string;
  voiceId?: string;
  speed?: number;
  stream: boolean;
};

function buildMiniMaxTtsPayload({
  text,
  voiceId = "male-qn-qingse",
  speed = 1.0,
  stream,
}: TtsRequestOptions) {
  return {
    model: "speech-02-hd",
    text,
    stream,
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
  };
}

function isHexAudio(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value);
}

function collectAudioHexValues(value: unknown, out: string[] = []): string[] {
  if (!value || typeof value !== "object") {
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectAudioHexValues(item, out);
    }
    return out;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "audio" && typeof child === "string" && isHexAudio(child)) {
      out.push(child);
    } else {
      collectAudioHexValues(child, out);
    }
  }
  return out;
}

export function extractMiniMaxTtsAudioHex(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }

  const payload = trimmed.startsWith("data:") ? trimmed.slice("data:".length).trim() : trimmed;
  if (!payload || payload === "[DONE]") {
    return [];
  }

  if (isHexAudio(payload)) {
    return [payload];
  }

  try {
    return collectAudioHexValues(JSON.parse(payload));
  } catch {
    return [];
  }
}

async function requestMiniMaxTts(options: TtsRequestOptions, signal?: AbortSignal): Promise<Response> {
  return fetch(MINIMAX_TTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.minimax.apiKey}`,
    },
    body: JSON.stringify(buildMiniMaxTtsPayload(options)),
    signal,
  });
}

/**
 * TTS routes — /api/tts/*
 * Text-to-Speech via MiniMax API
 */
export async function ttsRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/tts/synthesize
   * Convert text to speech audio (returns hex-encoded MP3)
   */
  fastify.post<{
    Body: { text: string; voiceId?: string; speed?: number };
  }>("/synthesize", async (request, reply) => {
    const { text, voiceId = "male-qn-qingse", speed = 1.0 } = request.body;

    if (!text?.trim()) {
      return reply.status(400).send({ error: "text is required" });
    }

    try {
      const response = await requestMiniMaxTts({ text, voiceId, speed, stream: false });

      if (!response.ok) {
        throw new Error(`MiniMax API error: ${response.status}`);
      }

      const data = await response.json() as any;

      if (data.base_resp?.status_code !== 0) {
        throw new Error(`TTS error: ${data.base_resp?.status_msg || "unknown"}`);
      }

      const audioHex = data.data?.audio;
      if (!audioHex) {
        throw new Error("No audio in response");
      }

      // Convert hex to binary buffer
      const audioBuffer = Buffer.from(audioHex, "hex");

      // Return as MP3 binary
      reply.header("Content-Type", "audio/mpeg");
      reply.header("Content-Length", audioBuffer.length);
      return reply.send(audioBuffer);
    } catch (error: any) {
      fastify.log.error(error, "TTS synthesis failed");
      return reply.status(500).send({
        error: "TTS synthesis failed",
        details: error.message,
      });
    }
  });

  /**
   * GET /api/tts/stream
   * Stream TTS audio as chunked MP3 so native audio playback can start before full synthesis completes.
   */
  fastify.get<{
    Querystring: { text?: string; voiceId?: string; speed?: string };
  }>("/stream", async (request, reply) => {
    const { text, voiceId = "male-qn-qingse", speed = "1.0" } = request.query;
    const normalizedText = text?.trim() ?? "";

    if (!normalizedText) {
      return reply.status(400).send({ error: "text is required" });
    }

    if (normalizedText.length > STREAMING_TEXT_MAX_LENGTH) {
      return reply.status(413).send({ error: "text is too long for streaming TTS" });
    }

    const abortController = new AbortController();
    request.raw.on("close", () => {
      if (!reply.raw.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const response = await requestMiniMaxTts(
        {
          text: normalizedText,
          voiceId,
          speed: Number.parseFloat(speed) || 1.0,
          stream: true,
        },
        abortController.signal
      );

      if (!response.ok) {
        throw new Error(`MiniMax API error: ${response.status}`);
      }

      reply.raw.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("audio/")) {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("MiniMax streaming response body is unavailable");
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value?.length) {
              reply.raw.write(Buffer.from(value));
            }
          }
        } finally {
          reader.releaseLock();
        }
        reply.raw.end();
        return reply;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("MiniMax streaming response body is unavailable");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split(/\r?\n/);
          buffer = done ? "" : lines.pop() ?? "";

          for (const line of lines) {
            for (const audioHex of extractMiniMaxTtsAudioHex(line)) {
              reply.raw.write(Buffer.from(audioHex, "hex"));
            }
          }

          if (done) {
            if (buffer.trim()) {
              for (const audioHex of extractMiniMaxTtsAudioHex(buffer)) {
                reply.raw.write(Buffer.from(audioHex, "hex"));
              }
            }
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }

      reply.raw.end();
      return reply;
    } catch (error: any) {
      if (abortController.signal.aborted) {
        return reply;
      }

      fastify.log.error(error, "TTS streaming failed");
      if (!reply.raw.headersSent) {
        return reply.status(500).send({
          error: "TTS streaming failed",
          details: error.message,
        });
      }
      reply.raw.destroy(error);
      return reply;
    }
  });
}
