import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGroundedSearchResponse,
  buildSystemPrompt,
  getDefaultResponse,
  ruleBasedClassify,
} from "../src/routes/llm.js";

test("ruleBasedClassify handles core Chinese memory intents", () => {
  assert.equal(ruleBasedClassify("记住钥匙在蓝色抽屉里"), "store");
  assert.equal(ruleBasedClassify("钥匙放哪了"), "search");
  assert.equal(ruleBasedClassify("明早提醒我带钥匙"), "remind");
  assert.equal(ruleBasedClassify("今天天气怎么样"), "chat");
});

test("search prompt with no facts requires honest no-memory response", () => {
  const prompt = buildSystemPrompt("search", []);

  assert.match(prompt, /没有找到相关记忆/);
  assert.match(prompt, /我不记得这个/);
  assert.match(prompt, /不要编造信息/);
  assert.equal(getDefaultResponse("search"), "抱歉，我不记得这个信息。");
});

test("search prompt includes only provided facts", () => {
  const prompt = buildSystemPrompt("search", [
    { memory: "黄色钥匙在蓝色抽屉上", metadata: { evidenceUri: "http://example.test/key.png" } },
  ]);

  assert.match(prompt, /黄色钥匙在蓝色抽屉上/);
  assert.doesNotMatch(prompt, /没有找到相关记忆/);
  assert.doesNotMatch(prompt, /example\.test/);
});

test("search response is grounded in the top retrieved fact", () => {
  const response = buildGroundedSearchResponse([
    {
      memory: "用户说：记住衣服现在放在桌子下\n位置事实：衣服在桌子下\n视觉观察：桌子上有衣服，下面有一个狗窝。",
      metadata: {
        placementFact: "衣服在桌子下",
        description: "桌子上有衣服，下面有一个狗窝。",
        evidenceUri: "http://example.test/clothes.jpg",
      },
    },
    {
      memory: "用户说：记住这个放这了\n视觉观察：纯色图片，没有可辨认的物品。",
    },
  ]);

  assert.equal(response, "我记得：衣服在桌子下");
  assert.doesNotMatch(response, /狗窝|衣柜|沙发/);
});

test("search response without facts uses no-memory response", () => {
  assert.equal(buildGroundedSearchResponse([]), "抱歉，我不记得这个信息。");
});
