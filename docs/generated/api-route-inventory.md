# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `8752cc7e940c67dbafc444214a1a46afb71cb173e2e9238a0d14bf9baef2ccb2`
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
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41788 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41799 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41965 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41983 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:42008 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:42060 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:42197 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:42210 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:42235 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:42261 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:42269 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:42275 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:42311 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:42328 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:42337 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:42346 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:42352 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:42392 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:42421 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:42438 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:43302 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:43321 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43339 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:43355 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:43369 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:43384 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43428 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43496 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:43539 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:43601 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:43624 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:43659 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43768 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43821 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43844 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43922 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43936 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:44081 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:44103 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:44125 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:44147 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:44188 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:44277 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:44312 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:44428 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:44434 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:44445 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:44536 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44546 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44557 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44578 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44600 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44711 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44750 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44839 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44951 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:45005 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:45045 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:45085 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:45117 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:45152 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:45180 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:45233 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:45270 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:45315 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:45328 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:45352 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:45389 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:46269 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:46292 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:46311 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:46335 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:46374 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:46436 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:46452 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46609 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46621 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46751 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46820 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46852 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:47076 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:47119 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:47160 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:47250 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:48041 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:48090 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:48182 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:48222 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:48230 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:48269 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:48301 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48548 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48554 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48563 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48573 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:48646 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48726 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48876 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48918 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48951 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:49090 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:49508 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:49556 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49601 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49609 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49685 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49779 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49829 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49871 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49945 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49964 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49986 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:50003 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:50121 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:50218 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:50236 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:50377 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:50550 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:50603 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:50634 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:50665 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:50693 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50727 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50794 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50806 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50839 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50853 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50895 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50982 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:51639 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:51677 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51712 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51744 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51751 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51760 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51785 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51805 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51998 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:52077 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:52147 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:52172 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:52219 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:52479 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:52490 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:52522 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:52570 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:52607 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:52667 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:52685 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:52707 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52722 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52741 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52754 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52772 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52779 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52797 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52809 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52942 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:53022 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:53031 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:53039 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:53076 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:53108 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:53145 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:53177 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:53251 |
| POST | `/api/browser/playwright-auth/start` | browser | no | yes | packages/gateway/src/server.ts:53297 |
| POST | `/api/browser/playwright-auth/save` | browser | no | yes | packages/gateway/src/server.ts:53363 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | yes | packages/gateway/src/server.ts:53476 |
| POST | `/api/browser/mobile-handoff/start` | browser | no | yes | packages/gateway/src/server.ts:53609 |
| GET | `/api/browser/mobile-handoff/:handoffId/status` | browser | no | yes | packages/gateway/src/server.ts:53688 |
| GET | `/mobile-browser-handoff/:handoffId` | mobile-browser-handoff | yes | yes | packages/gateway/src/server.ts:53732 |
| POST | `/api/mobile-browser-handoff/:handoffId/complete` | mobile-browser-handoff | no | yes | packages/gateway/src/server.ts:53743 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:53841 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:53884 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:54163 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:54202 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:54227 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54252 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:54280 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54300 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54319 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54338 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:54357 |
| POST | `/api/browser/interactive/sessions` | browser | no | yes | packages/gateway/src/server.ts:54468 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | yes | packages/gateway/src/server.ts:54629 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | yes | packages/gateway/src/server.ts:54703 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:54764 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:54922 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:55058 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:55078 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:55090 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:55109 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:55174 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:55206 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:55254 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:55305 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:55311 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:55399 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:55540 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:55583 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55589 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:55595 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:55601 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:55630 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:55658 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:55676 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:55754 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:55822 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:55909 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:56043 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:56108 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:56162 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:56240 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:56257 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:56299 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:56363 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:56371 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:56384 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:56397 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:60164 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:60184 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:60233 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:60267 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:60277 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:60331 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:60347 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:60396 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:60528 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:60583 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:60604 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:60617 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:60623 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:60631 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:60725 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60739 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:60750 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60763 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:60769 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:60842 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:60848 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:60859 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:60924 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:61073 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:61094 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:61124 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:61163 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:61216 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:61253 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:61284 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:61318 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:61347 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:61371 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:61403 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:61426 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:61455 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:61482 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:61512 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:61537 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:61555 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:61575 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:61601 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:61631 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:61637 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:61643 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:61680 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61714 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:61729 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:61769 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61859 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:61865 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61918 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:61930 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61959 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:61971 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:61993 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:62055 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:62103 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:62147 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:62204 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:62223 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:62232 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:62258 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:62267 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:62289 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:62298 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:62345 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:62351 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:62395 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:62429 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:62489 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:62513 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62521 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:62580 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:62620 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:62686 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:62730 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:62771 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:62777 |
