import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  createObserveRoutes,
  extractExplicitPlacement,
  hasUsableVisualDescription,
} from "../src/routes/observe.js";

const IMAGE_BASE64 = "abc123";

test("voice visual observe route stores combined memory and returns evidence", async () => {
  const stored: Array<{
    messages: Array<{ role: string; content: string }>;
    metadata?: Record<string, any>;
    options?: { infer?: boolean };
  }> = [];

  const server = Fastify({ logger: false });
  await server.register(
    createObserveRoutes({
      describeImage: async (imageBase64, transcript) => {
        assert.equal(imageBase64, IMAGE_BASE64);
        assert.equal(transcript, "记住这个放这了");
        return "一串钥匙在蓝色抽屉里";
      },
      saveEvidenceImage: async () => ({
        url: "http://127.0.0.1:8080/api/evidence/test.png",
        filename: "test.png",
      }),
      addMemory: async (messages, metadata, options) => {
        stored.push({ messages, metadata, options });
        return { ok: true };
      },
      searchMemories: async () => [],
      generateConfirmation: async () => "好的，记住钥匙在蓝色抽屉里。",
    }),
    { prefix: "/api/observe" }
  );

  try {
    const response = await server.inject({
      method: "POST",
      url: "/api/observe/voice-visual",
      payload: {
        transcript: "记住这个放这了",
        imageBase64: IMAGE_BASE64,
        metadata: { category: "placement", timestamp: "2026-06-27T00:00:00.000Z" },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      response: "好的，记住钥匙在蓝色抽屉里。",
      evidenceUri: "http://127.0.0.1:8080/api/evidence/test.png",
      description: "一串钥匙在蓝色抽屉里",
      remembered: true,
    });

    assert.equal(stored.length, 1);
    assert.equal(stored[0].messages[0].role, "user");
    assert.match(stored[0].messages[0].content, /记住这个放这了/);
    assert.match(stored[0].messages[0].content, /一串钥匙在蓝色抽屉里/);
    assert.equal(stored[0].metadata?.source, "voice+camera");
    assert.equal(stored[0].metadata?.evidenceUri, "http://127.0.0.1:8080/api/evidence/test.png");
    assert.equal(stored[0].metadata?.description, "一串钥匙在蓝色抽屉里");
    assert.equal(stored[0].options?.infer, false);
  } finally {
    await server.close();
  }
});

test("voice visual observe route does not store unusable visual descriptions", async () => {
  const stored: unknown[] = [];
  const server = Fastify({ logger: false });
  await server.register(
    createObserveRoutes({
      describeImage: async () => "由于提供的图片是纯色的，没有可辨认的物品、位置或环境。",
      saveEvidenceImage: async () => ({
        url: "http://127.0.0.1:8080/api/evidence/blank.png",
        filename: "blank.png",
      }),
      addMemory: async (...args) => {
        stored.push(args);
        return { ok: true };
      },
      searchMemories: async () => [],
      generateConfirmation: async () => "不应该调用确认生成",
    }),
    { prefix: "/api/observe" }
  );

  try {
    const response = await server.inject({
      method: "POST",
      url: "/api/observe/voice-visual",
      payload: {
        transcript: "记住这个放这了",
        imageBase64: IMAGE_BASE64,
        metadata: { category: "placement" },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().remembered, false);
    assert.equal(response.json().evidenceUri, "http://127.0.0.1:8080/api/evidence/blank.png");
    assert.match(response.json().response, /不写入记忆/);
    assert.equal(stored.length, 0);
  } finally {
    await server.close();
  }
});

test("voice visual observe route prefers explicit placement from transcript", async () => {
  const stored: Array<{
    messages: Array<{ role: string; content: string }>;
    metadata?: Record<string, any>;
  }> = [];
  const server = Fastify({ logger: false });
  await server.register(
    createObserveRoutes({
      describeImage: async () => "桌子上有衣服，下面有一个狗窝。",
      saveEvidenceImage: async () => ({
        url: "http://127.0.0.1:8080/api/evidence/clothes.jpg",
        filename: "clothes.jpg",
      }),
      addMemory: async (messages, metadata) => {
        stored.push({ messages, metadata });
        return { ok: true };
      },
      searchMemories: async () => [],
      generateConfirmation: async (_transcript, _description, placementFact) =>
        `记住了，${placementFact}。`,
    }),
    { prefix: "/api/observe" }
  );

  try {
    const response = await server.inject({
      method: "POST",
      url: "/api/observe/voice-visual",
      payload: {
        transcript: "记住衣服现在放在桌子下",
        imageBase64: IMAGE_BASE64,
        metadata: { category: "placement" },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().remembered, true);
    assert.equal(response.json().response, "记住了，衣服在桌子下。");
    assert.equal(stored.length, 1);
    assert.match(stored[0].messages[0].content, /位置事实：衣服在桌子下/);
    assert.match(stored[0].messages[0].content, /视觉观察：桌子上有衣服/);
    assert.equal(stored[0].metadata?.placementFact, "衣服在桌子下");
    assert.equal(stored[0].metadata?.description, "桌子上有衣服，下面有一个狗窝。");
  } finally {
    await server.close();
  }
});

test("hasUsableVisualDescription rejects non-observations", () => {
  assert.equal(hasUsableVisualDescription("一串钥匙在蓝色抽屉里"), true);
  assert.equal(hasUsableVisualDescription("无法识别图片内容"), false);
  assert.equal(hasUsableVisualDescription("没有可辨认的物品、位置或环境"), false);
  assert.equal(hasUsableVisualDescription("   "), false);
});

test("extractExplicitPlacement reads concrete placement from transcript", () => {
  assert.equal(extractExplicitPlacement("记住衣服现在放在桌子下"), "衣服在桌子下");
  assert.equal(extractExplicitPlacement("我的钥匙在蓝色抽屉里"), "钥匙在蓝色抽屉里");
  assert.equal(extractExplicitPlacement("记住这个放这了"), null);
});
