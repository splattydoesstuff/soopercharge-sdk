# Todo

- End-to-end latency requirements need device/server runtime measurement after implementation:
  - first reply token <= 2s after ASR returns was met in HTTP smoke (~1714ms), but still needs confirmation from the app after real ASR.
  - first TTS playback <= 3s after first token
- True VAD behavior and resource release need iOS simulator/device validation because native sherpa/audio modules cannot be fully proven by TypeScript alone.
