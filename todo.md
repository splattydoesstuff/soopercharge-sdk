# Todo

- Run one live microphone main-screen conversation on iOS simulator/device to confirm wakeword -> VAD -> ASR -> SSE -> TTS behavior with natural audio.
- Run repeated live conversations to check long-run VAD/audio-studio/recording/SSE resource release.
- Rebuild/reinstall native Node modules for the server runtime if using the current Node version for long-run summary memory writes; server smoke logs show a background `better-sqlite3` NODE_MODULE_VERSION mismatch from Mem0 history initialization.
