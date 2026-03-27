# Virtual Office Reliability

## Renderer Architecture
- The virtual office is a custom-built, lightweight 2D procedural pixel-art simulation.
- Uses standard HTML5 `<canvas>` rendering (`ctx.fillRect`, `ctx.translate`) instead of loading external images, eliminating network requests and asset loading failures.
- Entities are completely dynamic, calculating real-time pathing to designated procedural regions (e.g., desks, lounge, kitchen) based on agent status (`active` vs `idle`).

## Reliability Criteria
- Procedural `Canvas2D` renderer ensures zero external network dependencies, heavily reducing failure vectors.
- Office renderer is isolated in `requestAnimationFrame` loop to not block primary React dashboard routes.
- Stream disconnect auto-recovers with sequence replay.
- Fallback mode (`board`) available when map rendering fails (e.g. strict CSP or incompatible WebGL/Canvas APIs).

## Degradation Plan
1. Detect Canvas API initialization failure, stream timeout, or malformed office payload.
2. Show warning banner and auto-switch to board mode.
3. Keep session/run control actions available.
