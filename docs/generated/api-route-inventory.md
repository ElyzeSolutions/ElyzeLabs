# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `91801844c72f670484f6cb405544e47734dad80d10946af629efd2d10c2195d9`
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
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41216 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41227 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41393 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41411 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:41436 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:41488 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:41625 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:41638 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:41663 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:41689 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:41697 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:41703 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:41739 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:41756 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:41765 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41774 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41780 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:41820 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:41849 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:41866 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42730 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:42749 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42767 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:42783 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:42797 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42812 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42856 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42924 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:42967 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:43029 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:43052 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:43087 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43196 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43249 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43272 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43350 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43364 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:43509 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:43531 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:43553 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:43575 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:43616 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:43705 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:43740 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:43856 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:43862 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:43873 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:43964 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:43974 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:43985 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44006 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44028 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44139 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44178 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44267 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44379 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:44433 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:44473 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:44513 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:44545 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:44580 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:44608 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:44661 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:44698 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:44743 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:44756 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:44780 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:44817 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45697 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45720 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:45739 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45763 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45802 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:45864 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:45880 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46037 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46049 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46179 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46248 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46280 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:46504 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:46547 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:46588 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:46678 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47469 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:47518 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47610 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:47650 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:47658 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:47697 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:47729 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:47976 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:47982 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:47991 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48001 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:48074 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48154 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48304 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48346 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48379 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:48518 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:48936 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:48984 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49029 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49037 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49113 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49207 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49257 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49299 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49373 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49392 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49414 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:49431 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:49549 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:49646 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:49664 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:49805 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:49978 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:50031 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:50062 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:50093 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:50121 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50155 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50222 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50234 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50267 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50281 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50323 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50410 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:51067 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:51105 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51140 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51172 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51179 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51188 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51213 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51233 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51426 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:51505 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:51575 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:51600 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:51641 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:51899 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:51910 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:51942 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:51990 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:52027 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:52087 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:52105 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:52127 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52142 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52161 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52174 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52192 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52199 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52217 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52229 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52323 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:52403 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:52412 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:52420 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52457 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52489 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:52526 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52558 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:52632 |
| POST | `/api/browser/playwright-auth/start` | browser | no | no | packages/gateway/src/server.ts:52678 |
| POST | `/api/browser/playwright-auth/save` | browser | no | no | packages/gateway/src/server.ts:52744 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | no | packages/gateway/src/server.ts:52857 |
| POST | `/api/browser/mobile-handoff/start` | browser | no | no | packages/gateway/src/server.ts:52990 |
| GET | `/mobile-browser-handoff/:handoffId` | mobile-browser-handoff | yes | no | packages/gateway/src/server.ts:53066 |
| POST | `/api/mobile-browser-handoff/:handoffId/complete` | mobile-browser-handoff | no | no | packages/gateway/src/server.ts:53077 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:53173 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:53216 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:53495 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:53534 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:53559 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53584 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:53612 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53632 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53651 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53670 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53689 |
| POST | `/api/browser/interactive/sessions` | browser | no | yes | packages/gateway/src/server.ts:53795 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | yes | packages/gateway/src/server.ts:53956 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | yes | packages/gateway/src/server.ts:54030 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:54091 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:54249 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:54385 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:54405 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:54417 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:54436 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:54501 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54533 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54581 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:54632 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:54638 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:54726 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:54867 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:54910 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:54916 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:54922 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:54928 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:54957 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:54985 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:55003 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:55081 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:55149 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:55236 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:55370 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:55435 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:55489 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:55567 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55584 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:55626 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:55690 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:55698 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:55711 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:55724 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:58897 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:58917 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:58966 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:59000 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:59010 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:59064 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:59080 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:59129 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:59261 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:59316 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:59337 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:59350 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:59356 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:59364 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:59458 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:59472 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:59483 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:59496 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:59502 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:59575 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:59581 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:59592 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:59657 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:59806 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:59827 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:59857 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:59896 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:59949 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:59986 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:60017 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:60051 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:60080 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:60104 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:60136 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:60159 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:60188 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:60215 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:60245 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:60270 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:60288 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:60308 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:60334 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:60364 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:60370 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:60376 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:60413 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:60447 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:60462 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:60502 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:60592 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:60598 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:60651 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:60663 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60692 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60704 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:60726 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:60788 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:60836 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:60880 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:60937 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:60956 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:60965 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:60991 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:61000 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:61022 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:61031 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:61078 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:61084 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:61128 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:61162 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:61222 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:61246 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:61254 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:61313 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:61353 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:61419 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:61463 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:61504 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:61510 |
