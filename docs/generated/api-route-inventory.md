# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `260d31c0dda4c2a962274f5936715160d33e67c0696b8e3335c89b7a71501c96`
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
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41785 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41796 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41962 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41980 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:42005 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:42057 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:42194 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:42207 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:42232 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:42258 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:42266 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:42272 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:42308 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:42325 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:42334 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:42343 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:42349 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:42389 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:42418 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:42435 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:43299 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:43318 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43336 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:43352 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:43366 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:43381 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43425 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43493 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:43536 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:43598 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:43621 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:43656 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43765 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43818 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43841 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43919 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43933 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:44078 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:44100 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:44122 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:44144 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:44185 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:44274 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:44309 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:44425 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:44431 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:44442 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:44533 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44543 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44554 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44575 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44597 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44708 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44747 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44836 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44948 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:45002 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:45042 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:45082 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:45114 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:45149 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:45177 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:45230 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:45267 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:45312 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:45325 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:45349 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:45386 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:46266 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:46289 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:46308 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:46332 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:46371 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:46433 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:46449 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46606 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46618 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46748 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46817 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46849 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:47073 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:47116 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:47157 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:47247 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:48038 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:48087 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:48179 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:48219 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:48227 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:48266 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:48298 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48545 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48551 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48560 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48570 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:48643 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48723 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48873 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48915 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48948 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:49087 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:49505 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:49553 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49598 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49606 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49682 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49776 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49826 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49868 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49942 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49961 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49983 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:50000 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:50118 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:50215 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:50233 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:50374 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:50547 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:50600 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:50631 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:50662 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:50690 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50724 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50791 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50803 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50836 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50850 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50892 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50979 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:51636 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:51674 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51709 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51741 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51748 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51757 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51782 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51802 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51995 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:52074 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:52144 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:52169 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:52216 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:52476 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:52487 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:52519 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:52567 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:52604 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:52664 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:52682 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:52704 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52719 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52738 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52751 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52769 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52776 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52794 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52806 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52900 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:52980 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:52989 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:52997 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:53034 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:53066 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:53103 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:53135 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:53209 |
| POST | `/api/browser/playwright-auth/start` | browser | no | no | packages/gateway/src/server.ts:53255 |
| POST | `/api/browser/playwright-auth/save` | browser | no | no | packages/gateway/src/server.ts:53321 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | no | packages/gateway/src/server.ts:53434 |
| POST | `/api/browser/mobile-handoff/start` | browser | no | no | packages/gateway/src/server.ts:53567 |
| GET | `/api/browser/mobile-handoff/:handoffId/status` | browser | no | no | packages/gateway/src/server.ts:53646 |
| GET | `/mobile-browser-handoff/:handoffId` | mobile-browser-handoff | yes | no | packages/gateway/src/server.ts:53690 |
| POST | `/api/mobile-browser-handoff/:handoffId/complete` | mobile-browser-handoff | no | no | packages/gateway/src/server.ts:53701 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:53799 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:53842 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:54121 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:54160 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:54185 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54210 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:54238 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54258 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54277 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54296 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54315 |
| POST | `/api/browser/interactive/sessions` | browser | no | yes | packages/gateway/src/server.ts:54426 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | yes | packages/gateway/src/server.ts:54587 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | yes | packages/gateway/src/server.ts:54661 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:54722 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:54880 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:55016 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:55036 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:55048 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:55067 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:55132 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:55164 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:55212 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:55263 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:55269 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:55357 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:55498 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:55541 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55547 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:55553 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:55559 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:55588 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:55616 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:55634 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:55712 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:55780 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:55867 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:56001 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:56066 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:56120 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:56198 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:56215 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:56257 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:56321 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:56329 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:56342 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:56355 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:60080 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:60100 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:60149 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:60183 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:60193 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:60247 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:60263 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:60312 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:60444 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:60499 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:60520 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:60533 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:60539 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:60547 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:60641 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60655 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60666 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60679 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60685 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:60758 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:60764 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:60775 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:60840 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:60989 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:61010 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:61040 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:61079 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:61132 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:61169 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:61200 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:61234 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:61263 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:61287 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:61319 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:61342 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:61371 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:61398 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:61428 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:61453 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:61471 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:61491 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:61517 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:61547 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:61553 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:61559 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:61596 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61630 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61645 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:61685 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61775 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61781 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61834 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61846 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61875 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61887 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:61909 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:61971 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:62019 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:62063 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:62120 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:62139 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:62148 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:62174 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:62183 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:62205 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:62214 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:62261 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:62267 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:62311 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:62345 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:62405 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:62429 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62437 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:62496 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62536 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:62602 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:62646 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:62687 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:62693 |
