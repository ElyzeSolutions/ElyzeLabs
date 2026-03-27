# Lightweight Guardrails

## Local-first Budgets
- Mandatory services in default profile: 1 (`gateway`).
- Mandatory datastore: SQLite only.
- External provider requirements: none (Voyage optional).

## Config Surface Guard
- New required env vars must include fail-fast diagnostics.
- Unknown config keys must fail startup validation.

## CI Guard
- Any change requiring non-optional external dependency in default mode fails review.
