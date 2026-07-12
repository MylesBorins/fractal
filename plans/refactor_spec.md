# Fractal Explorer — Module Refactor Specification

## Executive Summary

The monolithic `main.js` (~1000 lines) has been split into modular files to reduce context bloat. The split is **structurally complete but functionally broken** due to import/export mismatches and inconsistent state access patterns. This spec defines the remaining work in 3 focused phases.

---

## Current Module Layout

```
index.html              — HTML + <script type="module"> entry
├── stateStore.js       — S object (all mutable state, config, UI toggles)
├── state.js            — Canvas, WebGL context, buffers, resize, utilities
├── shaders.js          — Shader compilation, program creation, uniform locations
├── render.js           — drawScene(), render loop, perf overlay, animation logic
├── interaction.js      — All event listeners (mouse, touch, keyboard, UI)
└── main.js             — Entry point: loads shader text, wires init, starts render
```

### Shader Sources

```
shaders/
├── fsQuad.glsl          — Mandelbrot / Julia
├── fsBS.glsl            — Burning Ship
└── fsSin.glsl           — Sinusoidal
```

All 3 fractal types now use separate `.glsl` files loaded via `<script type="shader-source">` tags.

---

## Phase 0 — Fix Import/Export Bugs (CRITICAL, blocks everything)

**Goal:** Make the app actually run in the browser.

### Issue A: `interaction.js` imports non-existent values

```js
// interaction.js line 1 — BROKEN
import { canvas, zoom, offset, minZoom } from './state.js';
```

`state.js` does NOT export `zoom`, `offset`, or `minZoom`. These live in `stateStore.js` as `S.zoom`, `S.offset`, `S.minZoom`.

**Fix:**
1. Change import to: `import { canvas } from './state.js';`
2. Change all `zoom = ...`, `offset.x = ...`, `minZoom` references to `S.zoom = ...`, `S.offset.x = ...`, `S.minZoom`

### Issue B: `interaction.js` uses bare globals for toggle state

```js
// interaction.js uses: isAutoZooming, isColorCycling, isIterOscillating, perfMode,
// iterOscillateMin, iterOscillateMax, iterOscillateSpeed, currentLerpSpeed
```

These are all defined in `stateStore.js` as `S.isAutoZooming`, etc. They are NOT global variables.

**Fix:** Replace all bare references with `S.<property>` access.

### Issue C: `main.js` uses globals not imported

```js
// main.js references: gl, shaderPrograms, shaderProgram, uniformLocations, canvas
```

`gl` and `canvas` are exported from `state.js`. `shaderPrograms` is exported from `shaders.js`.

**Fix:**
```js
import { gl, canvas } from './state.js';
import { shaderPrograms } from './shaders.js';
// shaderProgram and uniformLocations are local state in initShader()
```

### Issue D: `render.js` imports from `stateStore.js` and `state.js` but also uses bare DOM

`render.js` correctly imports `S` from `stateStore.js` and `buffers, perfCanvas, perfCtx, getFractalFamily, canvas, gl` from `state.js`.

It also uses `document.getElementById()` extensively — this is fine in browser context.

**Status:** OK, no changes needed.

### Issue E: `shaders.js` references `gl` but doesn't import it

```js
// shaders.js functions take `gl` as parameter — OK
// But initShaderPrograms(gl) is called from main.js which now needs to pass gl
```

**Status:** OK, `gl` is passed as parameter.

---

## Phase 1 — Clean Up State Access Patterns

**Goal:** Consistent, explicit state access across all modules.

### 1.1 Standardize on `S.` prefix

Every module that reads/writes state should use `S.<property>` from `stateStore.js`. No more bare globals.

**Modules affected:**
- `interaction.js` — all event handlers
- `render.js` — animation loop, auto-zoom, color cycle, auto-iterations
- `main.js` — init functions

### 1.2 Separate UI toggle state from fractal state

`stateStore.js` currently mixes:
- **Fractal navigation state:** `zoom`, `offset`, `minZoom`
- **Rendering config:** `isAutoZooming`, `isColorCycling`, `useAutoIterations`, etc.
- **Performance tracking:** `frameTimes`, `avgFPS`, `frameCount`
- **Shader management:** `shaderFamily`, `shaderProgram`, `shaderUniforms`

Consider splitting into:
```js
// stateStore.js
export const navState = { zoom, offset, minZoom };
export const renderConfig = { isAutoZooming, isColorCycling, ... };
export const perfState = { frameTimes, avgFPS, ... };
export const shaderState = { shaderFamily, shaderProgram, shaderUniforms };
```

**Optional** — if keeping as single `S` object, ensure clear naming and comments.

### 1.3 Export `S` from a single module

Currently `stateStore.js` exports `S`. `state.js` does NOT re-export it. All modules should import from `stateStore.js` directly.

---

## Phase 2 — Shader Uniform Consistency

**Goal:** All 3 shaders use identical uniform names and layout.

### 2.1 Current state

All 3 shaders (`fsQuad.glsl`, `fsBS.glsl`, `fsSin.glsl`) use the same uniforms:
- `uResolution`, `uOffsetHi`, `uOffsetLo`, `uZoomHi`, `uZoomLo`, `uIterations`, `uColorShift`

`fsQuad.glsl` also has `uFractalType` (uniform int).

### 2.2 `getUniformLocations` in `shaders.js`

Currently returns a fixed set of uniform locations. Since all shaders share the same uniform names, this is fine. No change needed.

**Status:** OK, no changes needed.

---

## Phase 3 — Performance & UX Polish

**Goal:** Make the refined codebase production-ready.

### 3.1 Add precision indicator to UI

Show current precision tier in the performance overlay or a dedicated UI element:
- "float32" when zoom > 1e-7
- "DS (~14 digits)" when zoom between 1e-7 and 1e-30
- "DS-Limited" warning when approaching zoom < 1e-30

### 3.2 Add keyboard shortcut hints

Show keybinding hints in the UI:
- `H` — toggle UI panel
- `P` — toggle performance mode
- Mouse wheel — zoom toward cursor
- Click-drag — pan

### 3.3 Error boundaries

Add shader compilation error display in the UI (hidden by default, shown on error).

### 3.4 Mobile panel improvements

The current mobile FAB + overlay pattern works. Consider:
- Smoother animation for panel open/close
- Swipe gestures to close panel

---

## File-by-File Change Summary

| File | Phase | Changes |
|------|-------|---------|
| `interaction.js` | 0 | Fix imports, replace all bare state refs with `S.<prop>` |
| `main.js` | 0 | Import `gl`, `canvas`, `shaderPrograms`; pass correctly |
| `stateStore.js` | 1 | Optional: group state into sub-objects (keep `S` as-is for now) |
| `state.js` | — | No changes needed |
| `shaders.js` | — | No changes needed |
| `render.js` | — | No changes needed (already uses `S` correctly) |
| `index.html` | — | No changes needed |
| `shaders/*.glsl` | — | No changes needed |

---

## Execution Order (Recommended)

```
Phase 0 (fix imports) → Test in browser → Phase 1 (cleanup) → Phase 2 (verify shaders) → Phase 3 (polish)
```

Phase 0 is blocking. The app currently does not work because `interaction.js` will throw import errors.

---

## Token-Efficient Implementation Notes

When implementing:
1. **Phase 0** = 2 edits per turn max (interaction.js, main.js)
2. Read only the specific lines that need changing (grep first)
3. Don't read full files — use offset/limit for context
4. Test after Phase 0 before proceeding
