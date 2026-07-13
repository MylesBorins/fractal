# Fractal Zoom Precision Spec

## Goal
Fix the actual cause of pixelation at zoom ~150, then correct the latent DS (double-single) arithmetic bugs before they become the limiting factor at higher zoom.

## Non-goals (this spec)
- Perturbation theory / arbitrary-precision reference orbits (belongs in a future spec once DS is verified correct and its ceiling is actually reached)
- UI/UX changes to zoom controls
- Color mapping / palette work

---

## Phase 0 — Diagnose (do this before touching any math)

Zoom 150 is ~3-4 orders of magnitude below where float32 alone would break down, and ~9-10 orders below where DS breaks down. The DS pipeline is very unlikely to be the cause. Confirm before fixing the wrong layer.

- [ ] **0.1 — Rule out progressive/LOD rendering.** Check if the renderer drops resolution during pan/zoom for framerate. Reproduce the pixelation on a fully settled, static frame (no interaction for 2+ seconds) before concluding it's a math bug.
- [ ] **0.2 — Rule out iteration count.** Re-render the same zoom-150 view with iteration count increased 5-10x. If blockiness is unchanged, iteration count is not the cause.
- [ ] **0.3 — Rule out missing AA.** Check current supersampling/AA setting. Render at 2x2 or 4x supersample and compare.
- [ ] **0.4 — Log actual hi/lo values at the reported zoom/offset.** Add a temporary debug readout (console.log or on-screen) of `oHi`, `oLo`, `zHi`, `zLo`, and `c_x_h`/`c_x_l` for the center pixel and a corner pixel. Confirm they match the expected magnitudes from the analysis (lo terms should be well within float32 range at this zoom).
- [ ] **0.5 — Conclusion checkpoint.** Only proceed to Phase 1/2 if 0.1-0.4 confirm the artifact persists on a static, fully-iterated, AA'd frame with sane hi/lo values. Otherwise, root cause is elsewhere (write up findings, this spec doesn't apply).

---

## Phase 1 — CPU-side split correctness

Even though this isn't the zoom-150 cause, `Math.fround` splitting is imprecise in a way that matters once you're near float32's ceiling (~zoom 10^5+). Fix now so Phase 2 isn't validated against a flawed input.

- [ ] **1.1 — Replace ad hoc split with a verified two-sum-based split.** `hi = fround(x); lo = x - hi` is *already* exact for a JS double split into float32 hi + float64 lo (this part is fine — the "lose 8 digits" framing in the original doc is slightly off; the real bug is downstream in the GPU adds/multiplies not preserving remainders). Confirm this with a unit test rather than assuming: pick `x = 0.740000019999...`, split, and verify `hi + lo` round-trips to `x` within float64 epsilon.
- [ ] **1.2 — Add a CPU-side unit test file** (`splitPrecision.test.js` or similar) covering: offset near 0, offset near 1e-10, offset near 1e10, zoom from 1 to 1e15. Assert `hi + lo ≈ original` for each.
- [ ] **1.3 — Decide fate of `S.minZoom = 1e-30`.** This value implies an intended zoom depth (10^30) that neither float32-split-DS nor the current GPU math can reach (DS ceiling is ~10^12-10^13). Either: (a) lower `minZoom` to something DS can actually deliver, or (b) flag this as the trigger for the Phase 4 perturbation-theory work later. Don't leave it silently promising precision the pipeline can't deliver.

---

## Phase 2 — GPU DS math correctness (error-free transforms)

This is the real bug: float32 `+` and `*` in the shader silently drop their own rounding error, which defeats the purpose of carrying a `lo` channel at all. Fix by replacing raw ops with error-preserving primitives for every operation in the iteration loop.

- [ ] **2.1 — Implement `twoSum(a, b)`** in `fsQuad.glsl`. Returns `vec2(sum, error)`. Standard Knuth two-sum, no `fma` dependency.
- [ ] **2.2 — Implement `split(a)`** (Veltkamp split, ~12-bit halves) as a helper for exact multiplication.
- [ ] **2.3 — Implement `twoProd(a, b)`** using `split`. Returns `vec2(product, error)`.
- [ ] **2.4 — Test whether the target GLSL/driver has a true `fma()`.** Write a probe: compute `fma(a, b, -a*b)` for known `a, b` where the exact error term is known and nonzero; if the result is 0, the driver is faking `fma` as `a*b+c` and you must use the `split`-based `twoProd`, not the `fma` shortcut. Record the result — this determines which `twoProd` implementation ships.
- [ ] **2.5 — Implement `dsAdd(a: vec2, b: vec2) -> vec2`** using `twoSum` + renormalization.
- [ ] **2.6 — Implement `dsSub(a: vec2, b: vec2) -> vec2`** (negate + `dsAdd`, or dedicated two-sum variant).
- [ ] **2.7 — Implement `dsMul(a: vec2, b: vec2) -> vec2`** using `twoProd` plus cross terms (`a.hi*b.lo + a.lo*b.hi`), dropping only the `lo*lo` term (justified — confirm magnitude is sub-float32-ULP relative to the retained terms, don't just assume).
- [ ] **2.8 — Implement `dsSqr(a: vec2) -> vec2`** as a specialization of `dsMul(a, a)` (cheaper: one `twoProd` instead of two).
- [ ] **2.9 — Rewrite the `c_x`/`c_y` construction** (`uOffsetHi + fx*uZoomHi`, etc.) to use `dsAdd`/`dsMul` instead of raw float ops, so the world-coordinate computation itself doesn't reintroduce the error the split was trying to avoid.
- [ ] **2.10 — Rewrite the `z = z² + c` iteration** to use `dsSqr`, `dsSub`, `dsAdd` throughout, replacing the current manual `zx2_h`/`zx2_l` computation.
- [ ] **2.11 — Confirm the dropped `z_l²` term is still safe to drop** under the new, more precise pipeline (it should be — `z_l²` is ~2^-48 relative — but verify once, don't inherit the assumption unchecked from the old math).

---

## Phase 3 — Validation

- [ ] **3.1 — Reference image comparison.** Pick 2-3 known Mandelbrot deep-zoom coordinates (published seahorse valley / mini-brot locations with known appearance) at zoom levels 10^4, 10^8, 10^11. Render before/after Phase 2 and visually diff.
- [ ] **3.2 — Precision breakdown point test.** Push zoom up in steps (10^10, 10^11, 10^12, 10^13) at a fixed high-detail coordinate. Identify the zoom level where artifacts first appear post-fix. Record it — this is your empirical DS ceiling, and it should land close to the theoretical ~10^12-10^13, meaningfully deeper than before the fix.
- [ ] **3.3 — Performance check.** `twoSum`/`twoProd` roughly double-to-triple the ALU cost of the iteration inner loop. Measure fps impact at a representative resolution/iteration count. If unacceptable, consider a hybrid: plain DS (current cheap ops) below some zoom threshold, error-free DS above it.
- [ ] **3.4 — Regenerate the zoom-150 test case from Phase 0** and confirm it's unaffected (it should look identical, since the real fix was elsewhere per 0.5) — this closes the loop on whether Phase 0's diagnosis was correct.

---

## Phase 4 — Future / stretch (not scoped now)

- [ ] Perturbation theory: CPU-side arbitrary-precision reference orbit (bignum) + per-pixel float32 delta iteration on GPU. Required if you actually want to approach `S.minZoom = 1e-30`. Glitch detection and orbit rebasing are required companion pieces, not optional extras — flag as its own spec when you get here.

---

## Suggested order of execution
Phase 0 → (branch based on 0.5 outcome) → Phase 1 → Phase 2 → Phase 3. Phase 4 is a separate future spec, not a continuation.
