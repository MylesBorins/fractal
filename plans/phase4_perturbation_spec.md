# Phase 4 — Perturbation Theory (deep zoom)

**Status:** v2 implemented + CPU-validated (node emulation of the exact shader pipeline, 7 scenes + interior-reference + sentinel-net + boundary-view tests all pass, 33/33). Auto mode simplified to On/Off (zoom threshold/hysteresis removed). **v4 interior reference (fixes the residual blockiness at mid zooms):** c_ref is now a nearby BOUNDED point, not the view center — a center outside the set made the whole view collapse onto the reference's escape envelope (flat band) plus sentinel-fallback patchwork (blocky; "zooming deeper fixed it" because deeper centers were interior). `selectRefCenter` does an O(1) full-budget f64 check of the center, else a quantized ring search (cache quantized to 1e-4, ~1 ms worst case) for a bounded point. Browser validation pending (headless Chrome blocked by nono sandbox; see tasks.md §10). Supersedes the stretch note in `zoom_precision_spec.md` §Phase 4 and the v1 architecture in this doc's git history.

**Goal:** extend the usable zoom of Mandelbrot/Julia/Tricorn from the DS ceiling (~1e-11) to ~1e-15 (aiming limit), with the 1e-30 path staged (v1.5 typed coordinates, v3 bignum orbit).

## 1. Math

Reference orbit `w` at `c_ref`; pixel `c = c_ref + δ_c`, `z = w + δ`:

```
z_{n+1} − w_{n+1} = (w_n+δ_n)² + c − (w_n² + c_ref)
                  = 2·w_n·δ_n + δ_n² + δ_c          (EXACT)
```

**δ_c is added at EVERY step** (earlier draft said first-step-only — wrong; the cusp test at (0.25,0) proves the per-step form). Linear term doubled: `Re(2wδ) = 2(wR·dR − wI·dI)`, `Im(2wδ) = 2(wR·dI + wI·dR)`.

**Key property:** error in δ_n is relative to δ, not |c|~1. Per-step DS residual ~2⁻⁴⁸·|δ_n| — sub-pixel at all v2 zooms, independent of zoom depth.

### Applicability by fractal type

| Type | Reference orbit w | Δ recurrence | v2? |
|---|---|---|---|
| 0 Mandelbrot | view center, w_0 = 0 | `2w_nδ_n + δ_n² + δ_c`, δ_0 = 0 | yes |
| 1 Julia | fixed point P of z²+c_j (w_n ≡ P, constant) | `2Pδ_n + δ_n²`, δ_0 = c − P, **no δ_c** (c_j cancels) | yes |
| 3 Tricorn | view center, w_0 = 0 | `dR' = baseR + dcR`, `dI' = dcI − baseI` where `base = δ² + 2wδ` (conj of full δ² + 2conj(w)conj(δ) + conj(δ_c) reduced to the form the test needs — verified against conj-of-full-orbit, 0/121) | yes |
| 2 Burning Ship | abs() non-holomorphic; piecewise with sign tracking | — | v3 |
| 4 Sinusoidal | sin is a series in δ, no closed form | — | v3 |

The Tricorn row is subtle: `conj(z)² = conj(z²)` makes the full-orbit transform clean, but the δ-form `δ² + 2wδ` must have its imaginary part negated *after* the δ² term (δ²'s own conjugate is conj(δ)² = dR² − dI² − 2i·dR·dI). CPU emulation mirrors the shader exactly and matches float64 ground truth to 0/121 at 1e-12.

## 2. v2 architecture (as built)

- **CPU float64 reference orbit** (2000 f64 iters/frame — negligible) uploaded as **RGBA32F 2001×1** texture, texel n = (wr_hi, wr_lo, wi_hi, wi_lo) f32 pairs (2⁻⁴⁸ absolute = 0.001 px at 1e-12). Single-f32 storage is NOT viable (2⁻²⁴ abs = 100,000 px at 1e-12).
- **GPU DS δ recurrence** per pixel; per-family init as in the table above. Julia reads P from texel 0 (no new uniform). MB/T: `δ_c = c − c_ref` computed in DS, where `c_ref` is the interior reference center passed as `uRefCx`/`uRefCy` (f32 hi/lo pairs) — NOT assumed to be the view center.
- **Escape test** on the reconstructed pixel `z_{i+1} = w_{i+1} + δ_{i+1}`, `|z|² > 256`, same iter convention as fsQuad (loop index i tests z_{i+1}; escape → iter = i).
- **Why the reference must be f64 (the v1→v2 change):** a GPU/DS reference accumulates ~2⁻⁴⁸/step, chaotically amplified (~2.7×/iter measured at the seahorse) through the ~10³-iter boundary transient, ejecting the orbit off its attractor — it escaped at iter 1052 where the exact (f64) orbit never escapes in 3000 iterations. Float64 stays on orbit. The δ solve is then exact-on-top of a true orbit.
- **Glitch safety:** NaN-safe `!(m2 < 256.0)` (a plain `m2 > 256` is false for NaN → silent no-escape); on NaN/Inf the pixel re-runs the full fsQuad DS loop (duplicated in-shader, rare path). Legitimate |δ| is bounded ~|z|+|w| ≤ 18, so no threshold heuristic needed — only NaN/Inf can reach the fallback.
- **Interior reference (v4 — REQUIRED for correctness at any zoom):** the δ solve is exact, but a pixel's rendered value is a function of BOTH the reference orbit and c_ref. If c_ref escapes (center outside the set), every pixel in the view that has not escaped by the reference's escape iteration collapses onto the reference's own escape envelope — a flat color band — and the sentinel fallback re-runs those pixels as a SECOND (full-DS) realization, producing a blocky δ/fallback patchwork. Both artifacts are "valid" per-pixel yet collectively wrong-looking. Fix: `selectRefCenter(type, offX, offY)` always picks a BOUNDED c_ref — the view center if its 2000-iter f64 orbit stays |z|²<256 (O(1), no texture), else a nearby bounded point from a ring search (3^k rings, 96 angles, cache quantized to 1e-4; ~0.6–1 ms worst case, e.g. seahorse valley center at r≈6.6e-3). With a bounded c_ref the whole view renders on ONE clean δ realization (0 sentinel hits, 0 fallbacks) at any zoom — validated numerically (histograms/adjacency/distribution match the f64 rendering of the same view; plans tasks.md §11).
- **Sentinel (last-resort safety net only):** `buildOrbitTexture` still fills texels after an escape with 1e15 (R channel) and the shader still detects `w.x > 1e4 || w.z > 1e4` and re-runs that pixel through the full double-single orbit. With interior reference selection this path is only reached if no bounded point exists within search radius — effectively never. The flat-band symptom at the spiral view (center outside the set) is now fixed by the interior reference, not by the fallback.
- **Mode selection (CPU, `perturb.js`):** auto = always perturb for types {0,1,3}; simple On/Off toggle (legacy auto/force split collapsed — the sentinel fallback means no zoom regime where quad is preferable; `selectFamily`'s zoom/hysteresis params are kept for API compat, unused). Disabled entirely when float textures are unsupported (WebGL1 without OES_texture_float) — render paths fall back to the full-DS shader for that frame.
- **Cost:** ~70 frounds/iter + 1 texture fetch/iter (cheaper than v1's ~170 frounds/iter with no fetch).

### v2 ceiling

Double *navigation* limit: offset is f64 (offsetHi f32 + offsetLo f32 = 2⁻⁴⁸ rel) → aiming quantizes at ~1e-15. Rendering at a fixed offset stays exact. → working range 1e-11 → ~1e-15.

## 3. Files

- `reference.js` — `orbitBounded` (full-budget f64 probe), `selectRefCenter` (center-or-ring-search, quantized cache), `buildOrbitTexture` (f64 orbit, f32-pair packing, 1e15 sentinel tail — safety net), `computeReferenceOrbit` = select+build (returns texture data + c_ref), `createRefTexture` (WebGL2 RGBA32F / WebGL1 + OES_texture_float, NEAREST), `uploadRefOrbit` (returns c_ref for the shader uniforms)
- `shaders/fsPerturb.glsl` — per-family δ init, DS recurrence, NaN-safe glitch + full-DS fallback, debug readout (self-test patch + center: R=iter/maxIter, G=log2|δ_final|, B=log2|w_last|), fsQuad-identical smooth coloring
- `perturb.js` — selectFamily (auto/off, type gating, support flag; zoom params legacy-ignored)
- `perturb.test.js` — Part A: selection unit tests; Part C: reference sanity + interior-reference selection (escaping center → bounded c_ref, no sentinel; low-level `buildOrbitTexture` still produces the sentinel tail); Part D: 11×11-px grids, fround-exact shader emulation vs float64 ground truth; Part E: interior-reference regression (spiral view: bounded ref, 0 fallbacks, diverse iterations) + synthetic sentinel net test (forces the safety-net path); Part F: boundary view (user-reported blocky view: 0 fallbacks/glitches, 81 distinct iters, not blockier than f64, ≥70% within 100 iter of f64)
- wiring: `index.html` (4th hidden shader container, toggle button), `shaders.js` (program + uRefOrbit loc), `render.js` (both paths: family select, ref upload, TEXTURE0 bind, float-texture fallback), `stateStore.js` (perturbMode/perturbSupported), `main.js` (4th source, createRefTexture probe, toggle enable)

## 4. CPU validation results (node perturb.test.js — ALL PASS)

| Scene | zoom | max|Δiter| | >1-off | note |
|---|---|---|---|---|
| Mandelbrot seahorse | 1e-12 | 76 | 0/121 | 3/121 edge-chaotic (min ≥ 1000); interior c_ref = center here (bounded) |
| Mandelbrot seahorse | 1e-15 | 0 | 0/121 | 3/121 edge-chaotic (escapes at 1800–1980) |
| Mandelbrot cardioid cusp (0.25,0) | 1e-12 | 0 | 0/121 | proves per-step δ_c + 2× linear term |
| Mandelbrot cusp right (0.2501,0) | 1e-12 | 0 | 0/121 | |
| Julia boundary (-0.7269,-0.1889) | 1e-12 | 1 | 0/121 | chaotic by nature |
| Julia smooth (2.5,0) | 1e-12 | 0 | 0/121 | |
| Tricorn seahorse | 1e-12 | 0 | 0/121 | |

Regression guard: flipping the 2× linear term to 1× fails 121/121 (Julia) and 31/121 false in-set (seahorse) — the suite discriminates the exact recurrence.

Chaotic-boundary methodology: a pixel "fails" only if |Δiter| > tol AND min(perturb, exact) < 1000 (EDGE_ITER); pixels escaping near the 2000-iter budget report `edgeChaotic` (informational) because no 2⁻⁴⁸/step method can match chaotic crossing times there — the f64 "ground truth" itself is one trajectory, not the set boundary.

## 5. Staging toward 1e-30

- **v1.5 (typed/preset coordinates):** 256-bit BigInt fixed-point; parse preset decimal strings directly (`parseFloat` destroys digits past 2⁻⁵³). New uniforms for exact bignum A = offset − c_ref. → ~1e-24 with 24-digit presets.
- **v3 (1e-30):** glitch rebase (recompute reference from a glitched pixel), series approximation, bignum orbit via texture, Burning Ship / Sinusoidal perturbation.

## 6. Pending browser validation (blocked: nono sandbox denies headless Chrome crashpad path)

- [ ] shader compile/link; toggle enables (console probe)
- [ ] **v4 interior reference:** user blocky view Mandelbrot (-0.7436, 0.1319) zoom ~2.5e-6 — expect smooth detail, NO flat band / NO quad-like blocks; confirm console shows `FRAC-BUILD v4-intref`; spiral view same check
- [ ] deep-zoom regression: seahorse 1e-12/1e-15, Julia, Tricorn unchanged vs v3
- [ ] visual parity quad vs perturb at 1e-11; deep-zoom correctness 1e-13…1e-15 (seahorse, cusp)
- [ ] debug readouts: center R=iter/maxIter, G=log2|δ| (expect ~log2(zoom)·|pixel offset|), B=log2|w|
- [ ] WebGL1 OES_texture_float path

Remediation (from sandbox skill): restart with `nono run --profile pi --allow ~/Library/Application\ Support/Google/Chrome -- pi` (one-off) or a promoted profile draft.
