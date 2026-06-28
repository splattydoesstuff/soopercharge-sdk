export const config = {
  llm: {
    provider: (process.env.LLM_PROVIDER || "openai") as "openai" | "anthropic" | "gemini",
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || "gpt-4o",
    embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    timeoutMs: Number.parseInt(process.env.LLM_TIMEOUT_MS || "60000", 10),
  },
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY || "",
    groupId: process.env.MINIMAX_GROUP_ID || "",
  },
  database: {
    url: process.env.DATABASE_URL || "postgresql://looi:superlooi123!@localhost:5432/looi",
  },
  server: {
    port: parseInt(process.env.PORT || "8080", 10),
    host: process.env.HOST || "0.0.0.0",
  },
  vision: {
    serverUrl: process.env.VISION_SERVER_URL || "http://localhost:8082",
    enabled: process.env.VISION_ENABLED !== "false",
  },
} as const;
