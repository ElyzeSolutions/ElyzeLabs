# Best-In-Class Capability Matrix

Generated from `docs/best-in-class-capability-matrix.json` by `pnpm best-in-class:matrix`.

## Summary

- Schema: `ops.best-in-class-audit.v1`
- Source hash: `69a97a64054a00fc0c7bf6cc807ac735847f4f3affb775c65b8e53d22cc7cf0a`
- Updated at: 2026-05-31
- Readiness: `ready`
- Capabilities: 10
- Required for best-in-class: 9
- Required gaps: 0
- Deferred: 1

## Status Counts

| Status | Count |
| --- | ---: |
| ahead | 2 |
| parity | 7 |
| partial | 0 |
| missing | 0 |
| defer | 1 |

## Required Gaps

No required gaps remain.

## Matrix

| Capability | Area | Priority | Required | Status | Evidence | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| prompt_source_authority | system_prompt | P0 | yes | ahead | packages/gateway/src/prompt-governance.ts<br>packages/gateway/src/context-assembly.ts<br>packages/gateway/src/server.ts<br>packages/runtime/src/manager.ts<br>docs/system-prompt-comparison.md | pnpm exec vitest run --config vitest.config.ts packages/gateway/test/unit/prompt-governance.test.ts packages/gateway/test/unit/context-assembly.test.ts packages/runtime/test/unit/runtime-manager.test.ts<br>test: packages/gateway/test/unit/prompt-governance.test.ts<br>test: packages/gateway/test/unit/context-assembly.test.ts<br>test: packages/runtime/test/unit/runtime-manager.test.ts |
| memory_write_governance | memory | P0 | yes | ahead | packages/memory/src/service.ts<br>packages/memory/src/index.ts<br>packages/gateway/src/server.ts<br>docs/system-prompt-comparison.md | pnpm exec vitest run --config vitest.config.ts packages/memory/test/unit/memory-service.test.ts packages/gateway/test/integration/telegram-prompt-governance.test.ts<br>test: packages/memory/test/unit/memory-service.test.ts<br>test: packages/gateway/test/integration/telegram-prompt-governance.test.ts |
| telegram_live_smoke | telegram | P0 | yes | parity | packages/gateway/src/server.ts<br>packages/gateway/test/integration/telegram-prompt-governance.test.ts<br>packages/gateway/test/integration/telegram-smoke-test.test.ts<br>docs/api-contract.md | pnpm exec vitest run --config vitest.config.ts packages/gateway/test/integration/telegram-smoke-test.test.ts packages/gateway/test/integration/telegram-prompt-governance.test.ts<br>test: packages/gateway/test/integration/telegram-smoke-test.test.ts<br>test: packages/gateway/test/integration/telegram-prompt-governance.test.ts |
| sandbox_policy_profiles | sandbox | P0 | yes | parity | packages/config/src/schema.ts<br>packages/config/src/loader.ts<br>packages/gateway/src/sandbox-policy.ts<br>packages/gateway/src/server.ts<br>packages/runtime/src/adapters.ts<br>packages/runtime/test/unit/runtime-manager.test.ts<br>dashboard/src/pages/DoctorCenterPage.tsx | pnpm exec vitest run --config vitest.config.ts packages/gateway/test/unit/sandbox-policy.test.ts packages/config/test/unit/config.test.ts packages/gateway/test/integration/doctor-center.test.ts packages/runtime/test/unit/runtime-manager.test.ts<br>test: packages/gateway/test/unit/sandbox-policy.test.ts<br>test: packages/config/test/unit/config.test.ts<br>test: packages/gateway/test/integration/doctor-center.test.ts<br>test: packages/runtime/test/unit/runtime-manager.test.ts |
| tool_skill_lifecycle | tools_skills | P1 | yes | parity | packages/skills/src/registry.ts<br>packages/gateway/src/prompt-governance.ts<br>packages/gateway/src/server.ts<br>packages/gateway/test/integration/doctor-center.test.ts<br>dashboard/src/pages/SkillsPage.tsx | pnpm exec vitest run --config vitest.config.ts packages/skills/test/unit/registry.test.ts packages/gateway/test/integration/skill-lifecycle.test.ts packages/gateway/test/integration/doctor-center.test.ts packages/gateway/test/unit/prompt-governance.test.ts<br>test: packages/skills/test/unit/registry.test.ts<br>test: packages/gateway/test/integration/skill-lifecycle.test.ts<br>test: packages/gateway/test/integration/doctor-center.test.ts<br>test: packages/gateway/test/unit/prompt-governance.test.ts |
| api_route_contract_governance | api_governance | P0 | yes | parity | scripts/runtime/route-inventory.ts<br>docs/generated/api-route-inventory.md<br>docs/generated/api-route-inventory.json<br>docs/api-contract.md | pnpm api:inventory:check<br>pnpm exec vitest run --config vitest.config.ts packages/gateway/test/unit/route-inventory.test.ts<br>test: packages/gateway/test/unit/route-inventory.test.ts |
| channel_adapter_abstraction | channels | P1 | yes | parity | packages/gateway/src/channel-adapter.ts<br>packages/gateway/src/server.ts<br>packages/gateway/test/unit/channel-adapter.test.ts<br>packages/gateway/test/integration/telegram-smoke-test.test.ts<br>docs/competitor-feature-analysis.md | pnpm exec vitest run --config vitest.config.ts packages/gateway/test/unit/channel-adapter.test.ts packages/gateway/test/integration/telegram-smoke-test.test.ts<br>test: packages/gateway/test/unit/channel-adapter.test.ts<br>test: packages/gateway/test/integration/telegram-smoke-test.test.ts |
| managed_browser_profile | browser | P1 | yes | parity | packages/gateway/src/browser-service.ts<br>packages/gateway/src/server.ts<br>dashboard/src/pages/BrowserPage.tsx<br>packages/gateway/test/unit/browser-service.test.ts<br>packages/gateway/test/integration/browser-api.test.ts<br>packages/gateway/test/integration/browser-managed-profiles.test.ts | pnpm exec vitest run --config vitest.config.ts packages/gateway/test/unit/browser-service.test.ts packages/gateway/test/integration/browser-api.test.ts packages/gateway/test/integration/browser-managed-profiles.test.ts dashboard/src/pages/BrowserPage.test.tsx<br>test: packages/gateway/test/unit/browser-service.test.ts<br>test: packages/gateway/test/integration/browser-api.test.ts<br>test: packages/gateway/test/integration/browser-managed-profiles.test.ts<br>test: dashboard/src/pages/BrowserPage.test.tsx |
| model_failover_profiles | llm_routing | P2 | yes | parity | packages/gateway/src/llm-failover-profiles.ts<br>packages/gateway/src/server.ts<br>packages/runtime/src/adapters.ts<br>packages/runtime/src/types.ts<br>dashboard/src/pages/CostControlPage.tsx<br>docs/api-contract.md | pnpm exec vitest run --config vitest.config.ts packages/gateway/test/integration/model-routing.test.ts<br>test: packages/gateway/test/integration/model-routing.test.ts |
| device_node_protocol | realtime_gateway | P2 | no | defer | docs/competitor-feature-analysis.md<br>packages/gateway/src/server.ts | not required for current status |

## Competitors

| Competitor | Path | Focus |
| --- | --- | --- |
| Hermes Agent | /Users/p4r4disi4c/Documents/ROADMAP/hermes-agent | prompt layering; skill curation; scheduled automation discipline; multi-channel operations; terminal ergonomics |
| NemoClaw | /Users/p4r4disi4c/Documents/ROADMAP/NemoClaw | sandbox policy tiers; deny-by-default egress; endpoint groups; blueprint lifecycle; operator approval loops |
| OpenClaw | /Users/p4r4disi4c/Documents/ROADMAP/openclaw | device/node gateway protocol; channel routing; DM pairing; managed browser profile; doctor/onboarding breadth; model failover |
