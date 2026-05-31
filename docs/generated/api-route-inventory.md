# API Route Inventory

Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.

## Summary

- Schema: `ops.route-inventory.v1`
- Source hash: `c5a03b09f3e08c6142751ba867fca70a71214ef54065f5338a5f065f6e4352c2`
- Total routes: 295
- Documented routes: 289
- Undocumented routes: 6

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
| POST | `/api/browser/interactive/sessions` | browser | no | no | packages/gateway/src/server.ts:53462 |
| POST | `/api/browser/interactive/sessions/:liveSessionId/actions` | browser | no | no | packages/gateway/src/server.ts:53623 |
| DELETE | `/api/browser/interactive/sessions/:liveSessionId` | browser | no | no | packages/gateway/src/server.ts:53697 |
| POST | `/api/browser/interactive/run` | browser | no | yes | packages/gateway/src/server.ts:53758 |
| POST | `/api/browser/test` | browser | no | yes | packages/gateway/src/server.ts:53916 |
| GET | `/api/browser/history` | browser | no | yes | packages/gateway/src/server.ts:54052 |
| GET | `/api/browser/history/:runId` | browser | no | yes | packages/gateway/src/server.ts:54072 |
| GET | `/api/browser/artifacts/:handle` | browser | no | yes | packages/gateway/src/server.ts:54084 |
| POST | `/api/bootstrap/vendor` | bootstrap | no | yes | packages/gateway/src/server.ts:54103 |
| PATCH | `/api/tools/:toolName` | tools | no | yes | packages/gateway/src/server.ts:54168 |
| GET | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54200 |
| PUT | `/api/llm/limits` | llm | no | yes | packages/gateway/src/server.ts:54248 |
| GET | `/api/llm/auth-profiles` | llm | no | yes | packages/gateway/src/server.ts:54299 |
| PUT | `/api/llm/auth-profiles/:profileId` | llm | no | yes | packages/gateway/src/server.ts:54305 |
| GET | `/api/llm/costs` | llm | no | yes | packages/gateway/src/server.ts:54393 |
| GET | `/api/llm/routing/effective` | llm | no | yes | packages/gateway/src/server.ts:54534 |
| GET | `/api/skills` | skills | no | yes | packages/gateway/src/server.ts:54577 |
| GET | `/api/skills/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:54583 |
| GET | `/api/skills/release-gate` | skills | no | yes | packages/gateway/src/server.ts:54589 |
| POST | `/api/skills/release-gate/evaluate` | skills | no | yes | packages/gateway/src/server.ts:54595 |
| POST | `/api/skills/curator/run` | skills | no | yes | packages/gateway/src/server.ts:54624 |
| GET | `/api/skills/catalog` | skills | no | yes | packages/gateway/src/server.ts:54652 |
| POST | `/api/skills/catalog/entries/upsert` | skills | no | yes | packages/gateway/src/server.ts:54670 |
| POST | `/api/skills/catalog/entries/remove` | skills | no | yes | packages/gateway/src/server.ts:54748 |
| POST | `/api/skills/runtime-contracts/upsert` | skills | no | yes | packages/gateway/src/server.ts:54816 |
| POST | `/api/skills/install` | skills | no | yes | packages/gateway/src/server.ts:54903 |
| POST | `/api/skills/remove` | skills | no | yes | packages/gateway/src/server.ts:55037 |
| POST | `/api/skills/resync` | skills | no | yes | packages/gateway/src/server.ts:55102 |
| POST | `/api/skills/autodiscover` | skills | no | yes | packages/gateway/src/server.ts:55156 |
| POST | `/api/skills/reload` | skills | no | yes | packages/gateway/src/server.ts:55234 |
| PUT | `/api/skills/:skillName/lifecycle` | skills | no | yes | packages/gateway/src/server.ts:55251 |
| POST | `/api/skills/:skillName/invoke` | skills | no | yes | packages/gateway/src/server.ts:55293 |
| GET | `/api/pairings` | pairings | no | yes | packages/gateway/src/server.ts:55357 |
| POST | `/api/pairings/:channel/:senderId/approve` | pairings | no | yes | packages/gateway/src/server.ts:55365 |
| POST | `/api/pairings/:channel/:senderId/revoke` | pairings | no | yes | packages/gateway/src/server.ts:55378 |
| POST | `/api/ingress/telegram` | ingress | yes | yes | packages/gateway/src/server.ts:55391 |
| POST | `/api/telegram/webhook` | telegram | yes | yes | packages/gateway/src/server.ts:58564 |
| POST | `/api/telegram/smoke-test` | telegram | no | yes | packages/gateway/src/server.ts:58584 |
| POST | `/api/telegram/commands/sync` | telegram | no | yes | packages/gateway/src/server.ts:58633 |
| GET | `/api/events` | events | no | yes | packages/gateway/src/server.ts:58667 |
| GET | `/api/events/stream` | events | no | yes | packages/gateway/src/server.ts:58677 |
| GET | `/api/office/presence` | office | no | yes | packages/gateway/src/server.ts:58731 |
| GET | `/api/office/stream` | office | no | yes | packages/gateway/src/server.ts:58747 |
| GET | `/api/bff/cards` | bff | no | yes | packages/gateway/src/server.ts:58796 |
| GET | `/api/bff/board` | bff | no | yes | packages/gateway/src/server.ts:58928 |
| GET | `/api/bff/chats` | bff | no | yes | packages/gateway/src/server.ts:58983 |
| GET | `/api/bff/health-cards` | bff | no | yes | packages/gateway/src/server.ts:59004 |
| GET | `/api/audit` | audit | no | yes | packages/gateway/src/server.ts:59017 |
| GET | `/api/metrics` | metrics | no | yes | packages/gateway/src/server.ts:59023 |
| POST | `/api/security/elevated-check` | security | no | yes | packages/gateway/src/server.ts:59031 |
| GET | `/api/security/token-status` | security | no | yes | packages/gateway/src/server.ts:59125 |
| GET | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:59139 |
| POST | `/api/remediation` | remediation | no | yes | packages/gateway/src/server.ts:59150 |
| GET | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:59163 |
| POST | `/api/remediation/signals` | remediation | no | yes | packages/gateway/src/server.ts:59169 |
| GET | `/api/remediation/plans` | remediation | no | yes | packages/gateway/src/server.ts:59242 |
| POST | `/api/remediation/plans/:planId/approve` | remediation | no | yes | packages/gateway/src/server.ts:59248 |
| POST | `/api/remediation/plans/:planId/execute` | remediation | no | yes | packages/gateway/src/server.ts:59259 |
| GET | `/api/remediation/outcomes` | remediation | no | yes | packages/gateway/src/server.ts:59324 |
| GET | `/api/frontier/contracts` | frontier | no | yes | packages/gateway/src/server.ts:59473 |
| GET | `/api/frontier/governance` | frontier | no | yes | packages/gateway/src/server.ts:59494 |
| POST | `/api/frontier/governance/principals` | frontier | no | yes | packages/gateway/src/server.ts:59524 |
| POST | `/api/frontier/governance/companies` | frontier | no | yes | packages/gateway/src/server.ts:59563 |
| POST | `/api/frontier/governance/memberships` | frontier | no | yes | packages/gateway/src/server.ts:59616 |
| POST | `/api/frontier/governance/grants` | frontier | no | yes | packages/gateway/src/server.ts:59653 |
| POST | `/api/frontier/governance/invites` | frontier | no | yes | packages/gateway/src/server.ts:59684 |
| POST | `/api/frontier/governance/invites/accept` | frontier | no | yes | packages/gateway/src/server.ts:59718 |
| POST | `/api/frontier/governance/join-requests` | frontier | no | yes | packages/gateway/src/server.ts:59747 |
| POST | `/api/frontier/governance/join-requests/:requestId/decision` | frontier | no | yes | packages/gateway/src/server.ts:59771 |
| POST | `/api/frontier/governance/claims/challenge` | frontier | no | yes | packages/gateway/src/server.ts:59803 |
| POST | `/api/frontier/governance/claims/complete` | frontier | no | yes | packages/gateway/src/server.ts:59826 |
| GET | `/api/frontier/issues/locks` | frontier | no | yes | packages/gateway/src/server.ts:59855 |
| POST | `/api/frontier/issues/:issueId/wakeup` | frontier | no | yes | packages/gateway/src/server.ts:59882 |
| POST | `/api/frontier/issues/:issueId/release` | frontier | no | yes | packages/gateway/src/server.ts:59912 |
| POST | `/api/frontier/issues/repair` | frontier | no | yes | packages/gateway/src/server.ts:59937 |
| GET | `/api/frontier/portability/export` | frontier | no | yes | packages/gateway/src/server.ts:59955 |
| POST | `/api/frontier/portability/import/preview` | frontier | no | yes | packages/gateway/src/server.ts:59975 |
| POST | `/api/frontier/portability/import/apply` | frontier | no | yes | packages/gateway/src/server.ts:60001 |
| GET | `/api/frontier/adapters/contract` | frontier | no | yes | packages/gateway/src/server.ts:60031 |
| GET | `/api/frontier/adapters/diagnostics` | frontier | no | yes | packages/gateway/src/server.ts:60037 |
| GET | `/api/frontier/runs/:runId/events` | frontier | no | yes | packages/gateway/src/server.ts:60043 |
| GET | `/api/frontier/runs/:runId/logs` | frontier | no | yes | packages/gateway/src/server.ts:60080 |
| GET | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:60114 |
| PUT | `/api/frontier/deployment` | frontier | no | yes | packages/gateway/src/server.ts:60129 |
| POST | `/api/frontier/deployment/doctor` | frontier | no | yes | packages/gateway/src/server.ts:60169 |
| GET | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:60259 |
| PUT | `/api/frontier/scorecard` | frontier | no | yes | packages/gateway/src/server.ts:60265 |
| GET | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:60318 |
| POST | `/api/frontier/comparator/run` | frontier | no | yes | packages/gateway/src/server.ts:60330 |
| GET | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60359 |
| POST | `/api/frontier/comparator/closure` | frontier | no | yes | packages/gateway/src/server.ts:60371 |
| POST | `/api/frontier/benchmark/delta` | frontier | no | yes | packages/gateway/src/server.ts:60393 |
| POST | `/api/frontier/critic` | frontier | no | yes | packages/gateway/src/server.ts:60455 |
| POST | `/api/frontier/remediation/plans` | frontier | no | yes | packages/gateway/src/server.ts:60503 |
| GET | `/api/frontier/release/gate` | frontier | no | yes | packages/gateway/src/server.ts:60547 |
| POST | `/api/frontier/certification/report` | frontier | no | yes | packages/gateway/src/server.ts:60604 |
| GET | `/api/certification/runtime` | certification | no | yes | packages/gateway/src/server.ts:60623 |
| POST | `/api/certification/runtime/report` | certification | no | yes | packages/gateway/src/server.ts:60632 |
| GET | `/api/certification/continuity` | certification | no | yes | packages/gateway/src/server.ts:60658 |
| POST | `/api/certification/continuity/report` | certification | no | yes | packages/gateway/src/server.ts:60667 |
| GET | `/api/certification/architecture` | certification | no | yes | packages/gateway/src/server.ts:60689 |
| POST | `/api/certification/architecture/report` | certification | no | yes | packages/gateway/src/server.ts:60698 |
| GET | `/api/vault/status` | vault | no | yes | packages/gateway/src/server.ts:60745 |
| POST | `/api/vault/reset-empty` | vault | no | yes | packages/gateway/src/server.ts:60751 |
| POST | `/api/vault/bootstrap` | vault | no | yes | packages/gateway/src/server.ts:60795 |
| POST | `/api/vault/unlock` | vault | no | yes | packages/gateway/src/server.ts:60829 |
| POST | `/api/vault/lock` | vault | no | yes | packages/gateway/src/server.ts:60889 |
| GET | `/api/vault/secrets` | vault | no | yes | packages/gateway/src/server.ts:60913 |
| PUT | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:60921 |
| POST | `/api/vault/secrets/:name/rotate` | vault | no | yes | packages/gateway/src/server.ts:60980 |
| DELETE | `/api/vault/secrets/:name` | vault | no | yes | packages/gateway/src/server.ts:61020 |
| POST | `/api/vault/rotate-master-key` | vault | no | yes | packages/gateway/src/server.ts:61086 |
| GET | `/api/backup/export` | backup | no | yes | packages/gateway/src/server.ts:61130 |
| GET | `/` | root | yes | yes | packages/gateway/src/server.ts:61171 |
| GET | `/*` | * | yes | yes | packages/gateway/src/server.ts:61177 |
