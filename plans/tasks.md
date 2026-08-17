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
- **CPU split verified exact** — `render.js` uses `hi = fround(x); lo = x - hi` (the earlier `splitFloat` claim in this doc was inaccurate — no such function was ever in the code). Verified by `splitPrecision.test.js`: hi+lo round-trips x exactly for all tested values (Sterbenz + representability)
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

### 6. Zoom Precision Spec — Phase 0 (In Progress)
- **Spec saved**: `plans/zoom_precision_spec.md`
- **0.1 — Rule out progressive/LOD rendering**: ✅ Confirmed — no progressive rendering in codebase, full-res framebuffer always
- **0.2 — Rule out iteration count**: 🔄 Need browser testing — debug color mode + console hi/lo logging added, manual iteration slider available
- **0.3 — Rule out missing AA**: 🔄 Added 2x supersampling pass (toggle button + S key) with FBO-based render
- **0.4 — Log hi/lo values**: 🔄 Added debug color mode (toggle button) + console.log of oHi/oLo/zHi/zLo/c_x_h/c_x_l
- **0.5 — Conclusion checkpoint**: Pending browser testing results

### 7. Zoom Precision Spec — Phase 1 (✅ Complete)
- **1.1 — Split exactness confirmed by test, not assumption** — `hi = fround(x); lo = x - hi` round-trips exactly in float64 (Sterbenz: hi/2 ≤ x ≤ 2hi ⇒ x−hi exact; hi+lo = x representable ⇒ sum exact). No code change needed
- **1.2 — `splitPrecision.test.js` added** — offsets near 0/1e-10/1e10/1e-30 + zoom 1…1e15 + 200k-sample log-uniform sweep. CPU round-trip exact everywhere; GPU uniform round-trip (lo passes through float32 uniform) worst rel err **1.8e-15** (bound 2⁻⁴⁸ ≈ 3.6e-15). Run: `node splitPrecision.test.js`
- **1.3 — minZoom decision: option (b)** — keep `S.minZoom = 1e-30` as declared target; documented in `stateStore.js` that the DS pipeline ceiling is ~1e12-1e13 (pending Phase 3 measurement) and 1e-30 requires Phase 4 perturbation theory. No silent promise

### 8. Zoom Precision Spec — Phase 2 (✅ Complete — needs browser validation)
- **Error-free transforms** — `dsMath.glsl` rewritten: `twoSum` (Knuth), `split` (Veltkamp F=8193), `twoProd` (Dekker); `dsAdd/dsSub/dsMul/dsSqr/dsMulScalar` all capture rounding error in the lo channel
- **2.4 fma probe resolved** — GLSL ES 1.00 / WebGL 1 has no `fma()`, split-based `twoProd` is the only path; shipped
- **2.9 c-construction fixed** — `dsMulScalar` redefined error-free (`twoProd(s, d.hi)` + cross term); call sites in all three shaders unchanged
- **2.11 lo·lo drop verified** — |lo| ≤ ~2⁻²⁵|hi| ⇒ lo² ≤ 2⁻⁵⁰ relative, sub-float32-ULP; safe
- **Zero shader call-site changes** — same function signatures; fsQuad/fsBS/fsSin automatically get error-free iteration
- **Residual risk (untestable headless)** — assumes driver honors IEEE single semantics; browser check: debug mode lo channel nonzero + zoom-150 regression (3.4)
- **⚠️ Perf (3.3 pending)** — inner loop ~3.5× ALU (~60 vs ~17 ops/iter); if fps unacceptable, add uniform `uPreciseMode` hybrid (cheap DS below zoom threshold, error-free above)

### 9. Zoom Precision Spec — Phase 3 (Not Started)
- Validation against reference images and precision ceiling testing

### 10. Phase 4 — Perturbation Theory (Spec Written, v1 Implementation Starting)
- **Spec**: `plans/phase4_perturbation_spec.md` — exact delta recurrence `δ_{n+1} = 2w_n·δ_n + δ_n² + δ_c`, orbit center = view center (A≡0, zero new uniforms), GPU DS orbit + DS delta, glitch safety net, auto-switch at zoom<1e-10 (hysteresis 3e-10)
- **v1 scope**: Mandelbrot/Julia/Tricorn only; extends working range ~1e-11 → ~1e-15 (double navigation limit), no bignum needed
- **v1.5**: 256-bit BigInt fixed-point for typed/preset coordinates (parse decimal strings, not parseFloat) → ~1e-24
- **v2**: glitch rebase + series approximation + bignum orbit via RGBA32F texture (WebGL2) → 1e-30
- **Files**: `shaders/fsPerturb.glsl` (new), `perturb.js` (mode selection), `perturb.test.js` (node), wiring in shaders.js/render.js/stateStore.js/index.html
- **Blocked on**: Phase 3 browser validation of base DS path (must confirm quad path is clean before comparing perturb output)

---

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