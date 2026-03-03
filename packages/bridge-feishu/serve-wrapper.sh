#!/bin/bash
# pm2 wrapper for research serve
export TERM=xterm-256color
export HOME="$HOME"
exec "$HOME/.bun/bin/research" serve --port "${RESEARCH_PORT:-4096}"
