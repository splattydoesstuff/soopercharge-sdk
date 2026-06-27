# Phase 1 Native Sherpa Options

## 2026-06-27 调研结论

当前仓库内 `native-modules/expo-sherpa-kws` 只是 Expo module scaffold，没有 sherpa-onnx 原生库、模型资产或真实音频管线。继续手写 Swift/Kotlin 需要同时解决 iOS/Android 预编译库、C API 绑定、音频采集、模型下载和设备构建验证。

已确认的 npm 候选：

- `react-native-sherpa-onnx@0.4.3`
  - 提供 STT/TTS/VAD/下载管理等能力。
  - peer 依赖 `@dr.pogodin/react-native-fs`，依赖 background downloader。
  - npm tarball 未直接覆盖当前自定义 `expo-sherpa-kws` 的 KWS/Speaker API。
- `@siteed/sherpa-onnx.rn@1.3.1`
  - 提供 ASR、KWS、SpeakerId、VAD、TTS 等 handlers/services。
  - tarball 包含 Android `libsherpa-onnx-jni.so`、`libonnxruntime.so`，以及 iOS prebuilt headers/libs 和 bridge。
  - 包体较大，接入后必须跑 iOS/Android native build，不能只用 TypeScript 验收。
- `expo-sherpa-onnx@0.0.8`
  - Expo module，包含 STT/KWS/Speaker 等 API 和预编译库。
  - 包体更大，iOS 静态库明显增加工程体积。

建议路线：

1. 优先评估 `@siteed/sherpa-onnx.rn` 是否能同时替代当前 `expo-sherpa-kws` 的 KWS/SpeakerId scaffold，并承接设备端 STT。
2. 若选择 `@siteed/sherpa-onnx.rn`，先创建 adapter 层，避免业务代码直接依赖第三方 API：
   - `src/voice/stt.ts` 只暴露现有 `startRecording()/stopAndTranscribe()`。
   - `src/voice/wakeword.ts` 只依赖统一 KWS adapter。
   - `src/voice/speaker-id.ts` 只依赖统一 Speaker adapter。
3. 模型下载和设备 build 是验收前置条件：
   - SenseVoice/STT 模型。
   - KWS 模型和 keywords 文件。
   - Speaker embedding 模型。
   - iOS/Android 真机或模拟器 native build。

不要把第三方包只加进 `package.json` 后就标记 Step 7 完成；必须完成模型下载、原生构建和设备行为验证。
