# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `67d81f612cd6f0e60367ca22cf829efa2b1899ff88a206d653e961d2c4a7d72b`
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
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41303 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41314 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41480 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41498 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:41523 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:41575 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:41712 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:41725 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:41750 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:41776 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:41784 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:41790 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:41826 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:41843 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:41852 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41861 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41867 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:41907 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:41936 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:41953 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42817 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:42836 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42854 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:42870 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:42884 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42899 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42943 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:43011 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:43054 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:43116 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:43139 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:43174 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43283 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43336 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43359 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43437 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43451 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:43596 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:43618 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:43640 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:43662 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:43703 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:43792 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:43827 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:43943 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:43949 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:43960 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:44051 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44061 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:44072 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44093 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:44115 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44226 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44265 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44354 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44466 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:44520 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:44560 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:44600 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:44632 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:44667 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:44695 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:44748 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:44785 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:44830 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:44843 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:44867 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:44904 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45784 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45807 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:45826 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45850 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45889 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:45951 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:45967 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46124 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:46136 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46266 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46335 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46367 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:46591 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:46634 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:46675 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:46765 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47556 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:47605 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47697 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:47737 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:47745 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:47784 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:47816 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48063 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:48069 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48078 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:48088 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:48161 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48241 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48391 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48433 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48466 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:48605 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:49023 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:49071 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49116 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:49124 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49200 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49294 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49344 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49386 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49460 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49479 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49501 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:49518 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:49636 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:49733 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:49751 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:49892 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:50065 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:50118 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:50149 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:50180 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:50208 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50242 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50309 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50321 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50354 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50368 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50410 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50497 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:51154 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:51192 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51227 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51259 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51266 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51275 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51300 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51320 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51513 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:51592 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:51662 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:51687 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:51728 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:51986 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:51997 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:52029 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:52077 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:52114 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:52174 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:52192 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:52214 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52229 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52248 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52261 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52279 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52286 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52304 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52316 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52410 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:52490 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:52499 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:52507 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52544 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52576 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:52613 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52645 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:52719 |
| POST | `/api/browser/playwright-auth/start` | browser | no | no | packages/gateway/src/server.ts:52765 |
| POST | `/api/browser/playwright-auth/save` | browser | no | no | packages/gateway/src/server.ts:52831 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | no | packages/gateway/src/server.ts:52944 |
| POST | `/api/browser/mobile-handoff/start` | browser | no | no | packages/gateway/src/server.ts:53077 |
| GET | `/mobile-browser-handoff/:handoffId` | mobile-browser-handoff | yes | no | packages/gateway/src/server.ts:53153 |
| POST | `/api/mobile-browser-handoff/:handoffId/complete` | mobile-browser-handoff | no | no | packages/gateway/src/server.ts:53164 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:53260 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:53303 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:53582 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:53621 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:53646 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53671 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:53699 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53719 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53738 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53757 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53776 |
| POST | `/api/browser/interactive/sessions` | browser | no | yes | packages/gateway/src/server.ts:53883 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | yes | packages/gateway/src/server.ts:54044 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | yes | packages/gateway/src/server.ts:54118 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:54179 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:54337 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:54473 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:54493 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:54505 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:54524 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:54589 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54621 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54669 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:54720 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:54726 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:54814 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:54955 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:54998 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55004 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:55010 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:55016 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:55045 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:55073 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:55091 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:55169 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:55237 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:55324 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:55458 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:55523 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:55577 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:55655 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55672 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:55714 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:55778 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:55786 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:55799 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:55812 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:58985 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:59005 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:59054 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:59088 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:59098 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:59152 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:59168 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:59217 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:59349 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:59404 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:59425 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:59438 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:59444 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:59452 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:59546 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:59560 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:59571 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:59584 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:59590 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:59663 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:59669 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:59680 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:59745 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:59894 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:59915 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:59945 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:59984 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:60037 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:60074 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:60105 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:60139 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:60168 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:60192 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:60224 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:60247 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:60276 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:60303 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:60333 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:60358 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:60376 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:60396 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:60422 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:60452 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:60458 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:60464 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:60501 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:60535 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:60550 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:60590 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:60680 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:60686 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:60739 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:60751 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60780 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60792 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:60814 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:60876 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:60924 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:60968 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:61025 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:61044 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:61053 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:61079 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:61088 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:61110 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:61119 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:61166 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:61172 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:61216 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:61250 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:61310 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:61334 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:61342 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:61401 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:61441 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:61507 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:61551 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:61592 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:61598 |
