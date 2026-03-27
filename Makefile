SHELL := /bin/bash
COMPOSE ?= docker compose
GATEWAY_LOCAL_IMAGE ?= elyzelabs-gateway:dev

ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: help up up-build down logs bootstrap bootstrap-skills

help:
	@printf '%s\n' \
	  'make up         Pull the ElyzeLabs GHCR image and start it in the background' \
	  'make up-build   Build the ElyzeLabs gateway image from source and start it in the background' \
	  'make down       Stop the default docker compose stack' \
	  'make logs       Tail ElyzeLabs gateway logs' \
	  'make bootstrap  Clone/update Polybot and install PolyX; sync vendor skills only when a distinct repo/ref is configured' \
	  'make bootstrap-skills  Force a distinct external skills repo sync into the running stack'

up:
	@if [[ ! -f .env ]]; then \
	  echo 'Missing .env. Start from: cp .env.example .env'; \
	  exit 1; \
	fi
	$(COMPOSE) pull
	$(COMPOSE) up -d

up-build:
	@if [[ ! -f .env ]]; then \
	  echo 'Missing .env. Start from: cp .env.example .env'; \
	  exit 1; \
	fi
	DOCKER_BUILDKIT=1 docker build -f Dockerfile.gateway -t "$(GATEWAY_LOCAL_IMAGE)" .
	ELYZELABS_GATEWAY_IMAGE="$(GATEWAY_LOCAL_IMAGE)" $(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f gateway

bootstrap:
	@if [[ ! -f .env ]]; then \
	  echo 'Missing .env. Start from: cp .env.example .env'; \
	  exit 1; \
	fi
	@if [[ -z "$${GITHUB_TOKEN:-$${GH_TOKEN:-$${OPS_GITHUB_PAT:-}}}" ]]; then \
	  echo 'Missing GitHub token. Set GITHUB_TOKEN (or GH_TOKEN / OPS_GITHUB_PAT) in your shell or .env.'; \
	  exit 1; \
	fi
	./scripts/bootstrap_poly_vendor.sh --restart
	@set -euo pipefail; \
	  normalize_repo() { \
	    local value="$${1:-}"; \
	    value="$${value%/}"; \
	    value="$${value%.git}"; \
	    printf '%s' "$${value,,}"; \
	  }; \
	  baseline_repo="$${OPS_BASELINE_SKILLS_REPO:-$${BASELINE_SKILLS_REPO:-https://github.com/ElyzeSolutions/skills.git}}"; \
	  baseline_ref="$${OPS_BASELINE_SKILLS_REF:-$${BASELINE_SKILLS_REF:-main}}"; \
	  vendor_repo="$${OPS_BOOTSTRAP_SKILLS_REPO:-$${SKILLS_REPO:-$$baseline_repo}}"; \
	  vendor_ref="$${OPS_BOOTSTRAP_SKILLS_REF:-$${SKILLS_REF:-$$baseline_ref}}"; \
	  if [[ "$$(normalize_repo "$$vendor_repo")" == "$$(normalize_repo "$$baseline_repo")" && "$$vendor_ref" == "$$baseline_ref" ]]; then \
	    echo 'info: skipping vendor skills bootstrap because baseline skills are already baked in. Configure OPS_BOOTSTRAP_SKILLS_REPO/REF (or SKILLS_REPO/REF) to a different source to enable it.'; \
	  else \
	    ./scripts/bootstrap_skills_vendor.sh; \
	  fi

bootstrap-skills:
	@if [[ ! -f .env ]]; then \
	  echo 'Missing .env. Start from: cp .env.example .env'; \
	  exit 1; \
	fi
	@if [[ -z "$${OPS_BOOTSTRAP_SKILLS_REPO:-$${SKILLS_REPO:-}}" ]]; then \
	  echo 'Missing vendor skills repo. Set OPS_BOOTSTRAP_SKILLS_REPO or SKILLS_REPO first.'; \
	  exit 1; \
	fi
	./scripts/bootstrap_skills_vendor.sh
