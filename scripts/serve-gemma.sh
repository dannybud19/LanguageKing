#!/usr/bin/env bash
# Serve Gemma 4 E4B locally, with audio input, for LanguageKing.
#
# Uses llama.cpp's llama-server rather than LM Studio because audio input needs
# the multimodal projector (mmproj) loaded next to the model, and llama-server
# is the runtime verified to pass audio through. It reuses the GGUF that LM
# Studio already downloaded, so nothing is fetched twice.
#
#   brew install llama.cpp   # once
#   npm run model
#
# Override with GEMMA_DIR, PORT, or LLAMA_SERVER.
set -euo pipefail

GEMMA_DIR="${GEMMA_DIR:-$HOME/.lmstudio/models/google/gemma-4-E4B-it-qat-q4_0-gguf}"
PORT="${PORT:-8080}"
LLAMA_SERVER="${LLAMA_SERVER:-llama-server}"
MMPROJ_URL="https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf/resolve/main/gemma-4-E4B-it-mmproj.gguf"

if ! command -v "$LLAMA_SERVER" >/dev/null; then
  echo "llama-server not found. Install it with: brew install llama.cpp" >&2
  exit 1
fi

MODEL="$(find "$GEMMA_DIR" -maxdepth 1 -name '*.gguf' ! -name 'mmproj*' 2>/dev/null | head -1)"
if [[ -z "$MODEL" ]]; then
  echo "No Gemma 4 GGUF in $GEMMA_DIR. Download it with:" >&2
  echo "  lms get gemma-4-E4B-it-qat-q4_0-gguf -y" >&2
  exit 1
fi

# The "mmproj-" prefix is what LM Studio uses to recognise a projector
# instead of listing it as a model of its own.
MMPROJ="$GEMMA_DIR/mmproj-gemma-4-E4B-it.gguf"
if [[ ! -f "$MMPROJ" ]]; then
  echo "Downloading the audio/vision encoder (~1 GB) to $MMPROJ"
  curl -fL --progress-bar -o "$MMPROJ.part" "$MMPROJ_URL"
  mv "$MMPROJ.part" "$MMPROJ"
fi

echo "Serving $(basename "$MODEL") with audio on http://127.0.0.1:$PORT"
# --alias makes /v1/models report the id the app pings for.
exec "$LLAMA_SERVER" \
  -m "$MODEL" \
  --mmproj "$MMPROJ" \
  --alias gemma-4-e4b-it-qat \
  -c 8192 -ngl 99 \
  --host 127.0.0.1 --port "$PORT"
