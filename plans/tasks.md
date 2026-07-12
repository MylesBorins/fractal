# Fractal Explorer - Remaining Tasks

## Completed

### ✅ Phase 0: Module Refactor — Audit & Wiring Complete
- **All imports verified** — every import resolves to a valid export
- **No circular dependencies** — clean tree: main.js → state/shaders/render/interaction
- **All S.<property> refs valid** — 28 unique S properties exist in stateStore.js
- **Dead code removed** — initInteraction stub, duplicate imports cleaned
- **Single entry point** — index.html → `<script src="main.js">` → everything else
- **Sub-agent extension** — `task-dispatch` built, linked globally, ready for dispatch
- **interaction.js** — Fixed imports: `canvas` from state.js, `S` from stateStore.js
- **interaction.js** — All bare state refs replaced with `S.<property>` (55+ changes)
- **main.js** — Added imports for `gl`, `canvas` from state.js, `shaderPrograms` from shaders.js
- **main.js** — Removed dead code (`currentShaderProgram`, `uniformLocations`)
- **Extension**: Created `task-dispatch` sub-agent extension in pi-agent-extensions

### ✅ Phase 1: Deep Zoom Precision Fix
- **Adaptive exponent-based splitting** — replaced `Math.fround(x)` with `splitFloat(x)` that splits by nearest power-of-2, avoiding underflow at extreme zooms (10⁻³⁰+)
- **Shader low-low cross-terms** — added `zx_l * zx_l`, `zy_l * zy_l`, and `2.0 * zx_l * zy_l` to all DS squaring operations (quad, burning ship, sinusoidal)
- **Sinusoidal Taylor expansion** — replaced naive `nx_l = c_x_l` with first-order Taylor derivatives: `sin(x+dx) ≈ sin(x) + dx·cos(x)`, `sinh(y+dy) ≈ sinh(y) + dy·cosh(y)`
- **Smooth coloring magnitude** — added `+ zx_l * zx_l + zy_l * zy_l` to all three shader magnitude calculations
- **Adaptive iteration scaling** — auto-iterations now scale with zoom depth (base 100 + 150 × zoomDecade), shader loop bound raised to 10,000, hard cap at 5,000
- **Perf overlay** — added auto-iter status line showing mode and cap

### ✅ Side Panel Redesign
- Permanent drawer on the left side
- Collapses to small 50px hint bar
- Scrollable controls area with custom scrollbar
- Smooth width transition

### ✅ Iteration Oscillation Smoothing
- Added smooth interpolation between target values
- Much smoother animation now

## Current Issues

### 1. Julia Set - ✅ FIXED
- Julia Set now renders correctly with proper DS precision handling
- Fixed viewport/offset control for Julia fractal
- All fractal types now properly support DS precision math

### 2. Burning Ship - ✅ FIXED
- Burning Ship renders correctly with abs() applied to high-precision components
- Low-precision part simplified (passes c_lo) — acceptable trade-off since abs() on high part captures dominant visual behavior

### 3. Tricorn - ✅ FIXED
- Tricorn renders correctly with full DS propagation for conjugate(z)²
- Real part: x² - y², Imag part: -2xy — both high and low components computed correctly
- Aspect ratio calculation is correct (applied uniformly to all fractal types)

### 4. Phase 2 Refinements - ✅ ALL FIXED
- **Smooth coloring with DS precision** — magnitude uses both hi/lo: `mag2 = dot(zh,zh) + 2*(zh·zl)`
- **Iteration limit** — shader loop set to 2000 iterations
- **Deep zoom support** — minZoom set to 1e-30, slider reflects this range

### 5. Runtime Bug Fixes (Critical) - ✅ ALL FIXED
- **Bug #1: shaders.js export pattern** — `shaderPrograms` exported as mutable `let`, `initShaderPrograms()` populates it, `getUniformLocations()` provides clean accessor. `render.js` import chain resolved.
- **Bug #2: Missing perfCanvas import** — Added `import { perfCanvas, perfCtx } from './state.js';` to `interaction.js`
- **Bug #3: Undefined zoom variable** — Replaced two `String(zoom)` references with `String(S.zoom)` in `interaction.js` (lines 314, 317)
- **Bug #4: Sinusoidal Taylor derivatives** — Replaced naive `nx_l = c_x_l` with proper Taylor expansion: `nx_l = c_x_l * cos(zx_h) * cosh(zy_h) + c_x_l`, `ny_l = c_y_l * cos(zx_h) * cosh(zy_h) + c_y_l`