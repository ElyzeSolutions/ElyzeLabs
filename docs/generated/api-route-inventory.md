# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `ceb29388e4aab50ad19a43aa70b7832dc5fb78844165ed97673a40e486ed487d`
- Total routes: 295
- Documented routes: 292
- Undocumented routes: 3

## Methods

| Method | Count |
| --- | ---: |
| DELETE | 6 |
| GET | 120 |
| PATCH | 9 |
| POST | 146 |
| PUT | 14 |

## Areas

| Area | Count |
| --- | ---: |
| frontier | 37 |
| browser | 35 |
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
| GET | `/api/hello` | hello | yes | yes | packages/gateway/src/server.ts:41098 |
| GET | `/api/openapi` | openapi | yes | yes | packages/gateway/src/server.ts:41109 |
| GET | `/api/docs` | docs | yes | yes | packages/gateway/src/server.ts:41275 |
| GET | `/health` | health | yes | yes | packages/gateway/src/server.ts:41293 |
| GET | `/api/housekeeping` | housekeeping | no | yes | packages/gateway/src/server.ts:41318 |
| PATCH | `/api/housekeeping/retention` | housekeeping | no | yes | packages/gateway/src/server.ts:41370 |
| POST | `/api/housekeeping/run` | housekeeping | no | yes | packages/gateway/src/server.ts:41507 |
| POST | `/api/housekeeping/dead-letter/purge` | housekeeping | no | yes | packages/gateway/src/server.ts:41520 |
| POST | `/api/housekeeping/artifacts/cleanup` | housekeeping | no | yes | packages/gateway/src/server.ts:41545 |
| GET | `/api/health/readiness` | health | yes | yes | packages/gateway/src/server.ts:41571 |
| GET | `/api/doctor` | doctor | no | yes | packages/gateway/src/server.ts:41579 |
| POST | `/api/doctor/repairs/:repairId/run` | doctor | no | yes | packages/gateway/src/server.ts:41585 |
| GET | `/api/config/validate` | config | no | yes | packages/gateway/src/server.ts:41621 |
| POST | `/api/startup-healer/run` | startup-healer | no | yes | packages/gateway/src/server.ts:41638 |
| GET | `/api/startup-healer/audit` | startup-healer | no | yes | packages/gateway/src/server.ts:41647 |
| GET | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41656 |
| PUT | `/api/watchdog/config` | watchdog | no | yes | packages/gateway/src/server.ts:41662 |
| GET | `/api/watchdog/status` | watchdog | no | yes | packages/gateway/src/server.ts:41702 |
| GET | `/api/watchdog/history` | watchdog | no | yes | packages/gateway/src/server.ts:41731 |
| POST | `/api/watchdog/simulate` | watchdog | no | yes | packages/gateway/src/server.ts:41748 |
| GET | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42612 |
| GET | `/api/schedules/guardrails` | schedules | no | yes | packages/gateway/src/server.ts:42631 |
| GET | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42649 |
| GET | `/api/schedules/:scheduleId/history` | schedules | no | yes | packages/gateway/src/server.ts:42665 |
| POST | `/api/schedules/:scheduleId/guardrails/apply` | schedules | no | yes | packages/gateway/src/server.ts:42679 |
| POST | `/api/schedules` | schedules | no | yes | packages/gateway/src/server.ts:42694 |
| PATCH | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42738 |
| DELETE | `/api/schedules/:scheduleId` | schedules | no | yes | packages/gateway/src/server.ts:42806 |
| POST | `/api/schedules/request` | schedules | no | yes | packages/gateway/src/server.ts:42849 |
| POST | `/api/schedules/:scheduleId/pause` | schedules | no | yes | packages/gateway/src/server.ts:42911 |
| POST | `/api/schedules/:scheduleId/resume` | schedules | no | yes | packages/gateway/src/server.ts:42934 |
| POST | `/api/schedules/:scheduleId/run` | schedules | no | yes | packages/gateway/src/server.ts:42969 |
| GET | `/api/cron/status` | cron | no | yes | packages/gateway/src/server.ts:43078 |
| POST | `/api/local/sessions/scan` | local | no | yes | packages/gateway/src/server.ts:43131 |
| GET | `/api/local/sessions` | local | no | yes | packages/gateway/src/server.ts:43154 |
| GET | `/api/local/sessions/:sessionId` | local | no | yes | packages/gateway/src/server.ts:43232 |
| GET | `/api/local/stats` | local | no | yes | packages/gateway/src/server.ts:43246 |
| GET | `/api/improvement/learnings` | improvement | no | yes | packages/gateway/src/server.ts:43391 |
| GET | `/api/improvement/proposals` | improvement | no | yes | packages/gateway/src/server.ts:43413 |
| POST | `/api/improvement/cycle/run` | improvement | no | yes | packages/gateway/src/server.ts:43435 |
| PATCH | `/api/improvement/agents/:agentId` | improvement | no | yes | packages/gateway/src/server.ts:43457 |
| POST | `/api/improvement/proposals/:proposalId/approve` | improvement | no | yes | packages/gateway/src/server.ts:43498 |
| POST | `/api/improvement/proposals/:proposalId/reject` | improvement | no | yes | packages/gateway/src/server.ts:43587 |
| GET | `/api/capabilities` | capabilities | yes | yes | packages/gateway/src/server.ts:43622 |
| GET | `/api/sandbox/policy` | sandbox | no | yes | packages/gateway/src/server.ts:43738 |
| GET | `/api/sandbox/policy/diff` | sandbox | no | yes | packages/gateway/src/server.ts:43744 |
| POST | `/api/sandbox/policy/apply` | sandbox | no | yes | packages/gateway/src/server.ts:43755 |
| GET | `/api/auth/principal` | auth | no | yes | packages/gateway/src/server.ts:43846 |
| GET | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:43856 |
| PUT | `/api/rbac/policy` | rbac | no | yes | packages/gateway/src/server.ts:43867 |
| GET | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:43888 |
| PUT | `/api/config/runtime` | config | no | yes | packages/gateway/src/server.ts:43910 |
| GET | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44021 |
| POST | `/api/sessions/bulk-delete` | sessions | no | yes | packages/gateway/src/server.ts:44060 |
| POST | `/api/sessions` | sessions | no | yes | packages/gateway/src/server.ts:44149 |
| POST | `/api/sessions/:sessionId/link-code` | sessions | no | yes | packages/gateway/src/server.ts:44261 |
| GET | `/api/sessions/:sessionId` | sessions | no | yes | packages/gateway/src/server.ts:44315 |
| POST | `/api/sessions/:sessionId/browser-auth-profile` | sessions | no | yes | packages/gateway/src/server.ts:44355 |
| GET | `/api/sessions/:sessionId/continuity` | sessions | no | yes | packages/gateway/src/server.ts:44395 |
| POST | `/api/sessions/:sessionId/compact` | sessions | no | yes | packages/gateway/src/server.ts:44427 |
| GET | `/api/sessions/:sessionId/collaboration/targets` | sessions | no | yes | packages/gateway/src/server.ts:44462 |
| GET | `/api/sessions/:sessionId/collaboration/history` | sessions | no | yes | packages/gateway/src/server.ts:44490 |
| POST | `/api/sessions/:sessionId/collaboration/route` | sessions | no | yes | packages/gateway/src/server.ts:44543 |
| POST | `/api/sessions/:sessionId/collaboration/send` | sessions | no | yes | packages/gateway/src/server.ts:44580 |
| GET | `/api/backlog/contracts` | backlog | no | yes | packages/gateway/src/server.ts:44625 |
| GET | `/api/backlog` | backlog | no | yes | packages/gateway/src/server.ts:44638 |
| GET | `/api/backlog/board` | backlog | no | yes | packages/gateway/src/server.ts:44662 |
| POST | `/api/backlog/project-intake` | backlog | no | yes | packages/gateway/src/server.ts:44699 |
| GET | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45579 |
| GET | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45602 |
| GET | `/api/delivery-groups/:groupId/status` | delivery-groups | no | yes | packages/gateway/src/server.ts:45621 |
| POST | `/api/delivery-groups` | delivery-groups | no | yes | packages/gateway/src/server.ts:45645 |
| PATCH | `/api/delivery-groups/:groupId` | delivery-groups | no | yes | packages/gateway/src/server.ts:45684 |
| POST | `/api/delivery-groups/:groupId/publish` | delivery-groups | no | yes | packages/gateway/src/server.ts:45746 |
| POST | `/api/backlog/items` | backlog | no | yes | packages/gateway/src/server.ts:45762 |
| GET | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:45919 |
| PATCH | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:45931 |
| POST | `/api/backlog/items/:itemId/transition` | backlog | no | yes | packages/gateway/src/server.ts:46061 |
| PUT | `/api/backlog/items/:itemId/dependencies` | backlog | no | yes | packages/gateway/src/server.ts:46130 |
| PUT | `/api/backlog/items/:itemId/delivery` | backlog | no | yes | packages/gateway/src/server.ts:46162 |
| POST | `/api/backlog/items/:itemId/delivery/reconcile` | backlog | no | yes | packages/gateway/src/server.ts:46386 |
| GET | `/api/backlog/items/:itemId/delivery/detail` | backlog | no | yes | packages/gateway/src/server.ts:46429 |
| POST | `/api/backlog/items/:itemId/delivery/repair` | backlog | no | yes | packages/gateway/src/server.ts:46470 |
| POST | `/api/backlog/items/:itemId/delivery/publish` | backlog | no | yes | packages/gateway/src/server.ts:46560 |
| GET | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47351 |
| GET | `/api/backlog/orchestration/decisions` | backlog | no | yes | packages/gateway/src/server.ts:47400 |
| PUT | `/api/backlog/orchestration` | backlog | no | yes | packages/gateway/src/server.ts:47492 |
| POST | `/api/backlog/orchestration/tick` | backlog | no | yes | packages/gateway/src/server.ts:47532 |
| POST | `/api/backlog/cleanup` | backlog | no | yes | packages/gateway/src/server.ts:47540 |
| DELETE | `/api/backlog/items/:itemId` | backlog | no | yes | packages/gateway/src/server.ts:47579 |
| POST | `/api/backlog/orchestration/override` | backlog | no | yes | packages/gateway/src/server.ts:47611 |
| GET | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:47858 |
| PUT | `/api/github/issues/config` | github | no | yes | packages/gateway/src/server.ts:47864 |
| GET | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:47873 |
| POST | `/api/github/repos` | github | no | yes | packages/gateway/src/server.ts:47883 |
| PATCH | `/api/github/repos/:repoConnectionId` | github | no | yes | packages/gateway/src/server.ts:47956 |
| POST | `/api/github/repos/:repoConnectionId/sync` | github | no | yes | packages/gateway/src/server.ts:48036 |
| POST | `/api/github/repos/:repoConnectionId/reconcile` | github | no | yes | packages/gateway/src/server.ts:48186 |
| GET | `/api/backlog/items/:itemId/issues` | backlog | no | yes | packages/gateway/src/server.ts:48228 |
| POST | `/api/backlog/items/:itemId/issues/sync` | backlog | no | yes | packages/gateway/src/server.ts:48261 |
| POST | `/api/github/webhooks` | github | no | yes | packages/gateway/src/server.ts:48400 |
| GET | `/api/github/webhooks/events` | github | no | yes | packages/gateway/src/server.ts:48818 |
| POST | `/api/github/webhooks/replay` | github | no | yes | packages/gateway/src/server.ts:48866 |
| GET | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:48911 |
| POST | `/api/agents/profiles` | agents | no | yes | packages/gateway/src/server.ts:48919 |
| PATCH | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:48995 |
| POST | `/api/agents/profiles/:agentId/reset-baseline` | agents | no | yes | packages/gateway/src/server.ts:49089 |
| DELETE | `/api/agents/profiles/:agentId` | agents | no | yes | packages/gateway/src/server.ts:49139 |
| POST | `/api/agents/profiles/:agentId/clear-history` | agents | no | yes | packages/gateway/src/server.ts:49181 |
| POST | `/api/agents/profiles/:agentId/harness/start` | agents | no | yes | packages/gateway/src/server.ts:49255 |
| POST | `/api/agents/profiles/:agentId/harness/stop` | agents | no | yes | packages/gateway/src/server.ts:49274 |
| POST | `/api/agents/profiles/:agentId/turbo-coding` | agents | no | yes | packages/gateway/src/server.ts:49296 |
| POST | `/api/agents/profiles/:agentId/sessions` | agents | no | yes | packages/gateway/src/server.ts:49313 |
| POST | `/api/sessions/:sessionId/delegate` | sessions | no | yes | packages/gateway/src/server.ts:49431 |
| GET | `/api/runs` | runs | no | yes | packages/gateway/src/server.ts:49528 |
| PATCH | `/api/sessions/:sessionId/preferences` | sessions | no | yes | packages/gateway/src/server.ts:49546 |
| POST | `/api/sessions/:sessionId/switch-runtime` | sessions | no | yes | packages/gateway/src/server.ts:49687 |
| GET | `/api/runs/:runId` | runs | no | yes | packages/gateway/src/server.ts:49860 |
| GET | `/api/runs/:runId/liveness` | runs | no | yes | packages/gateway/src/server.ts:49913 |
| GET | `/api/runs/:runId/watchdog` | runs | no | yes | packages/gateway/src/server.ts:49944 |
| GET | `/api/runs/:runId/prompt-assembly` | runs | no | yes | packages/gateway/src/server.ts:49975 |
| GET | `/api/runs/:runId/execution-contract` | runs | no | yes | packages/gateway/src/server.ts:50003 |
| POST | `/api/runs/:runId/control-actions` | runs | no | yes | packages/gateway/src/server.ts:50037 |
| GET | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50104 |
| POST | `/api/continuity/signals` | continuity | no | yes | packages/gateway/src/server.ts:50116 |
| POST | `/api/continuity/signals/:signalId/resolve` | continuity | no | yes | packages/gateway/src/server.ts:50149 |
| GET | `/api/runs/:runId/terminal` | runs | no | yes | packages/gateway/src/server.ts:50163 |
| GET | `/api/runs/:runId/terminal/stream` | runs | no | yes | packages/gateway/src/server.ts:50205 |
| POST | `/api/sessions/:sessionId/runs` | sessions | no | yes | packages/gateway/src/server.ts:50292 |
| POST | `/api/runs/:runId/steer` | runs | no | yes | packages/gateway/src/server.ts:50949 |
| POST | `/api/runs/:runId/resume` | runs | no | yes | packages/gateway/src/server.ts:50987 |
| POST | `/api/runs/:runId/abort` | runs | no | yes | packages/gateway/src/server.ts:51022 |
| GET | `/api/runs/:runId/timeline` | runs | no | yes | packages/gateway/src/server.ts:51054 |
| GET | `/api/queue` | queue | no | yes | packages/gateway/src/server.ts:51061 |
| GET | `/api/messages` | messages | no | yes | packages/gateway/src/server.ts:51070 |
| GET | `/api/onboarding/status` | onboarding | no | yes | packages/gateway/src/server.ts:51095 |
| POST | `/api/onboarding/ceo-baseline` | onboarding | no | yes | packages/gateway/src/server.ts:51115 |
| POST | `/api/onboarding/vault/bootstrap` | onboarding | no | yes | packages/gateway/src/server.ts:51308 |
| POST | `/api/onboarding/vault/unlock` | onboarding | no | yes | packages/gateway/src/server.ts:51387 |
| POST | `/api/onboarding/provider-keys/check` | onboarding | no | yes | packages/gateway/src/server.ts:51457 |
| POST | `/api/onboarding/provider-keys/live-check` | onboarding | no | yes | packages/gateway/src/server.ts:51482 |
| POST | `/api/onboarding/smoke-run` | onboarding | no | yes | packages/gateway/src/server.ts:51523 |
| GET | `/api/memory/auto-remember` | memory | no | yes | packages/gateway/src/server.ts:51781 |
| GET | `/api/memory/scopes` | memory | no | yes | packages/gateway/src/server.ts:51792 |
| GET | `/api/memory/embedding/status` | memory | no | yes | packages/gateway/src/server.ts:51824 |
| GET | `/api/memory/search` | memory | no | yes | packages/gateway/src/server.ts:51872 |
| POST | `/api/memory/remember` | memory | no | yes | packages/gateway/src/server.ts:51909 |
| POST | `/api/memory/compact` | memory | no | yes | packages/gateway/src/server.ts:51969 |
| POST | `/api/memory/evaluate` | memory | no | yes | packages/gateway/src/server.ts:51987 |
| GET | `/api/trajectories/:runId` | trajectories | no | yes | packages/gateway/src/server.ts:52009 |
| POST | `/api/trajectories/:runId/project` | trajectories | no | yes | packages/gateway/src/server.ts:52024 |
| GET | `/api/context-graph/query` | context-graph | no | yes | packages/gateway/src/server.ts:52043 |
| GET | `/api/tools` | tools | no | yes | packages/gateway/src/server.ts:52056 |
| GET | `/api/browser/status` | browser | no | yes | packages/gateway/src/server.ts:52074 |
| GET | `/api/browser/release-gate` | browser | no | yes | packages/gateway/src/server.ts:52081 |
| POST | `/api/browser/policy/diff` | browser | no | yes | packages/gateway/src/server.ts:52099 |
| POST | `/api/browser/policy/apply` | browser | no | yes | packages/gateway/src/server.ts:52111 |
| PUT | `/api/browser/config` | browser | no | yes | packages/gateway/src/server.ts:52205 |
| GET | `/api/browser/doctor` | browser | no | yes | packages/gateway/src/server.ts:52285 |
| GET | `/api/browser/session-vault` | browser | no | yes | packages/gateway/src/server.ts:52294 |
| POST | `/api/browser/cookie-jars/import` | browser | no | yes | packages/gateway/src/server.ts:52302 |
| POST | `/api/browser/header-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52339 |
| POST | `/api/browser/proxy-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52371 |
| POST | `/api/browser/storage-states/upsert` | browser | no | yes | packages/gateway/src/server.ts:52408 |
| POST | `/api/browser/session-profiles/upsert` | browser | no | yes | packages/gateway/src/server.ts:52440 |
| POST | `/api/browser/login-capture/start` | browser | no | yes | packages/gateway/src/server.ts:52514 |
| POST | `/api/browser/playwright-auth/start` | browser | no | no | packages/gateway/src/server.ts:52560 |
| POST | `/api/browser/playwright-auth/save` | browser | no | no | packages/gateway/src/server.ts:52626 |
| POST | `/api/browser/playwright-auth/save-current` | browser | no | no | packages/gateway/src/server.ts:52739 |
| POST | `/api/browser/managed-profiles/ensure` | browser | no | yes | packages/gateway/src/server.ts:52872 |
| POST | `/api/browser/connect-account` | browser | no | yes | packages/gateway/src/server.ts:52915 |
| POST | `/api/browser/session-profiles/:sessionProfileId/verify` | browser | no | yes | packages/gateway/src/server.ts:53194 |
| POST | `/api/browser/session-profiles/:sessionProfileId/enable` | browser | no | yes | packages/gateway/src/server.ts:53233 |
| POST | `/api/browser/session-profiles/:sessionProfileId/disable` | browser | no | yes | packages/gateway/src/server.ts:53258 |
| POST | `/api/browser/session-profiles/:sessionProfileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53283 |
| DELETE | `/api/browser/session-profiles/:sessionProfileId` | browser | no | yes | packages/gateway/src/server.ts:53311 |
| POST | `/api/browser/cookie-jars/:cookieJarId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53331 |
| POST | `/api/browser/header-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53350 |
| POST | `/api/browser/proxy-profiles/:profileId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53369 |
| POST | `/api/browser/storage-states/:storageStateId/revoke` | browser | no | yes | packages/gateway/src/server.ts:53388 |
| POST | `/api/browser/interactive/sessions` | browser | no | yes | packages/gateway/src/server.ts:53481 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | yes | packages/gateway/src/server.ts:53642 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | yes | packages/gateway/src/server.ts:53716 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:53777 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:53935 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:54071 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:54091 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:54103 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:54122 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:54187 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54219 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54267 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:54318 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:54324 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:54412 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:54553 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:54596 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:54602 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:54608 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:54614 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:54643 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:54671 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:54689 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:54767 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:54835 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:54922 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:55056 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:55121 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:55175 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:55253 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55270 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:55312 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:55376 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:55384 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:55397 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:55410 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:58583 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:58603 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:58652 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:58686 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:58696 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:58750 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:58766 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:58815 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:58947 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:59002 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:59023 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:59036 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:59042 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:59050 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:59144 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:59158 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:59169 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:59182 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:59188 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:59261 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:59267 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:59278 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:59343 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:59492 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:59513 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:59543 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:59582 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:59635 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:59672 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:59703 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:59737 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:59766 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:59790 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:59822 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:59845 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:59874 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:59901 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:59931 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:59956 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:59974 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:59994 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:60020 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:60050 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:60056 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:60062 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:60099 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:60133 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:60148 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:60188 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:60278 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:60284 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:60337 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:60349 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60378 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60390 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:60412 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:60474 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:60522 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:60566 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:60623 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:60642 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:60651 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:60677 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:60686 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:60708 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:60717 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:60764 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:60770 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:60814 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:60848 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:60908 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:60932 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:60940 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:60999 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:61039 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:61105 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:61149 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:61190 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:61196 |
