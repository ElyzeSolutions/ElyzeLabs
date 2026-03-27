# Template UI Components

Domain-neutral React components intended for copy/reuse in new dashboard projects.

## Included components
- `SectionCard`: reusable panel shell with heading/subheading/actions slots.
- `KpiCard`: metrics tile used for dashboard summary strips.
- `StatusBadge`: status token (`running`, `paused`, `stopped`, custom).
- `ActionButton`: consistent operator action button with tone variants.
- `ModuleCard`: module row/card pattern with actions and quick stats.
- `ReadinessChecks`: pass/fail pill group for health checks.
- `EventFeed`: event timeline list with level coloring.
- `ExampleTable`: lightweight typed table scaffold.
- `NoticeStrip`: info/warning/error inline notices.
- `EmptyState`: empty-data callout block.
- `RuntimeDashboard`: assembled runtime page using reusable components.
- `ComponentGallery`: static showcase page for all components.
- `layout/TemplateShell`: reusable app shell (sidebar + topbar + mobile nav).
- `data/VirtualizedEventList`: high-volume list virtualization pattern.
- `patterns/TabbedInspector`: reusable inspector tabs with badges.
- `patterns/MetricCardGrid`: KPI strip wrapper built on `KpiCard`.
- `patterns/TrendPanel`: lightweight trend visualization panel.
- `patterns/ContextLensBar`: compact context/scope lens control rail.
- `patterns/OnboardingPromptCard`: onboarding empty-state prompt with actions.
- `patterns/SettingsWorkbench`: responsive settings tab shell with dirty markers.
- `patterns/FilterBar`: search + chip groups + saved views toolbar.
- `patterns/TemplateDataTable`: sortable table with sticky columns and row selection.
- `patterns/TimelineInspector`: lifecycle timeline with side-panel drilldown.
- `patterns/SnapshotComparisonGrid`: side-by-side environment snapshot cards.
- `patterns/GuardrailMeter`: threshold/limit progress meter with warning states.
- `patterns/HeadlineStatStrip`: large headline KPI strip for summary pages.
- `patterns/AuditTrailList`: policy/audit timeline list with severity badges.
- `legacy/LegacyShellShowcase`: Polybot-inspired sidebar/topbar/mobile shell example.
- `legacy/LegacyThemeSwatches`: preserved color/background token direction.

## Usage
Browse these files directly as reference patterns, then copy/adapt into your project modules as needed.

Note: this folder is kept outside `dashboard/src` intentionally, so examples do not ship in the runtime dashboard bundle.
