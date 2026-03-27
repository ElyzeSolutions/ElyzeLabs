#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}
GATEWAY_IMAGE=${GATEWAY_IMAGE:-elyzelabs-gateway:smoke}

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not available; skipping docker smoke."
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon unavailable; skipping docker smoke."
  exit 0
fi

DOCKER_BUILDKIT=1 docker build -f Dockerfile.gateway -t "$GATEWAY_IMAGE" .

ELYZELABS_GATEWAY_IMAGE="$GATEWAY_IMAGE" docker compose -f "$COMPOSE_FILE" up -d
trap 'ELYZELABS_GATEWAY_IMAGE="$GATEWAY_IMAGE" docker compose -f "$COMPOSE_FILE" down -v' EXIT

for _ in {1..40}; do
  if curl -fsS "http://localhost:8788/health" >/tmp/ops-health.json; then
    break
  fi
  sleep 2
done

test -s /tmp/ops-health.json
curl -fsS "http://localhost:8788" >/tmp/ops-dashboard.html

grep -qi "<html" /tmp/ops-dashboard.html

echo "docker smoke passed"
