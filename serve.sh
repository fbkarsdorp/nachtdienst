#!/bin/sh
# Serves the game on http://localhost:8137/
cd "$(dirname "$0")/game" && exec python3 -m http.server "${1:-8137}"
