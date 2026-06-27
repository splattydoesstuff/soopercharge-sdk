# Phase 1 待解决问题

- [ ] Camera UI 设备实测：确认隐藏相机组件能持续调用 `cameraPerceiver.addFrame()`，且不会明显影响性能/权限体验。
- [ ] 视觉记忆设备端实测：App 发起 `"记住这个放这了"` 后，确认返回 `response/evidenceUri/description`，并且搜索 `"钥匙放哪了"` 能显示位置和证据图。
- [ ] 原生 KWS：`expo-sherpa-kws` Swift/Kotlin 仍是 TODO，需要实现 sherpa-onnx 音频监听和事件回调。
- [ ] 原生 Speaker ID：`expo-sherpa-kws` Swift/Kotlin 仍是 TODO，需要实现声纹 embedding 注册/验证；VoicePerceiver 还需采集验证音频样本。
- [ ] 设备端 STT 验证：`src/voice/stt.ts` 已改走 `@siteed/sherpa-onnx.rn` SenseVoice adapter；还需下载模型并在 iOS/Android 上验证 `recognizeFromFile()`。
- [ ] Native sherpa 迁移收尾：已引入 `@siteed/sherpa-onnx.rn@1.3.1` adapter；还需决定是否删除当前 `expo-sherpa-kws` scaffold 或把 KWS/Speaker 也迁到同一 adapter。
- [ ] iOS + Android 原生构建和设备冒烟测试。
