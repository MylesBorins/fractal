# Agent Context

This document provides context for AI agents working on the Fractal Explorer project.

## ⚠️ Token Budget Rules — READ FIRST

See [`AGENTS_WORKFLOW.md`](./AGENTS_WORKFLOW.md) for full workflow rules. Key rules:

1. **Never >2 edits per turn** — Phase 3 = 5 edits = 2-3 turns
2. **Never read full files** — use grep + offset/limit, max 30 lines at a time
3. **Shaders should be separate files** — see AGENTS_WORKFLOW.md Rule 3

## Project Overview

A WebGL-powered fractal visualization tool implementing Double-Single (DS) precision arithmetic for deep zooming (up to 10⁻³⁰).

## Key Files

| File | Purpose |
|------|---------|
| `index.html` | UI controls and canvas setup |
| `main.js` | WebGL rendering, DS precision math, user interaction |
| `style.css` | UI styling with collapsible side panel |
| `plans/` | Task tracking and implementation plans |

## Plans Directory

The [`plans/`](./plans/) directory contains the source of truth for work items:

- **`tasks.md`** - Current issues and completed items
- **`zoom_fix_plan.md`** - DS precision implementation phases

## Technical Context

### Double-Single Precision

The shader uses DS precision to overcome WebGL floating-point limits:

```glsl
// Uniforms split into high/low components
uniform vec2 uOffsetHi, uOffsetLo;
uniform float uZoomHi, uZoomLo;

// z represented as (z_hi + z_lo)
float zx_h, zx_l, zy_h, zy_l;
```

### Fractal Types (uFractalType)

| Value | Fractal | Formula |
|-------|---------|---------|
| 0 | Mandelbrot | z = z² + c |
| 1 | Julia | z = z² + juliaC (fixed) |
| 2 | Burning Ship | z = (\|Re\| + i\|Im\|)² + c |
| 3 | Tricorn | z = conjugate(z)² + c |
| 4 | Sinusoidal | z = sin(z) + c |

## Working on Issues

1. Read the relevant plan in `plans/`
2. Understand the current implementation in `main.js`
3. Test changes in browser with WebGL
4. Update `plans/tasks.md` when complete

## Priorities

See [`plans/tasks.md`](./plans/tasks.md) for current task status.
