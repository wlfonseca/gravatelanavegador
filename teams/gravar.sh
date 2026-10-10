#!/bin/bash
set -euo pipefail

RES="${RES:-1280x720}"
export RES
SAIDA="/app/videos/gravacao-$(date +%Y%m%d-%H%M%S).mp4"

export XDG_RUNTIME_DIR=/tmp/runtime-root
mkdir -p -m 700 "$XDG_RUNTIME_DIR"
pulseaudio -D --exit-idle-time=-1 --log-level=error
for _ in $(seq 1 50); do
  pactl info >/dev/null 2>&1 && break
  sleep 0.2
done
pactl load-module module-null-sink sink_name=gravacao sink_properties=device.description=gravacao >/dev/null
pactl load-module module-null-sink sink_name=microfone sink_properties=device.description=microfone >/dev/null
pactl set-default-sink gravacao
pactl set-default-source microfone.monitor

Xvfb :99 -screen 0 "${RES}x24" -nolisten tcp &
XVFB_PID=$!
export DISPLAY=:99
for _ in $(seq 1 50); do
  xdpyinfo -display :99 >/dev/null 2>&1 && break
  sleep 0.2
done

ffmpeg -loglevel error -y \
  -thread_queue_size 1024 -f x11grab -framerate "${FPS:-15}" -video_size "$RES" -i :99.0 \
  -thread_queue_size 1024 -f pulse -i gravacao.monitor \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
  -c:a aac -b:a 128k \
  -movflags +frag_keyframe+empty_moov+default_base_moof \
  "$SAIDA" &
FFMPEG_PID=$!

STATUS=0
node /app/entrar.js || STATUS=$?

kill -INT "$FFMPEG_PID"
wait "$FFMPEG_PID" || true
kill "$XVFB_PID" || true
pulseaudio -k || true

echo "video: $SAIDA"
exit "$STATUS"
