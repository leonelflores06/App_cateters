#!/usr/bin/env bash
# Descarga el modelo Whisper (base, cuantizado, ~57 MB) y lo deja dentro de los assets de Android,
# para que quede empaquetado en el APK y la voz funcione sin internet.
# Correr DESPUÉS de `npx expo prebuild` y ANTES de `./gradlew assembleRelease`.
set -euo pipefail

MODEL="ggml-base-q5_1.bin"
URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL}"
DEST="$(dirname "$0")/../android/app/src/main/assets"

if [ ! -d "$(dirname "$DEST")" ]; then
  echo "No existe android/. Corré primero: npx expo prebuild --platform android" >&2
  exit 1
fi
mkdir -p "$DEST"
if [ -s "$DEST/$MODEL" ]; then
  echo "Modelo ya presente: $DEST/$MODEL"
  exit 0
fi
curl -fL --retry 3 -o "$DEST/$MODEL" "$URL"
echo "Modelo guardado en $DEST/$MODEL ($(du -h "$DEST/$MODEL" | cut -f1))"
