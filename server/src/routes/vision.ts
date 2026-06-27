import { FastifyInstance } from "fastify";
import { config } from "../config.js";

interface VisionDependencies {
  fetch: typeof fetch;
  enabled: boolean;
  serverUrl: string;
}

export async function describeVisionImage(
  image: string,
  prompt: string | undefined,
  dependencies: VisionDependencies = {
    fetch,
    enabled: config.vision.enabled,
    serverUrl: config.vision.serverUrl,
  }
): Promise<string> {
  if (!dependencies.enabled) {
    throw new Error("Vision service is disabled");
  }

  const systemPrompt = prompt ||
    "你是一个视觉助手。请详细描述图片中的场景，重点描述物品的位置和环境。用简洁的中文回答。";

  const imageUrl = image.startsWith("data:")
    ? image
    : `data:image/jpeg;base64,${image}`;

  const response = await dependencies.fetch(`${dependencies.serverUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "minicpm-v-2.6",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: systemPrompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      }],
      max_tokens: 500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Vision server error ${response.status}: ${errText}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || "无法识别图片内容";
}

/**
 * Vision routes — POST /api/vision/describe
 * Calls local llama.cpp server running MiniCPM-V for image understanding
 */
export function createVisionRoutes(
  dependencies: VisionDependencies = {
    fetch,
    enabled: config.vision.enabled,
    serverUrl: config.vision.serverUrl,
  }
) {
  return async function visionRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: { image: string; prompt?: string };
  }>("/describe", async (request, reply) => {
    const { image, prompt } = request.body;

    if (!image) {
      return reply.status(400).send({ error: "image is required (base64)" });
    }

    if (!dependencies.enabled) {
      return reply.status(503).send({ error: "Vision service is disabled" });
    }

    try {
      const description = await describeVisionImage(image, prompt, dependencies);
      return { description };
    } catch (error: any) {
      fastify.log.error(error, "Vision describe failed");
      return reply.status(500).send({
        error: "Vision processing failed",
        details: error.message,
      });
    }
  });
  };
}

export const visionRoutes = createVisionRoutes();
