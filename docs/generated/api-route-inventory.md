# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `fbcd783e2ba8fe5244031b54bbeb79c29f5fee7c113015258ab164cbfbb02a38`
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
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41088 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41099 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41265 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41283 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:41308 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:41360 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:41497 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:41510 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:41535 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:41561 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:41569 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:41575 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:41611 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:41628 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:41637 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41646 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41652 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:41692 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:41721 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:41738 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42602 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:42621 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42639 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:42655 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:42669 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42684 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42728 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42796 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:42839 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:42901 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:42924 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:42959 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43068 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43121 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43144 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43222 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43236 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:43381 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:43403 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:43425 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:43447 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:43488 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:43577 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:43612 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:43728 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:43734 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:43745 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:43836 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:43846 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:43857 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:43878 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:43900 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44011 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44050 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44139 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44251 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:44305 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:44345 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:44385 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:44417 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:44452 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:44480 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:44533 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:44570 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:44615 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:44628 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:44652 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:44689 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45569 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45592 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:45611 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45635 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45674 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:45736 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:45752 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:45909 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:45921 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46051 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46120 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46152 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:46376 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:46419 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:46460 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:46550 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47341 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:47390 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47482 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:47522 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:47530 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:47569 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:47601 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:47848 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:47854 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:47863 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:47873 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:47946 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48026 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48176 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48218 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48251 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:48390 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:48808 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:48856 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:48901 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:48909 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:48985 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49079 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49129 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49171 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49245 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49264 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49286 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:49303 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:49421 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:49518 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:49536 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:49677 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:49850 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:49903 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:49934 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:49965 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:49993 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50027 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50094 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50106 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50139 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50153 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50195 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50282 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:50939 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:50977 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51012 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51044 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51051 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51060 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51085 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51105 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51298 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:51377 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:51447 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:51472 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:51513 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:51771 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:51782 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:51814 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:51862 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:51899 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:51959 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:51977 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:51999 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52014 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52033 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52046 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52064 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52071 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52089 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52101 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52195 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:52275 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:52284 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:52292 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52329 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52361 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:52398 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52430 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:52504 |
| POST | `/api/browser/playwright-auth/start` | browser | no | no | packages/gateway/src/server.ts:52550 |
| POST | `/api/browser/playwright-auth/save` | browser | no | no | packages/gateway/src/server.ts:52616 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | no | packages/gateway/src/server.ts:52729 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:52862 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:52905 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:53184 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:53223 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:53248 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53273 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:53301 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53321 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53340 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53359 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53378 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:53449 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:53607 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:53743 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:53763 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:53775 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:53794 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:53859 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:53891 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:53939 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:53990 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:53996 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:54084 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:54225 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:54268 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:54274 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:54280 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:54286 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:54315 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:54343 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:54361 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:54439 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:54507 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:54594 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:54728 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:54793 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:54847 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:54925 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:54942 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:54984 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:55048 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:55056 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:55069 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:55082 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:58255 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:58275 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:58324 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:58358 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:58368 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:58422 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:58438 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:58487 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:58619 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:58674 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:58695 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:58708 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:58714 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:58722 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:58816 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:58830 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:58841 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:58854 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:58860 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:58933 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:58939 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:58950 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:59015 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:59164 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:59185 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:59215 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:59254 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:59307 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:59344 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:59375 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:59409 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:59438 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:59462 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:59494 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:59517 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:59546 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:59573 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:59603 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:59628 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:59646 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:59666 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:59692 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:59722 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:59728 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:59734 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:59771 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:59805 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:59820 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:59860 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:59950 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:59956 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:60009 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:60021 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60050 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60062 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:60084 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:60146 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:60194 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:60238 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:60295 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:60314 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:60323 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:60349 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:60358 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:60380 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:60389 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:60436 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:60442 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:60486 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:60520 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:60580 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:60604 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:60612 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:60671 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:60711 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:60777 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:60821 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:60862 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:60868 |
