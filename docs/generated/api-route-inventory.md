# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `646709df06b87b51d7d17c7233560937fea7d42a19842106289e4df985c3908f`
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
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41514 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41525 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41691 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41709 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:41734 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:41786 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:41923 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:41936 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:41961 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:41987 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:41995 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:42001 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:42037 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:42054 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:42063 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:42072 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:42078 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:42118 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:42147 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:42164 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:43028 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:43047 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43065 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:43081 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:43095 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:43110 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43154 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43222 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:43265 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:43327 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:43350 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:43385 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43494 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43547 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43570 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43648 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43662 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:43807 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:43829 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:43851 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:43873 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:43914 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:44003 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:44038 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:44154 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:44160 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:44171 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:44262 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44272 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44283 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44304 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44326 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44437 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44476 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44565 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44677 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:44731 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:44771 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:44811 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:44843 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:44878 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:44906 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:44959 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:44996 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:45041 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:45054 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:45078 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:45115 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45995 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:46018 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:46037 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:46061 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:46100 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:46162 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:46178 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46335 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46347 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46477 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46546 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46578 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:46802 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:46845 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:46886 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:46976 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47767 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:47816 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47908 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:47948 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:47956 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:47995 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:48027 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48274 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48280 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48289 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48299 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:48372 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48452 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48602 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48644 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48677 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:48816 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:49234 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:49282 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49327 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49335 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49411 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49505 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49555 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49597 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49671 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49690 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49712 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:49729 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:49847 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:49944 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:49962 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:50103 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:50276 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:50329 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:50360 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:50391 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:50419 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50453 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50520 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50532 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50565 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50579 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50621 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50708 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:51365 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:51403 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51438 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51470 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51477 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51486 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51511 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51531 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51724 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:51803 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:51873 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:51898 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:51939 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:52197 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:52208 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:52240 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:52288 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:52325 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:52385 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:52403 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:52425 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52440 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52459 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52472 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52490 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52497 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52515 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52527 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52621 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:52701 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:52710 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:52718 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52755 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52787 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:52824 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52856 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:52930 |
| POST | `/api/browser/playwright-auth/start` | browser | no | no | packages/gateway/src/server.ts:52976 |
| POST | `/api/browser/playwright-auth/save` | browser | no | no | packages/gateway/src/server.ts:53042 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | no | packages/gateway/src/server.ts:53155 |
| POST | `/api/browser/mobile-handoff/start` | browser | no | no | packages/gateway/src/server.ts:53288 |
| GET | `/api/browser/mobile-handoff/:handoffId/status` | browser | no | no | packages/gateway/src/server.ts:53367 |
| GET | `/mobile-browser-handoff/:handoffId` | mobile-browser-handoff | yes | no | packages/gateway/src/server.ts:53411 |
| POST | `/api/mobile-browser-handoff/:handoffId/complete` | mobile-browser-handoff | no | no | packages/gateway/src/server.ts:53422 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:53520 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:53563 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:53842 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:53881 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:53906 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53931 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:53959 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53979 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53998 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54017 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54036 |
| POST | `/api/browser/interactive/sessions` | browser | no | yes | packages/gateway/src/server.ts:54147 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | yes | packages/gateway/src/server.ts:54308 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | yes | packages/gateway/src/server.ts:54382 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:54443 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:54601 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:54737 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:54757 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:54769 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:54788 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:54853 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54885 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54933 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:54984 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:54990 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:55078 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:55219 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:55262 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55268 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:55274 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:55280 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:55309 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:55337 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:55355 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:55433 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:55501 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:55588 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:55722 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:55787 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:55841 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:55919 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55936 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:55978 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:56042 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:56050 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:56063 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:56076 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:59801 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:59821 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:59870 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:59904 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:59914 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:59968 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:59984 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:60033 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:60165 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:60220 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:60241 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:60254 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:60260 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:60268 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:60362 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60376 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60387 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60400 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60406 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:60479 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:60485 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:60496 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:60561 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:60710 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:60731 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:60761 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:60800 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:60853 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:60890 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:60921 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:60955 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:60984 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:61008 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:61040 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:61063 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:61092 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:61119 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:61149 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:61174 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:61192 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:61212 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:61238 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:61268 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:61274 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:61280 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:61317 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61351 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61366 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:61406 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61496 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61502 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61555 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61567 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61596 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61608 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:61630 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:61692 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:61740 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:61784 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:61841 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:61860 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:61869 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:61895 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:61904 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:61926 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:61935 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:61982 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:61988 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:62032 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:62066 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:62126 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:62150 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62158 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:62217 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62257 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:62323 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:62367 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:62408 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:62414 |
