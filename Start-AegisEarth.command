#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! docker info >/dev/null 2>&1; then
    echo 'Starting Docker Desktop…'
    docker desktop start --timeout 180
fi
docker compose up --build --wait
open http://localhost:5173
