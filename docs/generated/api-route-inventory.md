# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `363df3804c92aaddb046991442e6ac231e9a469e2e9e5701b6141438e803af74`
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
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41374 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41385 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41551 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41569 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:41594 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:41646 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:41783 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:41796 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:41821 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:41847 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:41855 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:41861 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:41897 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:41914 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:41923 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41932 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41938 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:41978 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:42007 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:42024 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42888 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:42907 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42925 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:42941 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:42955 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42970 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43014 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43082 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:43125 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:43187 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:43210 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:43245 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43354 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43407 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43430 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43508 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43522 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:43667 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:43689 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:43711 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:43733 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:43774 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:43863 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:43898 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:44014 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:44020 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:44031 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:44122 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44132 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44143 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44164 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44186 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44297 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44336 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44425 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44537 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:44591 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:44631 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:44671 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:44703 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:44738 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:44766 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:44819 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:44856 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:44901 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:44914 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:44938 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:44975 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45855 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45878 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:45897 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45921 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45960 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:46022 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:46038 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46195 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46207 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46337 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46406 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46438 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:46662 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:46705 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:46746 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:46836 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47627 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:47676 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47768 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:47808 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:47816 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:47855 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:47887 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48134 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48140 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48149 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48159 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:48232 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48312 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48462 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48504 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48537 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:48676 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:49094 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:49142 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49187 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49195 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49271 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49365 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49415 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49457 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49531 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49550 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49572 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:49589 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:49707 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:49804 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:49822 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:49963 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:50136 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:50189 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:50220 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:50251 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:50279 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50313 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50380 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50392 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50425 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50439 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50481 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50568 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:51225 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:51263 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51298 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51330 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51337 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51346 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51371 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51391 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51584 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:51663 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:51733 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:51758 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:51799 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:52057 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:52068 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:52100 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:52148 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:52185 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:52245 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:52263 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:52285 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52300 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52319 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52332 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52350 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52357 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52375 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52387 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52481 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:52561 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:52570 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:52578 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52615 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52647 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:52684 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52716 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:52790 |
| POST | `/api/browser/playwright-auth/start` | browser | no | no | packages/gateway/src/server.ts:52836 |
| POST | `/api/browser/playwright-auth/save` | browser | no | no | packages/gateway/src/server.ts:52902 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | no | packages/gateway/src/server.ts:53015 |
| POST | `/api/browser/mobile-handoff/start` | browser | no | no | packages/gateway/src/server.ts:53148 |
| GET | `/api/browser/mobile-handoff/:handoffId/status` | browser | no | no | packages/gateway/src/server.ts:53227 |
| GET | `/mobile-browser-handoff/:handoffId` | mobile-browser-handoff | yes | no | packages/gateway/src/server.ts:53271 |
| POST | `/api/mobile-browser-handoff/:handoffId/complete` | mobile-browser-handoff | no | no | packages/gateway/src/server.ts:53282 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:53380 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:53423 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:53702 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:53741 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:53766 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53791 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:53819 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53839 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53858 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53877 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53896 |
| POST | `/api/browser/interactive/sessions` | browser | no | yes | packages/gateway/src/server.ts:54007 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | yes | packages/gateway/src/server.ts:54168 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | yes | packages/gateway/src/server.ts:54242 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:54303 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:54461 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:54597 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:54617 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:54629 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:54648 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:54713 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54745 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54793 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:54844 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:54850 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:54938 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:55079 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:55122 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55128 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:55134 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:55140 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:55169 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:55197 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:55215 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:55293 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:55361 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:55448 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:55582 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:55647 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:55701 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:55779 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55796 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:55838 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:55902 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:55910 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:55923 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:55936 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:59618 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:59638 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:59687 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:59721 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:59731 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:59785 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:59801 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:59850 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:59982 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:60037 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:60058 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:60071 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:60077 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:60085 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:60179 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60193 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60204 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60217 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60223 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:60296 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:60302 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:60313 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:60378 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:60527 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:60548 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:60578 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:60617 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:60670 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:60707 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:60738 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:60772 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:60801 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:60825 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:60857 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:60880 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:60909 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:60936 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:60966 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:60991 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:61009 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:61029 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:61055 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:61085 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:61091 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:61097 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:61134 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61168 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61183 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:61223 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61313 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61319 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61372 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61384 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61413 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61425 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:61447 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:61509 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:61557 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:61601 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:61658 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:61677 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:61686 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:61712 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:61721 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:61743 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:61752 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:61799 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:61805 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:61849 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:61883 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:61943 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:61967 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:61975 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:62034 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62074 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:62140 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:62184 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:62225 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:62231 |
