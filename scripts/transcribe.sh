#!/usr/bin/env bash
# S9 재전사 래퍼 — CommandSynthAdapter의 계약(전사 텍스트를 stdout으로)에 맞춘다.
# 사용: OPENCOURSE_WHISPER_CMD="bash scripts/transcribe.sh {in}"
set -euo pipefail
in="$1"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
whisper "$in" --model small --language ko --task transcribe \
  --output_format txt --output_dir "$tmp" --verbose False --fp16 False >/dev/null 2>&1
cat "$tmp"/*.txt
