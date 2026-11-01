#!/usr/bin/env bash
# Installs and runs a local model for CSC Insights (llama.cpp server, OpenAI-compatible API).
# Runs on the same machine as CSC Command (or a private machine it can reach). No GPU needed.
# Usage: scripts/local-model.sh [install|start]
set -euo pipefail
DIR="${LLM_DIR:-/opt/llm}"
MODEL_URL="${MODEL_URL:-https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf}"
MODEL="$DIR/models/$(basename "$MODEL_URL")"
PORT="${LLM_PORT:-8081}"
case "${1:-start}" in
  install)
    mkdir -p "$DIR/models"
    python3 -m venv "$DIR/venv"
    "$DIR/venv/bin/pip" install --upgrade pip >/dev/null
    CMAKE_ARGS="-DGGML_NATIVE=ON" "$DIR/venv/bin/pip" install "llama-cpp-python[server]"
    [ -f "$MODEL" ] || curl -fL -o "$MODEL" "$MODEL_URL"
    echo "Installed. Start with: $0 start   then set LOCAL_LLM_URL=http://127.0.0.1:$PORT for CSC Command."
    ;;
  start)
    # Bound to localhost only: the model server is never exposed to the internet.
    exec "$DIR/venv/bin/python" -m llama_cpp.server --model "$MODEL" --model_alias "$(basename "$MODEL" .gguf)" \
      --host 127.0.0.1 --port "$PORT" --n_ctx 4096 --n_threads "$(nproc)"
    ;;
  *) echo "usage: $0 [install|start]"; exit 1 ;;
esac
