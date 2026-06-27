# Phase 1 待解决问题

- [ ] Camera UI 设备实测：确认隐藏相机组件能持续调用 `cameraPerceiver.addFrame()`，且不会明显影响性能/权限体验。
- [ ] 视觉记忆设备端实测：App 发起 `"记住这个放这了"` 后，确认返回 `response/evidenceUri/description`，并且搜索 `"钥匙放哪了"` 能显示位置和证据图。
- [ ] 原生 KWS 验证：`src/voice/wakeword.ts` 已改走 `@siteed/sherpa-onnx.rn` KWS adapter；还需实现麦克风 PCM feeder 调用 `wakewordService.acceptSamples()` 并设备验证唤醒词。
- [ ] 原生 Speaker ID 验证：`src/voice/speaker-id.ts` 已改走 `@siteed/sherpa-onnx.rn` SpeakerId；VoicePerceiver 还需采集验证音频样本并在设备上验证 owner 通过/非 owner 拒绝。
- [ ] 设备端 STT 验证：`src/voice/stt.ts` 已改走 `@siteed/sherpa-onnx.rn` SenseVoice adapter；还需下载模型并在 iOS/Android 上验证 `recognizeFromFile()`。
- [ ] Native sherpa 设备构建：已删除 `expo-sherpa-kws` scaffold 并统一到 `@siteed/sherpa-onnx.rn@1.3.1` adapter；还需跑 iOS/Android native build。
- [ ] iOS + Android 原生构建和设备冒烟测试。
