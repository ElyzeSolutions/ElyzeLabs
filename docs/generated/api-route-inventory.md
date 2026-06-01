# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `901ebe0ed99bbe5f3d56afb711dd03c39807413cb01276f20f78f9e5b11008d3`
- Total routes: 299
- Documented routes: 292
- Undocumented routes: 7

## Methods

| Method | Count |
| --- | ---: |
| DELETE | 6 |
| GET | 122 |
| PATCH | 9 |
| POST | 148 |
| PUT | 14 |

## Areas

| Area | Count |
| --- | ---: |
| browser | 37 |
| frontier | 37 |
| backlog | 23 |
| sessions | 16 |
| skills | 16 |
| runs | 13 |
| schedules | 12 |
| agents | 10 |
| github | 10 |
| vault | 10 |
| remediation | 8 |
| memory | 7 |
| onboarding | 7 |
| certification | 6 |
| delivery-groups | 6 |
| improvement | 6 |
| llm | 6 |
| housekeeping | 5 |
| watchdog | 5 |
| bff | 4 |
| local | 4 |
| config | 3 |
| continuity | 3 |
| pairings | 3 |
| sandbox | 3 |
| telegram | 3 |
| doctor | 2 |
| events | 2 |
| health | 2 |
| mobile-browser-handoff | 2 |
| office | 2 |
| rbac | 2 |
| security | 2 |
| startup-healer | 2 |
| tools | 2 |
| trajectories | 2 |
| * | 1 |
| audit | 1 |
| auth | 1 |
| backup | 1 |
| bootstrap | 1 |
| capabilities | 1 |
| context-graph | 1 |
| cron | 1 |
| docs | 1 |
| hello | 1 |
| ingress | 1 |
| messages | 1 |
| metrics | 1 |
| openapi | 1 |
| queue | 1 |
| root | 1 |

## Documentation-Only Routes

- None

## Routes

| Method | Path | Area | Public | Documented | Source |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41557 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41568 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41734 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41752 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:41777 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:41829 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:41966 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:41979 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:42004 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:42030 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:42038 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:42044 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:42080 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:42097 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:42106 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:42115 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:42121 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:42161 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:42190 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:42207 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:43071 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:43090 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43108 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:43124 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:43138 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:43153 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43197 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43265 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:43308 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:43370 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:43393 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:43428 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43537 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43590 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43613 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43691 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43705 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:43850 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:43872 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:43894 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:43916 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:43957 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:44046 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:44081 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:44197 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:44203 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:44214 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:44305 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44315 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44326 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44347 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44369 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44480 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44519 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44608 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44720 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:44774 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:44814 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:44854 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:44886 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:44921 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:44949 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:45002 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:45039 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:45084 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:45097 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:45121 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:45158 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:46038 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:46061 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:46080 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:46104 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:46143 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:46205 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:46221 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46378 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46390 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46520 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46589 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46621 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:46845 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:46888 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:46929 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:47019 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47810 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:47859 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47951 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:47991 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:47999 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:48038 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:48070 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48317 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48323 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48332 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48342 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:48415 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48495 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48645 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48687 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48720 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:48859 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:49277 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:49325 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49370 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49378 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49454 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49548 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49598 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49640 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49714 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49733 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49755 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:49772 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:49890 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:49987 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:50005 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:50146 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:50319 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:50372 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:50403 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:50434 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:50462 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50496 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50563 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50575 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50608 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50622 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50664 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50751 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:51408 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:51446 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51481 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51513 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51520 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51529 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51554 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51574 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51767 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:51846 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:51916 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:51941 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:51982 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:52242 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:52253 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:52285 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:52333 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:52370 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:52430 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:52448 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:52470 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52485 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52504 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52517 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52535 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52542 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52560 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52572 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52666 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:52746 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:52755 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:52763 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52800 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52832 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:52869 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52901 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:52975 |
| POST | `/api/browser/playwright-auth/start` | browser | no | no | packages/gateway/src/server.ts:53021 |
| POST | `/api/browser/playwright-auth/save` | browser | no | no | packages/gateway/src/server.ts:53087 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | no | packages/gateway/src/server.ts:53200 |
| POST | `/api/browser/mobile-handoff/start` | browser | no | no | packages/gateway/src/server.ts:53333 |
| GET | `/api/browser/mobile-handoff/:handoffId/status` | browser | no | no | packages/gateway/src/server.ts:53412 |
| GET | `/mobile-browser-handoff/:handoffId` | mobile-browser-handoff | yes | no | packages/gateway/src/server.ts:53456 |
| POST | `/api/mobile-browser-handoff/:handoffId/complete` | mobile-browser-handoff | no | no | packages/gateway/src/server.ts:53467 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:53565 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:53608 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:53887 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:53926 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:53951 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53976 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:54004 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54024 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54043 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54062 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54081 |
| POST | `/api/browser/interactive/sessions` | browser | no | yes | packages/gateway/src/server.ts:54192 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | yes | packages/gateway/src/server.ts:54353 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | yes | packages/gateway/src/server.ts:54427 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:54488 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:54646 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:54782 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:54802 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:54814 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:54833 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:54898 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54930 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54978 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:55029 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:55035 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:55123 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:55264 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:55307 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55313 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:55319 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:55325 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:55354 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:55382 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:55400 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:55478 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:55546 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:55633 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:55767 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:55832 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:55886 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:55964 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55981 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:56023 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:56087 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:56095 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:56108 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:56121 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:59846 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:59866 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:59915 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:59949 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:59959 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:60013 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:60029 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:60078 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:60210 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:60265 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:60286 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:60299 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:60305 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:60313 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:60407 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60421 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60432 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60445 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60451 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:60524 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:60530 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:60541 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:60606 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:60755 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:60776 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:60806 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:60845 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:60898 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:60935 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:60966 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:61000 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:61029 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:61053 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:61085 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:61108 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:61137 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:61164 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:61194 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:61219 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:61237 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:61257 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:61283 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:61313 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:61319 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:61325 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:61362 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61396 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61411 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:61451 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61541 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61547 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61600 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61612 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61641 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61653 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:61675 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:61737 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:61785 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:61829 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:61886 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:61905 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:61914 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:61940 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:61949 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:61971 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:61980 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:62027 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:62033 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:62077 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:62111 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:62171 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:62195 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62203 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:62262 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62302 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:62368 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:62412 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:62453 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:62459 |
