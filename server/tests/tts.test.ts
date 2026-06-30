import assert from "node:assert/strict";
import test from "node:test";
import { extractMiniMaxTtsAudioHex } from "../src/routes/tts.js";

test("extractMiniMaxTtsAudioHex handles streamed TTS event payloads", () => {
  assert.deepEqual(extractMiniMaxTtsAudioHex("data: {\"data\":{\"audio\":\"00ff10\"}}"), [
    "00ff10",
  ]);
  assert.deepEqual(
    extractMiniMaxTtsAudioHex("{\"choices\":[{\"delta\":{\"audio\":\"aabbcc\"}}]}"),
    ["aabbcc"]
  );
  assert.deepEqual(extractMiniMaxTtsAudioHex("data: [DONE]"), []);
  assert.deepEqual(extractMiniMaxTtsAudioHex("event: ping"), []);
});
