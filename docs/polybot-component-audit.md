# Polybot Component Audit (Template Extraction)

Source reviewed: `../Polybot/dashboard/src`
Goal: keep reusable UI patterns and remove trading/broker-specific behavior.

## Keep First (High Reuse)

### Shell and navigation
- `components/layout/Sidebar.tsx`: expandable sectioned sidebar pattern, badges, active state, desktop rail behavior.
- `components/layout/Header.tsx`: top status bar, connection pill, compact actions, search dialog shell.
- `components/layout/MobileNav.tsx`: bottom nav with overflow handling.
- `components/layout/AppLayout.tsx`: page shell composition (sidebar + header + content + mobile nav).

### Design tokens and visual language
- `index.css`: theme tokens, glass panel style, noise texture, scrollbar, utility classes.
- `components/common/Card.tsx`: panel/card variants (`default`, `glow`, `gradient`) and stat card pattern.
- `components/common/Badge.tsx`: semantic badge variants.
- `components/common/StatusIndicator.tsx`: compact status dot + label pattern.
- `components/common/HelpTip.tsx`: tooltip micro-pattern.
- `components/common/ErrorBoundary.tsx`: safe fallback wrapper.

### Cross-page reusable blocks
- `components/events/EventStream.tsx`: stream list pattern, controls strip, filtering shell, virtualization pattern.
- `components/errors/ErrorPanel.tsx`: dedicated alerts/issues panel pattern.
- `components/settings/SettingsPanel.tsx`: tabbed settings container + lazy panel loading pattern.

## Keep With Domain-Neutral Rewrite

### Decisions page
- Source: `components/decisions/*`
- Keep pattern: multi-tab analytical cockpit and section cards.
- Rewrite needed: trading terms, opportunity semantics, MT5/polymarket logic hooks.

### Positions page
- Source: `components/positions/PositionTable.tsx` + `sections/*`
- Keep pattern: overview strip + toolbar + detailed table + lifecycle timeline.
- Rewrite needed: position/venue/pnl semantics into generic `job`/`worker`/`task` forms.

### Portfolio and bankroll pages
- Source: `components/portfolio/*`, `components/bankroll/*`
- Keep pattern: KPI grids, allocation/pie bars, trend chart sections, venue chips.
- Rewrite needed: funds/equity/trade semantics into generic capacity/utilization/throughput metrics.

### System pages
- Source: `components/system/SystemMonitorPanel.tsx`, `SystemDag.tsx`
- Keep pattern: event+alerts split console, health DAG visual, readiness checks.
- Rewrite needed: worker names, lane vocabulary, market-specific health payloads.

### LLM page
- Source: `components/llm/*`
- Keep pattern: limits editor, budget dashboard, route/capability monitoring layout.
- Rewrite needed: provider-specific field names only if template should stay provider-agnostic.

## Defer / Optional
- `features/settings/components/*`: many good widgets, but heavily tied to MT5 and profile workflows.
- `components/ui/*`: keep if we want a full design system package in this template; otherwise keep minimal primitives only.

## Extraction Rules For This Template
- Keep UI shell and visual components.
- Remove all references to `trading`, `mt5`, `polymarket`, `funds`, `positions`, `orders`, and venue-specific fields in template examples.
- Preserve generic state patterns: loading, empty, degraded, blocked, permission-gated.
- Prefer static/sample data in gallery examples; wire runtime view only to core API contract.

## What Was Added Now
- New shell examples in gallery:
  - `dashboard/examples/template/legacy/LegacyShellShowcase.tsx`
  - `dashboard/examples/template/legacy/LegacyThemeSwatches.tsx`
- Gallery now includes Polybot-inspired sidebar/topbar/mobile shell and palette showcase.
- Reusable shell extraction implemented:
  - `dashboard/examples/template/layout/TemplateShell.tsx`
  - `dashboard/examples/template/layout/TemplateSidebar.tsx`
  - `dashboard/examples/template/layout/TemplateTopbar.tsx`
  - `dashboard/examples/template/layout/TemplateMobileNav.tsx`
  - These are reference artifacts; runtime app wiring stays in `dashboard/src/components/ops`.
- Additional reusable patterns implemented:
  - `dashboard/examples/template/data/VirtualizedEventList.tsx`
  - `dashboard/examples/template/patterns/TabbedInspector.tsx`
  - `dashboard/examples/template/patterns/MetricCardGrid.tsx`
  - `dashboard/examples/template/patterns/TrendPanel.tsx`
- Extracted from `/accounts`:
  - `dashboard/examples/template/patterns/ContextLensBar.tsx`
  - `dashboard/examples/template/patterns/OnboardingPromptCard.tsx`
- Extracted from `/settings`:
  - `dashboard/examples/template/patterns/SettingsWorkbench.tsx`
- Extracted from `/settings` + `/portfolio` toolbar patterns:
  - `dashboard/examples/template/patterns/FilterBar.tsx`
- Extracted from table + lifecycle patterns:
  - `dashboard/examples/template/patterns/TemplateDataTable.tsx`
  - `dashboard/examples/template/patterns/TimelineInspector.tsx`
- Extracted from `/bankroll`:
  - `dashboard/examples/template/patterns/SnapshotComparisonGrid.tsx`
  - `dashboard/examples/template/patterns/GuardrailMeter.tsx`
- Extracted from `/portfolio`:
  - `dashboard/examples/template/patterns/HeadlineStatStrip.tsx`
  - `dashboard/examples/template/patterns/AuditTrailList.tsx`
- Gallery now includes dedicated sections for accounts/settings/bankroll/portfolio patterns.

## Suggested Next Extraction Pass
1. Add chart wrappers (`AreaTrend`, `StackedBars`) with neutral metric inputs.
2. Add `CommandPalette` for cross-page quick actions and navigation.
3. Add `SplitAlertConsole` pattern (active incidents + suppressed alerts + ack workflow).
