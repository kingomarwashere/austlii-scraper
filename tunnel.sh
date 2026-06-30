#!/bin/bash
# Persistent reverse SSH tunnel: VM:4243 → local:4242
# Reconnects automatically if the connection drops.
# Run: bash tunnel.sh   (keep this terminal open, or run with & to background)

VM_HOST="66.226.145.153"
VM_USER="root"
VM_PASS="UfCA6yt1Dgfq"
REMOTE_PORT=4243
LOCAL_PORT=4242

echo "[tunnel] Starting — VM:$REMOTE_PORT → localhost:$LOCAL_PORT"
echo "[tunnel] Press Ctrl+C to stop."

while true; do
  echo "[tunnel $(date '+%H:%M:%S')] Connecting…"
  SSHPASS="$VM_PASS" sshpass -e ssh \
    -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=20 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -N -R ${REMOTE_PORT}:localhost:${LOCAL_PORT} \
    ${VM_USER}@${VM_HOST}
  EXIT=$?
  echo "[tunnel $(date '+%H:%M:%S')] Disconnected (exit $EXIT). Reconnecting in 5s…"
  sleep 5
done
