#!/bin/bash
# Download app-side sherpa-onnx models without committing large artifacts.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_ROOT="${MODEL_ROOT:-$ROOT_DIR/app-models/sherpa-onnx}"
SENSEVOICE_DIR="$MODEL_ROOT/asr/sensevoice"
KWS_DIR="$MODEL_ROOT/kws/looi"
SPEAKER_DIR="$MODEL_ROOT/speaker-id/looi"

mkdir -p "$SENSEVOICE_DIR" "$KWS_DIR" "$SPEAKER_DIR"

if ! command -v huggingface-cli >/dev/null 2>&1; then
  echo "huggingface-cli is required. Install with: pip install -U huggingface_hub"
  exit 1
fi

echo "Downloading SenseVoice STT model..."
huggingface-cli download \
  k2-fsa/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17 \
  model.int8.onnx tokens.txt \
  --local-dir "$SENSEVOICE_DIR"

echo "Downloading KWS zipformer model..."
huggingface-cli download \
  k2-fsa/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20 \
  encoder-epoch-12-avg-2-chunk-16-left-64.onnx \
  decoder-epoch-12-avg-2-chunk-16-left-64.onnx \
  joiner-epoch-12-avg-2-chunk-16-left-64.onnx \
  tokens.txt \
  --local-dir "$KWS_DIR"

if [ ! -f "$KWS_DIR/keywords.txt" ]; then
  cat > "$KWS_DIR/keywords_raw.txt" <<'EOF'
嘿魔戈 @HEY_MOGE
EOF

  if command -v sherpa-onnx-cli >/dev/null 2>&1; then
    sherpa-onnx-cli text2token \
      --tokens "$KWS_DIR/tokens.txt" \
      --tokens-type ppinyin \
      "$KWS_DIR/keywords_raw.txt" \
      "$KWS_DIR/keywords.txt"
  else
    echo "KWS model downloaded, but keywords.txt still needs sherpa-onnx-cli."
    echo "Install sherpa-onnx-cli and run:"
    echo "  sherpa-onnx-cli text2token --tokens \"$KWS_DIR/tokens.txt\" --tokens-type ppinyin \"$KWS_DIR/keywords_raw.txt\" \"$KWS_DIR/keywords.txt\""
  fi
fi

echo "Downloading Speaker ID model..."
huggingface-cli download \
  k2-fsa/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k \
  model.onnx \
  --local-dir "$SPEAKER_DIR"

echo "Models downloaded under: $MODEL_ROOT"
echo "Keep .env model dirs pointed at app-models/sherpa-onnx/* for local native builds."
