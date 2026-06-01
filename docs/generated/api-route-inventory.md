# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `456e02b7744c658593d1a9167e4b375f2ca6fb50d13d41d89be225c2a48669b6`
- Total routes: 298
- Documented routes: 292
- Undocumented routes: 6

## Methods

| Method | Count |
| --- | ---: |
| DELETE | 6 |
| GET | 121 |
| PATCH | 9 |
| POST | 148 |
| PUT | 14 |

## Areas

| Area | Count |
| --- | ---: |
| frontier | 37 |
| browser | 36 |
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
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41342 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41353 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41519 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41537 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:41562 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:41614 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:41751 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:41764 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:41789 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:41815 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:41823 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:41829 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:41865 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:41882 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:41891 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41900 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41906 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:41946 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:41975 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:41992 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42856 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:42875 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42893 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:42909 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:42923 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42938 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42982 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43050 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:43093 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:43155 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:43178 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:43213 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43322 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43375 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43398 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43476 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43490 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:43635 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:43657 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:43679 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:43701 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:43742 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:43831 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:43866 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:43982 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:43988 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:43999 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:44090 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44100 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44111 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44132 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44154 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44265 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44304 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44393 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44505 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:44559 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:44599 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:44639 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:44671 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:44706 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:44734 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:44787 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:44824 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:44869 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:44882 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:44906 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:44943 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45823 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45846 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:45865 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45889 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45928 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:45990 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:46006 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46163 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46175 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46305 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46374 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46406 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:46630 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:46673 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:46714 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:46804 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47595 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:47644 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47736 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:47776 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:47784 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:47823 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:47855 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48102 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48108 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48117 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48127 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:48200 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48280 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48430 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48472 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48505 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:48644 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:49062 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:49110 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49155 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49163 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49239 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49333 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49383 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49425 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49499 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49518 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49540 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:49557 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:49675 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:49772 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:49790 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:49931 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:50104 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:50157 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:50188 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:50219 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:50247 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50281 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50348 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50360 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50393 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50407 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50449 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50536 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:51193 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:51231 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51266 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51298 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51305 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51314 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51339 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51359 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51552 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:51631 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:51701 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:51726 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:51767 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:52025 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:52036 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:52068 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:52116 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:52153 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:52213 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:52231 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:52253 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52268 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52287 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52300 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52318 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52325 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52343 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52355 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52449 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:52529 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:52538 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:52546 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52583 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52615 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:52652 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52684 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:52758 |
| POST | `/api/browser/playwright-auth/start` | browser | no | no | packages/gateway/src/server.ts:52804 |
| POST | `/api/browser/playwright-auth/save` | browser | no | no | packages/gateway/src/server.ts:52870 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | no | packages/gateway/src/server.ts:52983 |
| POST | `/api/browser/mobile-handoff/start` | browser | no | no | packages/gateway/src/server.ts:53116 |
| GET | `/mobile-browser-handoff/:handoffId` | mobile-browser-handoff | yes | no | packages/gateway/src/server.ts:53192 |
| POST | `/api/mobile-browser-handoff/:handoffId/complete` | mobile-browser-handoff | no | no | packages/gateway/src/server.ts:53203 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:53299 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:53342 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:53621 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:53660 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:53685 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53710 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:53738 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53758 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53777 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53796 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53815 |
| POST | `/api/browser/interactive/sessions` | browser | no | yes | packages/gateway/src/server.ts:53922 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | yes | packages/gateway/src/server.ts:54083 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | yes | packages/gateway/src/server.ts:54157 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:54218 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:54376 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:54512 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:54532 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:54544 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:54563 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:54628 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54660 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54708 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:54759 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:54765 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:54853 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:54994 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:55037 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55043 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:55049 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:55055 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:55084 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:55112 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:55130 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:55208 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:55276 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:55363 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:55497 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:55562 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:55616 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:55694 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55711 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:55753 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:55817 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:55825 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:55838 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:55851 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:59416 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:59436 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:59485 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:59519 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:59529 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:59583 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:59599 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:59648 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:59780 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:59835 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:59856 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:59869 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:59875 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:59883 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:59977 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:59991 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60002 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60015 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60021 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:60094 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:60100 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:60111 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:60176 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:60325 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:60346 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:60376 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:60415 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:60468 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:60505 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:60536 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:60570 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:60599 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:60623 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:60655 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:60678 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:60707 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:60734 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:60764 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:60789 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:60807 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:60827 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:60853 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:60883 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:60889 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:60895 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:60932 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:60966 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:60981 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:61021 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61111 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61117 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61170 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61182 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61211 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61223 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:61245 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:61307 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:61355 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:61399 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:61456 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:61475 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:61484 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:61510 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:61519 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:61541 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:61550 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:61597 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:61603 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:61647 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:61681 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:61741 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:61765 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:61773 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:61832 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:61872 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:61938 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:61982 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:62023 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:62029 |
