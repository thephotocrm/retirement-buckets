#!/bin/bash
# Double-click to start the Income Growth Bucket Diagram server.
# Closes when you press Ctrl+C in the terminal window.

set -e
cd "$(dirname "$0")"

PORT="${PORT:-5173}"

# If something is already on the port, kill it so we don't get EADDRINUSE.
if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
  echo "Port $PORT in use; stopping the existing process..."
  lsof -ti tcp:"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# Open the browser once the server has had a moment to bind.
( sleep 1.5 && open "http://127.0.0.1:$PORT" ) &

echo "Starting Income Growth Bucket Diagram on http://127.0.0.1:$PORT"
echo "Press Ctrl+C to stop."
echo
exec node server.mjs
