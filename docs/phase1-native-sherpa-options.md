# Phase 1 Native Sherpa Options

## 2026-06-27 调研结论

此前仓库内 `native-modules/expo-sherpa-kws` 只是 Expo module scaffold，没有 sherpa-onnx 原生库、模型资产或真实音频管线。继续手写 Swift/Kotlin 需要同时解决 iOS/Android 预编译库、C API 绑定、音频采集、模型下载和设备构建验证，因此已删除该 scaffold，统一迁到 `@siteed/sherpa-onnx.rn` adapter。

已确认的 npm 候选：

- `react-native-sherpa-onnx@0.4.3`
  - 提供 STT/TTS/VAD/下载管理等能力。
  - peer 依赖 `@dr.pogodin/react-native-fs`，依赖 background downloader。
  - npm tarball 未直接覆盖此前自定义 `expo-sherpa-kws` 的 KWS/Speaker API。
- `@siteed/sherpa-onnx.rn@1.3.1`
  - 提供 ASR、KWS、SpeakerId、VAD、TTS 等 handlers/services。
  - tarball 包含 Android `libsherpa-onnx-jni.so`、`libonnxruntime.so`，以及 iOS prebuilt headers/libs 和 bridge。
  - 包体较大，接入后必须跑 iOS/Android native build，不能只用 TypeScript 验收。
- `expo-sherpa-onnx@0.0.8`
  - Expo module，包含 STT/KWS/Speaker 等 API 和预编译库。
  - 包体更大，iOS 静态库明显增加工程体积。

## 已执行决策

- 已引入 `@siteed/sherpa-onnx.rn@1.3.1`。
- 已注册 Expo config plugin：`@siteed/sherpa-onnx.rn/app.plugin`。
- 已删除未实现的 `native-modules/expo-sherpa-kws` scaffold。
- 已创建 `src/voice/sherpa-adapter.ts`，统一封装 ASR/KWS/Speaker 的配置和调用。
- 已将 `src/voice/stt.ts` 从服务端 `/api/stt/transcribe` 改为本地 SenseVoice ASR adapter：`SherpaOnnx.ASR.recognizeFromFile()`。
- 已将 `VoicePerceiver.finishListening()` 改为先停止录音拿到音频文件，再调用 `speakerIdService.verifyFile()` 做 owner gate，通过后复用同一个文件做 SenseVoice 转写。
- 已在设置页提供本次会话 owner 声纹录入入口：按住录音后调用 `speakerIdService.enrollFromFile()` 注册到 `@siteed/sherpa-onnx.rn` 的 SpeakerId manager。
- 已将 owner speaker embedding 分块写入 `expo-secure-store`；`refreshEnrollmentStatus()` 会在 native SpeakerId manager 为空时从 SecureStore 恢复并重新 register。
- 已确认 `@siteed/sherpa-onnx.rn` 提供 KWS/Speaker/ASR 推理 API，但不提供麦克风 PCM 采集器；已选择 `@siteed/audio-studio` 作为实时采集层，在 `src/voice/kws-audio-feeder.ts` 采集 16k mono float PCM 并喂给 `wakewordService.acceptSamples()`。
- 已在 Expo config 注册 `@siteed/audio-studio` plugin，并关闭后台录音、通知、蓝牙设备检测和电话状态权限；当前 KWS feeder 只按前台麦克风采集配置，设备后台常驻能力不作为 Phase 1 验收前提。
- KWS feeder 已对 `AudioData` float payload 缺失做一次性 warning，并将待处理样本限制为最近 3 秒；`VoicePerceiver` 会订阅 `wakeWordEnabled` 偏好变化，运行中同步启动/停止 feeder。
- 已添加 `scripts/download-sherpa-models.sh` 和 `docs/phase1-sherpa-models.md`，用于下载 SenseVoice/KWS/Speaker 模型到未提交的 `app-models/sherpa-onnx/`，目录结构对齐设备端 `documentDirectory/sherpa-onnx/`。
- 已新增设备端模型文件自检：`src/voice/sherpa-models.ts` 会检查 ASR/KWS/Speaker 必需文件，`sherpaVoiceAdapter` 在 native 初始化前先报清晰缺失清单，设置页“语音模型”可直接查看 ready/missing 状态。
- `pnpm exec expo prebuild --clean --no-install` 已通过；`cd ios && pod install` 已通过，CocoaPods autolink 到 `sherpa-onnx-rn (1.3.1)` 并生成 `SherpaOnnxSpec`。
- Android native debug 构建已通过：安装 Homebrew `openjdk@17` 后使用 `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ./gradlew :app:assembleDebug`，Gradle 自动安装所需 Android SDK/NDK/CMake，`siteed-audio-studio` 与 `siteed_sherpa-onnx.rn` Kotlin/Java/CMake 编译和 APK 打包均成功。
- iOS simulator build 仍未通过：本机 Xcode 缺 `DVTDownloads.framework`，卡在 `IDESimulatorFoundation` 加载阶段。该项仍是工具链 blocker，不代表 iOS sherpa native 编译已通过。

## 后续路线

1. 继续用 `@siteed/sherpa-onnx.rn` 替代此前 `expo-sherpa-kws` scaffold，并承接设备端 STT/KWS/Speaker ID。
2. adapter 层要避免业务代码直接依赖第三方 API：
   - `src/voice/stt.ts` 只暴露现有 `startRecording()/stopAndTranscribe()`。
   - `src/voice/wakeword.ts` 只依赖统一 KWS adapter。
   - `src/voice/speaker-id.ts` 只依赖统一 Speaker adapter。
3. 模型下载和设备 build 是验收前置条件：
   - SenseVoice/STT 模型。
   - KWS 模型和 keywords 文件。
   - Speaker embedding 模型。
   - iOS 真机或模拟器 native build。
   - Android 真机设备行为验证。
4. 设备验收时仍要确认 owner enrollment 持久化：当前实现把 owner embedding 安全保存并启动/刷新时重新 register，但还没有真机重启后验证。

不要把第三方包只加进 `package.json` 后就标记 Step 7 完成；必须完成模型下载、原生构建和设备行为验证。
