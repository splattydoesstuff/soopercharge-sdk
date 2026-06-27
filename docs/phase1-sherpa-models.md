# Phase 1 Sherpa Model Assets

App-side sherpa models are large and are not committed. Keep local copies under:

- `app-models/sherpa-onnx/asr/sensevoice/`
- `app-models/sherpa-onnx/kws/looi/`
- `app-models/sherpa-onnx/speaker-id/looi/`

Run:

```bash
bash scripts/download-sherpa-models.sh
```

Expected files:

- SenseVoice: `model.int8.onnx`, `tokens.txt`
- KWS: `encoder-epoch-12-avg-2-chunk-16-left-64.onnx`, `decoder-epoch-12-avg-2-chunk-16-left-64.onnx`, `joiner-epoch-12-avg-2-chunk-16-left-64.onnx`, `tokens.txt`, `keywords.txt`
- Speaker ID: `model.onnx`

`@siteed/sherpa-onnx.rn` expects `keywordsFile` to be relative to `modelDir`, so `EXPO_PUBLIC_SHERPA_KEYWORDS_FILE` must stay `keywords.txt`.

Runtime model dirs currently match `@siteed/sherpa-onnx.rn`'s ArchiveService convention under device `documentDirectory/sherpa-onnx/`:

- `sherpa-onnx/asr/sensevoice`
- `sherpa-onnx/kws/looi`
- `sherpa-onnx/speaker-id/looi`

For local native builds, copy or download these folders into the device-accessible document directory before initializing sherpa, or set the environment model dirs to absolute paths supported by the native runtime. Device validation is still required for iOS and Android.
