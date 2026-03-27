# Template Shell

Reusable layout primitives extracted from Polybot shell patterns and made domain-neutral.

## Components
- `TemplateShell`: wrapper composing sidebar, topbar, and mobile nav.
- `TemplateSidebar`: grouped navigation with desktop rail + mobile drawer behavior.
- `TemplateTopbar`: title/subtitle/status bar with optional right-side metadata slot.
- `TemplateMobileNav`: compact bottom navigation for small screens.

## Typical Usage
Pass your nav config and active route/view id to `TemplateShell`, then render page content as `children`.
