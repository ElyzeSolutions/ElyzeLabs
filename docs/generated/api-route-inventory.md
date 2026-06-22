# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `ab3fb34ccaf8a738084b6376cd7bbda1e287570b077cc900d5af70969f617a44`
- Total routes: 299
- Documented routes: 299
- Undocumented routes: 0

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
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52939 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:53019 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:53028 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:53036 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:53073 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:53105 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:53142 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:53174 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:53248 |
| POST | `/api/browser/playwright-auth/start` | browser | no | yes | packages/gateway/src/server.ts:53294 |
| POST | `/api/browser/playwright-auth/save` | browser | no | yes | packages/gateway/src/server.ts:53360 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | yes | packages/gateway/src/server.ts:53473 |
| POST | `/api/browser/mobile-handoff/start` | browser | no | yes | packages/gateway/src/server.ts:53606 |
| GET | `/api/browser/mobile-handoff/:handoffId/status` | browser | no | yes | packages/gateway/src/server.ts:53685 |
| GET | `/mobile-browser-handoff/:handoffId` | mobile-browser-handoff | yes | yes | packages/gateway/src/server.ts:53729 |
| POST | `/api/mobile-browser-handoff/:handoffId/complete` | mobile-browser-handoff | no | yes | packages/gateway/src/server.ts:53740 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:53838 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:53881 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:54160 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:54199 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:54224 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54249 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:54277 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54297 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54316 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54335 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54354 |
| POST | `/api/browser/interactive/sessions` | browser | no | yes | packages/gateway/src/server.ts:54465 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | yes | packages/gateway/src/server.ts:54626 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | yes | packages/gateway/src/server.ts:54700 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:54761 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:54919 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:55055 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:55075 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:55087 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:55106 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:55171 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:55203 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:55251 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:55302 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:55308 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:55396 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:55537 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:55580 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55586 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:55592 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:55598 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:55627 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:55655 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:55673 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:55751 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:55819 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:55906 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:56040 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:56105 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:56159 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:56237 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:56254 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:56296 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:56360 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:56368 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:56381 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:56394 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:60161 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:60181 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:60230 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:60264 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:60274 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:60328 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:60344 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:60393 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:60525 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:60580 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:60601 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:60614 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:60620 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:60628 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:60722 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60736 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60747 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60760 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60766 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:60839 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:60845 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:60856 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:60921 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:61070 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:61091 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:61121 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:61160 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:61213 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:61250 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:61281 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:61315 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:61344 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:61368 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:61400 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:61423 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:61452 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:61479 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:61509 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:61534 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:61552 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:61572 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:61598 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:61628 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:61634 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:61640 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:61677 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61711 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61726 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:61766 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61856 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61862 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61915 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61927 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61956 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61968 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:61990 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:62052 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:62100 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:62144 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:62201 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:62220 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:62229 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:62255 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:62264 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:62286 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:62295 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:62342 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:62348 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:62392 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:62426 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:62486 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:62510 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62518 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:62577 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62617 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:62683 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:62727 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:62768 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:62774 |
