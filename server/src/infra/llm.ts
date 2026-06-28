import { completeSimple, streamSimple } from "@earendil-works/pi-ai/compat";
import type { Api, Context, Message, Model, SimpleStreamOptions, Usage } from "@earendil-works/pi-ai";
import { config } from "../config.js";

export type LlmProviderType = "openai" | "anthropic" | "gemini";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ProviderMapping {
  api: Api;
  provider: string;
  defaultBaseUrl: string;
  defaultModel: string;
}

const PROVIDER_MAP: Record<LlmProviderType, ProviderMapping> = {
  openai: {
    api: "openai-completions",
    provider: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
  },
  anthropic: {
    api: "anthropic-messages",
    provider: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-20250514",
  },
  gemini: {
    api: "google-generative-ai",
    provider: "google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.0-flash-001",
  },
};

const modelCache = new Map<string, Model<Api>>();
const zeroUsage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export function buildModel(llmConfig = config.llm): Model<Api> {
  const provider = llmConfig.provider as LlmProviderType;
  const mapping = PROVIDER_MAP[provider] || PROVIDER_MAP.openai;
  const modelId = llmConfig.model || mapping.defaultModel;
  const baseUrl = (llmConfig.baseUrl || mapping.defaultBaseUrl).replace(/\/$/, "");
  const key = `${provider}:${modelId}:${baseUrl}`;
  const cached = modelCache.get(key);
  if (cached) return cached;

  const model: Model<Api> = {
    id: modelId,
    name: modelId,
    api: mapping.api,
    provider: mapping.provider,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
  };

  modelCache.set(key, model);
  return model;
}

export function clearModelCache(): void {
  modelCache.clear();
}

export function buildContext(messages: ChatMessage[]): Context {
  const systemPrompt = messages.find((message) => message.role === "system")?.content;
  const nonSystemMessages = messages.filter((message) => message.role !== "system");
  const model = buildModel();

  return {
    systemPrompt,
    messages: nonSystemMessages.map((message): Message => {
      if (message.role === "assistant") {
        return {
          role: "assistant",
          content: [{ type: "text", text: message.content }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: zeroUsage,
          stopReason: "stop",
          timestamp: Date.now(),
        };
      }

      return {
        role: "user",
        content: message.content,
        timestamp: Date.now(),
      };
    }),
  };
}

export async function chatComplete(
  messages: ChatMessage[],
  options: SimpleStreamOptions = {}
): Promise<string> {
  const result = await completeSimple(buildModel(), buildContext(messages), {
    apiKey: config.llm.apiKey,
    timeoutMs: config.llm.timeoutMs,
    ...options,
  });

  if (result.stopReason === "error" || result.stopReason === "aborted") {
    throw new Error(result.errorMessage || `LLM call failed: ${result.stopReason}`);
  }

  return result.content
    .filter((content): content is { type: "text"; text: string } => content.type === "text")
    .map((content) => content.text)
    .join("");
}

export function chatStream(messages: ChatMessage[], options: SimpleStreamOptions = {}) {
  return streamSimple(buildModel(), buildContext(messages), {
    apiKey: config.llm.apiKey,
    timeoutMs: config.llm.timeoutMs,
    ...options,
  });
}
