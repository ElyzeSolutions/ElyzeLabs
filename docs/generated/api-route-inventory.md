# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `318c8727a47320a966dce8cad0005b4c982a99176265fc5b49cad1b47eeae712`
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
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41574 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41585 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41751 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41769 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:41794 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:41846 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:41983 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:41996 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:42021 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:42047 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:42055 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:42061 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:42097 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:42114 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:42123 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:42132 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:42138 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:42178 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:42207 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:42224 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:43088 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:43107 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43125 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:43141 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:43155 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:43170 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43214 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43282 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:43325 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:43387 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:43410 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:43445 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43554 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43607 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43630 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43708 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43722 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:43867 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:43889 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:43911 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:43933 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:43974 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:44063 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:44098 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:44214 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:44220 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:44231 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:44322 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44332 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44343 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44364 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44386 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44497 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44536 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44625 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44737 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:44791 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:44831 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:44871 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:44903 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:44938 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:44966 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:45019 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:45056 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:45101 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:45114 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:45138 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:45175 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:46055 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:46078 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:46097 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:46121 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:46160 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:46222 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:46238 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46395 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46407 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46537 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46606 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46638 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:46862 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:46905 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:46946 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:47036 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47827 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:47876 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47968 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:48008 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:48016 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:48055 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:48087 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48334 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48340 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48349 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48359 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:48432 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48512 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48662 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48704 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48737 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:48876 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:49294 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:49342 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49387 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49395 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49471 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49565 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49615 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49657 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49731 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49750 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49772 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:49789 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:49907 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:50004 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:50022 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:50163 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:50336 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:50389 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:50420 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:50451 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:50479 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50513 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50580 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50592 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50625 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50639 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50681 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50768 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:51425 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:51463 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51498 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51530 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51537 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51546 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51571 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51591 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51784 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:51863 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:51933 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:51958 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:51999 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:52259 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:52270 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:52302 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:52350 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:52387 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:52447 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:52465 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:52487 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52502 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52521 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52534 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52552 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52559 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52577 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52589 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52683 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:52763 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:52772 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:52780 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52817 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52849 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:52886 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52918 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:52992 |
| POST | `/api/browser/playwright-auth/start` | browser | no | no | packages/gateway/src/server.ts:53038 |
| POST | `/api/browser/playwright-auth/save` | browser | no | no | packages/gateway/src/server.ts:53104 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | no | packages/gateway/src/server.ts:53217 |
| POST | `/api/browser/mobile-handoff/start` | browser | no | no | packages/gateway/src/server.ts:53350 |
| GET | `/api/browser/mobile-handoff/:handoffId/status` | browser | no | no | packages/gateway/src/server.ts:53429 |
| GET | `/mobile-browser-handoff/:handoffId` | mobile-browser-handoff | yes | no | packages/gateway/src/server.ts:53473 |
| POST | `/api/mobile-browser-handoff/:handoffId/complete` | mobile-browser-handoff | no | no | packages/gateway/src/server.ts:53484 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:53582 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:53625 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:53904 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:53943 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:53968 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53993 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:54021 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54041 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54060 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54079 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54098 |
| POST | `/api/browser/interactive/sessions` | browser | no | yes | packages/gateway/src/server.ts:54209 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | yes | packages/gateway/src/server.ts:54370 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | yes | packages/gateway/src/server.ts:54444 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:54505 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:54663 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:54799 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:54819 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:54831 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:54850 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:54915 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54947 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54995 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:55046 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:55052 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:55140 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:55281 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:55324 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55330 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:55336 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:55342 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:55371 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:55399 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:55417 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:55495 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:55563 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:55650 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:55784 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:55849 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:55903 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:55981 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55998 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:56040 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:56104 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:56112 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:56125 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:56138 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:59863 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:59883 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:59932 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:59966 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:59976 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:60030 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:60046 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:60095 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:60227 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:60282 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:60303 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:60316 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:60322 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:60330 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:60424 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60438 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60449 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60462 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60468 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:60541 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:60547 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:60558 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:60623 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:60772 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:60793 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:60823 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:60862 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:60915 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:60952 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:60983 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:61017 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:61046 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:61070 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:61102 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:61125 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:61154 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:61181 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:61211 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:61236 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:61254 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:61274 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:61300 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:61330 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:61336 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:61342 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:61379 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61413 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61428 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:61468 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61558 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61564 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61617 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61629 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61658 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61670 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:61692 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:61754 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:61802 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:61846 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:61903 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:61922 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:61931 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:61957 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:61966 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:61988 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:61997 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:62044 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:62050 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:62094 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:62128 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:62188 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:62212 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62220 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:62279 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62319 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:62385 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:62429 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:62470 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:62476 |
