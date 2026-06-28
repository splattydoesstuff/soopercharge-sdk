# 待办

- 在真实 iOS 设备上运行一次主屏幕 live microphone 对话，确认真实自然音频下 wakeword/button trigger -> VAD -> ASR -> SSE -> TTS 行为。
- 在真实设备上运行重复 live 对话，确认自然语音 VAD 时序和音频播放完成情况，不受模拟器 CoreAudio/TTS timeout 噪声影响。
- 设备接入后，使用 `docs/home-voice-conversation-device-acceptance.md` 或 `pnpm voice:accept-device -- "<physical device name>"` 记录真机 trace id、延迟字段和播放观察结果。
