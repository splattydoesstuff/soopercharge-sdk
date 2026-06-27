# Phase 1 待解决问题

- [ ] 视觉记忆设备端实测：App 发起 `"记住这个放这了"` 后，确认返回 `response/evidenceUri/description`，并且搜索 `"钥匙放哪了"` 能显示位置和证据图。Android Settings 视觉诊断已证明 App observe 调用、evidence URL 和对话页证据图加载；`demo.jpg` 已证明可用图片的 observe/memory/search/MemoryCard 证据图链路，并用 `placementFact` 纠偏“衣服在桌子下”。但 emulator hidden camera 返回纯色/不可辨认帧，服务端已正确 `remembered=false` 且不写入 memory。剩余：用真实设备相机重跑，并覆盖实际语音路径与记忆检索。
- [ ] 原生 KWS 验证：Android emulator 已确认 native KWS 使用 app 私有目录绝对路径初始化，encoder/decoder/joiner/tokens/keywords 均存在，`@siteed/audio-studio` 持续喂 16k mono float PCM 到 `acceptWaveform()`，并已确认 STT/声纹/ASR 处理期间暂停、结束后恢复；设置页隔离诊断已用固定 `嘿魔戈` 音频 asset 命中 `HEY_MOGE`。剩余：真实设备/麦克风环境验证真实唤醒词命中。
- [ ] 设备端 STT 验证：Android emulator 已确认设置页模型检查全绿，并通过设置页语音诊断验证 SenseVoice `recognizeFromFile()` 对录音 m4a 返回文本；还需 iOS 设备/模拟器验证 `recognizeFromFile()`。
- [ ] Native sherpa 构建/设备验证：`expo prebuild` 和 iOS `pod install` 已通过，`sherpa-onnx-rn` 已 autolink；Android `:app:assembleDebug` 已用 Homebrew JDK 17 通过，Android emulator 已启动到 JS 并完成 KWS 初始化；iOS simulator build 仍被本机 Xcode `DVTDownloads.framework` 缺失阻塞，修复工具链后重跑 `cd ios && xcodebuild ... build`。
- [ ] iOS + Android 设备冒烟测试。
- [ ] NativeWind 配置编译通过后，验证 `className` 在 Expo web/native 上的支持情况。
- [ ] 后续决定提醒页面是否展示真实已排程提醒数据；本轮只在现有能力上增加页面外壳，不引入新 schema。
- [ ] 如果 Android 状态栏/隐私指示器必须完全移除，需要通过 `app.json` 或注册 Expo config plugin 实现，然后重新运行 `expo prebuild`；不要直接修改生成的 `android/` 产物。
- [ ] 通过插件配置排查重复 `RECORD_AUDIO` manifest warning，不要直接编辑 prebuild 产物。
- [ ] React Doctor 仍提示 `SettingsScreen` 组件过大；后续单独重构拆分诊断区块。
- [ ] Android 模拟器性能后续排查：官方建议重点看 VM/GPU 加速和系统镜像选择；当前设备已显示 Hypervisor.Framework 和 `ranchu`/`skiagl`，剩余卡顿应继续用应用级 CPU、native heap、logcat 证据定位，不能只归因于模拟器。
- [ ] 考虑新增明确的“启用环境感知”用户动作，让 wakeword/camera/calendar 不在冷启动自动开启。
- [ ] 移除 Android AudioStudio autolinking 后，Settings 仍显示较高 native heap（2026-06-27 通过 `adb dumpsys meminfo` 观察约 445 MB）；下一轮应隔离 Sherpa/ONNX 诊断、模型加载和卸载行为，不要把性能问题只归因于 AudioStudio。
- [ ] 真机验证 App 内语音模型下载：首次下载约 270MB，需要观察下载耗时、失败重试、设备剩余空间和锁屏/后台中断行为。
- [ ] 语音模型下载后续可增强断点续传和分模型删除；本轮先保证缺模型时有明确提示和用户触发下载，不再静默报错。
- [ ] 当前本机网络下 Hugging Face `curl -I` 预检出现 SSL 失败；真机下载 SenseVoice 前需要确认设备网络能访问 Hugging Face，或准备官方镜像/备用下载源。
