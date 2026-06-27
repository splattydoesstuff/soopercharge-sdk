import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createVisionRoutes, describeVisionImage } from "../src/routes/vision.js";

test("describeVisionImage sends OpenAI-compatible multimodal request", async () => {
  const fetchCalls: Array<{ url: string; body: any }> = [];

  const description = await describeVisionImage("raw-base64", "描述位置", {
    enabled: true,
    serverUrl: "http://vision.local",
    fetch: async (url, init) => {
      fetchCalls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify({
        choices: [{ message: { content: "黄色钥匙在蓝色抽屉上" } }],
      }));
    },
  });

  assert.equal(description, "黄色钥匙在蓝色抽屉上");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "http://vision.local/v1/chat/completions");
  assert.equal(fetchCalls[0].body.model, "minicpm-v-2.6");
  assert.equal(fetchCalls[0].body.messages[0].content[0].text, "描述位置");
  assert.equal(
    fetchCalls[0].body.messages[0].content[1].image_url.url,
    "data:image/jpeg;base64,raw-base64"
  );
});

test("vision route returns description and disabled status", async () => {
  const server = Fastify({ logger: false });
  await server.register(
    createVisionRoutes({
      enabled: true,
      serverUrl: "http://vision.local",
      fetch: async () => new Response(JSON.stringify({
        choices: [{ message: { content: "桌上有杯子" } }],
      })),
    }),
    { prefix: "/api/vision" }
  );

  try {
    const response = await server.inject({
      method: "POST",
      url: "/api/vision/describe",
      payload: { image: "data:image/png;base64,abc" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { description: "桌上有杯子" });
  } finally {
    await server.close();
  }

  const disabledServer = Fastify({ logger: false });
  await disabledServer.register(
    createVisionRoutes({
      enabled: false,
      serverUrl: "http://vision.local",
      fetch: async () => {
        throw new Error("should not fetch");
      },
    }),
    { prefix: "/api/vision" }
  );

  try {
    const response = await disabledServer.inject({
      method: "POST",
      url: "/api/vision/describe",
      payload: { image: "abc" },
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { error: "Vision service is disabled" });
  } finally {
    await disabledServer.close();
  }
});
