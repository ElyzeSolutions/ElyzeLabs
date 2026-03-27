# Skill-Orchestrated Gate Lanes

1. `design`: dashboard build + visual baseline.
2. `state`: Zustand/state correctness and unit checks.
3. `realtime`: integration reliability tests.
4. `browser`: agent-browser environment checks.
5. `performance`: queue/perf budget suite.
6. `refactor`: simplification and dead-path enforcement.

`pnpm quality:pipeline` persists lane results to SQLite for auditability.

Skill execution now supports:
- catalog-driven discovery from SQLite-backed catalog entries (`skill_catalog_entries`) with optional strict mode,
- per-skill `allowedCommands` payload gates,
- required tool checks (`requiredTools`) before enable/invoke.
