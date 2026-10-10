#!/bin/bash
set -euo pipefail

RES="${RES:-1280x720}"
SAIDA="/app/videos/gravacao-$(date +%Y%m%d-%H%M%S).mp4"

Xvfb :99 -screen 0 "${RES}x24" -nolisten tcp &
XVFB_PID=$!
export DISPLAY=:99

for _ in $(seq 1 50); do
  xdpyinfo -display :99 >/dev/null 2>&1 && break
  sleep 0.2
done

ffmpeg -loglevel error -y -f x11grab -framerate "${FPS:-15}" -video_size "$RES" -i :99.0 \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$SAIDA" &
FFMPEG_PID=$!

STATUS=0
node /app/navegar.js || STATUS=$?

kill -INT "$FFMPEG_PID"
wait "$FFMPEG_PID" || true
kill "$XVFB_PID" || true

echo "video: $SAIDA"
exit "$STATUS"
