# Agent Context

This document provides context for AI agents working on the Fractal Explorer project.

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

## Current Known Issues

1. **Julia Set** - Appears as solid color; viewport/offset control not working correctly
2. **Burning Ship** - "Borning" rendering issues; DS math breaking with `abs()` operations
3. **Tricorn** - Stretched/distorted appearance; aspect ratio calculation issue

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
