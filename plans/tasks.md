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
- **🔴 CRITICAL BUG FOUND + FIXED (2026-07-09)** — `split()` used `hi = s - a` (yields ~8192a, the WRONG half) instead of Veltkamp's `hi = s - (s - a)`. `twoProd`'s error term became garbage (cancellation of 2^26·ab terms) → lo channel of every multiplication destroyed → the entire DS pipeline ran at float32 + O(2⁻²⁴) noise/step. Browser symptom: ~15px blocky squares at 1e-5 zoom. Caught by `dsMath.test.js` (Node `Math.fround` emulation of the exact GLSL pipeline — 200k-case exactness checks + user-scene orbit tracking); one-line shader fix; post-fix: twoProd exact 200k/200k, c-construction worst err 3.2e-15, 60-iter DS orbit diverges 0.0006px from exact float64. **Lesson: Phase 2's "verified by inspection" was the gap — the fround-emulation test now guards the pipeline**
- **⚠️ Perf (3.3 pending)** — inner loop ~3.5× ALU (~60 vs ~17 ops/iter); if fps unacceptable, add uniform `uPreciseMode` hybrid (cheap DS below zoom threshold, error-free above)

### 9. Zoom Precision Spec — Phase 3 (Not Started)
- Validation against reference images and precision ceiling testing

### 10. Phase 4 — Perturbation Theory (✅ v2 + v4 interior reference, CPU-Validated 33/33, browser validation pending)
- **Spec**: `plans/phase4_perturbation_spec.md`
- **Architecture (v2, numerically proven)**: CPU **float64** reference orbit `w_n` (view center for MB/Tricorn, Julia fixed point P for Julia) → RGBA32F 2001×1 texture (f32 hi/lo pairs) → GPU DS δ recurrence with `δ_c = c − c_ref` added each step (MB/Tricorn, `δ_0 = 0`); Julia: `δ_0 = c − P`, no `δ_c` (c_j cancels). Pixel value `z_{n+1} = w_{n+1} + δ_{n+1}`, escape `|z|² > 256`, iter convention identical to fsQuad.
- **Why CPU f64 reference (v1 → v2 change)**: a DS reference accumulates ~2⁻⁴⁸/step, chaotically amplified (~2.7×/iter) during the ~10³-iter boundary transient, ejecting the orbit off its attractor (escaped at iter 1052 where the exact orbit never escapes). Float64 stays on orbit. Reference orbit cost is 2000 f64 iters/frame on CPU — negligible.
- **Sentinel fix (found via user report, CPU-validated)**: when the view center is outside the set, the reference orbit escapes (e.g. spiral view: iter 180) and the old code stepped δ through the 1e15 sentinel texels — every slow/in-set pixel rendered at iter 179 with a huge smooth value → the whole view one flat color band ("force perturb doesn't work correctly"). Fix: shader detects the sentinel (`w.x > 1e4 || w.z > 1e4`) and re-runs the pixel through the full double-single orbit (same duplicated fallback loop as the glitch path — bit-identical to fsQuad). Perturb is now exact at ANY zoom (early pixels via δ, tail pixels via full orbit), so the zoom threshold + hysteresis are removed: **auto = always perturb** for types {0,1,3} when float textures are supported; the UI toggle is now a simple On/Off (legacy `force` normalized to `auto`). Regression: `perturb.test.js` Part E (spiral view: 180/441 fallback pixels all == full DS orbit; 130 distinct iteration values vs 1 before).
- **Files**: `reference.js` (f64 orbit + f32-pair texture upload, 1e15 sentinel tail, `OES_texture_float` WebGL1 fallback), `shaders/fsPerturb.glsl` (per-family δ init, NaN-safe glitch check + sentinel detection, full-DS fallback loop, debug readout, fsQuad-identical coloring), `perturb.js` (auto/off + float-texture gating; zoom params legacy-ignored), `perturb.test.js` (fround-exact emulation of the shader pipeline vs float64 ground truth + sentinel regression)
- **CPU validation (node perturb.test.js, ALL PASS)**: 11×11-px grids at 2000 iters vs float64 exact orbits — Mandelbrot seahorse 1e-12 & **1e-15** (0/121 off; 3/121 edge-chaotic only among escape-time 1800–1980 pixels), cardioid cusp (0.25,0) & cusp-right (0.2501,0) 1e-12 (0/121), Julia boundary 1e-12 (maxΔ=1, chaotic), Julia smooth (2.5,0) 1e-12 (0/121), Tricorn seahorse 1e-12 (0/121). Suite catches the 2×-linear-term bug (regression test: 1× variant fails 121/121 on Julia)
- **Shader fix during port**: base terms must be δ² + **2**wδ (the 2wδ linear term is doubled: Re = 2(wR·dR − wI·dI)); first port missed the doubling — caught by the Node emulation before it could ship
- **Wiring**: 4th shader source + hidden container (index.html), `shaderPrograms['perturb']` + `uRefOrbit` loc (shaders.js), both render paths (drawScene/drawSupersampled) select family + upload ref orbit + bind TEXTURE0, float-texture fallback rebinds attribs and renders full DS, toggle button cycles On→Off (disabled when unsupported), state: `perturbMode`/`perturbSupported`
- **Pending (needs a real WebGL browser; headless Chrome blocked by nono sandbox — crashpad EPERM on `~/Library/Application Support/Google/Chrome`)**:
  - [ ] Shader compile/link, perturb toggle enables (RGBA32F probe in console)
  - [ ] **Sentinel views**: spiral view (center outside set, ref escapes iter 180) — expect full detail, NO flat band, visually equal to quad; in-set pixels black
  - [ ] Visual parity quad vs perturb at shallow zoom (sentinel regime) and 1e-11, deep-zoom correctness at 1e-13…1e-15 (seahorse + cusp), debug-mode readouts (center: R=iter/maxIter, G=log2|δ|, B=log2|w|)
  - [ ] WebGL1 path (OES_texture_float) if a WebGL1 context can be forced
- **v4 interior reference (fixes residual mid-zoom blockiness, CPU-validated)**: the sentinel fix made each pixel *individually* correct, but with an escaping center reference the whole view still collapsed onto the reference's escape envelope (flat band) with the fallback pixels forming a second full-DS realization (blocky patchwork) — "zooming deeper fixed it" because deeper centers happened to be interior. Fix: `selectRefCenter` always picks a **bounded** c_ref (center if its 2000-iter f64 orbit is bounded, else quantized ring search, ~1 ms worst case); shader takes `uRefCx/uRefCy` and computes `δ_c = c − c_ref`; sentinel remains as a last-resort safety net. Result on the user's blocky view (-0.7436, 0.1319, zoom 2.5e-6, 920 iters): 0 fallbacks, 0 glitches, 81 distinct iteration values, texture stats matching the f64 rendering (histogram/adjacency/mean-|Δ| all in the f64's own chaotic range; 97% of pixels within 100 iters of f64 — the remainder are legitimate chaotic-boundary realizations, not artifacts). Suite now 33/33 incl. new Parts C/E/F (interior selection, spiral-view regression, synthetic sentinel net, boundary view).
- **v1.5/v3 roadmap (unchanged)**: typed/preset coordinates via 256-bit BigInt fixed-point → ~1e-24; bignum orbit texture → 1e-30

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