# Todo

- Run one live microphone main-screen conversation on a physical iOS device to confirm wakeword/button trigger -> VAD -> ASR -> SSE -> TTS behavior with natural audio outside the simulator audio stack.
- Run repeated live conversations on a real device to check natural-speech VAD timing and audio playback completion without simulator CoreAudio/TTS timeout noise.
- Use `docs/home-voice-conversation-device-acceptance.md` to capture the physical-device trace ids, latency fields, and playback observations once a device is connected.
