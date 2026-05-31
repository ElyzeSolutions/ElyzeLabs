# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `48861ca937c5e06457a2eb6a6223ecf47598385f2d7b04d0565ddf4454cf868c`
- Total routes: 292
- Documented routes: 289
- Undocumented routes: 3

## Methods

| Method | Count |
| --- | ---: |
| DELETE | 5 |
| GET | 120 |
| PATCH | 9 |
| POST | 144 |
| PUT | 14 |

## Areas

| Area | Count |
| --- | ---: |
| frontier | 37 |
| browser | 32 |
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
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41080 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41091 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41257 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41275 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:41300 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:41352 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:41489 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:41502 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:41527 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:41553 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:41561 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:41567 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:41603 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:41620 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:41629 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41638 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41644 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:41684 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:41713 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:41730 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42594 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:42613 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42631 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:42647 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:42661 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42676 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42720 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42788 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:42831 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:42893 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:42916 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:42951 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43060 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43113 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43136 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43214 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43228 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:43373 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:43395 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:43417 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:43439 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:43480 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:43569 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:43604 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:43720 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:43726 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:43737 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:43828 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:43838 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:43849 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:43870 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:43892 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44003 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44042 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44131 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44243 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:44297 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:44337 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:44377 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:44409 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:44444 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:44472 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:44525 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:44562 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:44607 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:44620 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:44644 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:44681 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45561 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45584 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:45603 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45627 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45666 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:45728 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:45744 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:45901 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:45913 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46043 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46112 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46144 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:46368 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:46411 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:46452 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:46542 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47333 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:47382 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47474 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:47514 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:47522 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:47561 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:47593 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:47840 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:47846 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:47855 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:47865 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:47938 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48018 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48168 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48210 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48243 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:48382 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:48800 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:48848 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:48893 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:48901 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:48977 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49071 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49121 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49163 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49237 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49256 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49278 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:49295 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:49413 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:49510 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:49528 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:49669 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:49842 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:49895 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:49926 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:49957 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:49985 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50019 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50086 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50098 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50131 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50145 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50187 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50274 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:50931 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:50969 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51004 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51036 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51043 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51052 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51077 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51097 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51290 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:51369 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:51439 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:51464 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:51505 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:51763 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:51774 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:51806 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:51854 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:51891 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:51951 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:51969 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:51991 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52006 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52025 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52038 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52056 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52063 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52081 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52093 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52187 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:52267 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:52276 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:52284 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52321 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52353 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:52390 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52422 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:52492 |
| POST | `/api/browser/playwright-auth/start` | browser | no | no | packages/gateway/src/server.ts:52538 |
| POST | `/api/browser/playwright-auth/save` | browser | no | no | packages/gateway/src/server.ts:52604 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | no | packages/gateway/src/server.ts:52717 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:52849 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:52892 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:53160 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:53199 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:53224 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53249 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:53277 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53297 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53316 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53335 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53354 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:53424 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:53574 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:53710 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:53730 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:53742 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:53761 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:53826 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:53858 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:53906 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:53957 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:53963 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:54051 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:54192 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:54235 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:54241 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:54247 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:54253 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:54282 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:54310 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:54328 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:54406 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:54474 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:54561 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:54695 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:54760 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:54814 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:54892 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:54909 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:54951 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:55015 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:55023 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:55036 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:55049 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:58222 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:58242 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:58291 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:58325 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:58335 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:58389 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:58405 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:58454 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:58586 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:58641 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:58662 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:58675 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:58681 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:58689 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:58783 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:58797 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:58808 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:58821 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:58827 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:58900 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:58906 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:58917 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:58982 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:59131 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:59152 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:59182 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:59221 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:59274 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:59311 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:59342 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:59376 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:59405 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:59429 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:59461 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:59484 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:59513 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:59540 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:59570 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:59595 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:59613 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:59633 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:59659 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:59689 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:59695 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:59701 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:59738 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:59772 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:59787 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:59827 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:59917 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:59923 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:59976 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:59988 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60017 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60029 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:60051 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:60113 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:60161 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:60205 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:60262 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:60281 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:60290 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:60316 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:60325 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:60347 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:60356 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:60403 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:60409 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:60453 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:60487 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:60547 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:60571 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:60579 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:60638 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:60678 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:60744 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:60788 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:60829 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:60835 |
