# Phase 4 — Perturbation Theory (deep zoom to 1e-30)

**Status:** v1 scoped, starting implementation. Supersedes the stretch note in `zoom_precision_spec.md` §Phase 4.

**Goal:** make `S.minZoom = 1e-30` deliverable. Phase 2's error-free DS caps at ~1e12–1e13 (pending 3.2): DS precision on |c|~1 is ~7e-15 absolute = one pixel at `zoom ≈ 3.5e-11`. Perturbation moves the precision requirement off |c| and onto the pixel delta δ, whose magnitude scales with zoom.

## 1. Math

Reference orbit `w` at `c_ref`; pixel `c = c_ref + δ_c`, `z = w + δ`, `z_0 = 0` (Mandelbrot):

```
δ_{n+1} = z_{n+1} − w_{n+1} = (w_n+δ_n)² + c_ref + δ_c − w_n² − c_ref
        = 2·w_n·δ_n + δ_n² + δ_c        (EXACT, δ_0 = 0)
```

**Key property:** all error in δ_n is *relative to δ*, not to |c|~1. Per-step error ~2⁻⁴⁸·|δ_n| (DS ops); worst-case (parabolic reference, N=2000) accumulates to ~1e-8 of a pixel, independent of zoom depth. That is the whole win.

Escape test uses `z_n = w_n + δ_n` directly (exact sum in DS).

### Applicability by fractal type

| Type | Delta recurrence | v1? |
|---|---|---|
| 0 Mandelbrot | `2w_n·δ_n + δ_n² + δ_c`, δ_0 = 0, w_0 = 0 | yes |
| 1 Julia (fixed c_j) | `2w_n·δ_n + δ_n²`, δ_0 = δ_c, w_0 = c_ref | yes |
| 3 Tricorn | `2·conj(w_n)·conj(δ_n) + conj(δ_n)² + δ_c` | yes |
| 2 Burning Ship | abs() is non-holomorphic; piecewise perturbation with sign tracking | v2 |
| 4 Sinusoidal | sin expansion is a series in δ, not a closed form | v2 |

## 2. v1 architecture (no bignum)

- **Orbit center = current view center, always** (`c_ref = S.offset`). This is implicit per-frame auto-rebasing: `A = offset − c_ref ≡ 0`, `δ_c = fx·zoom`, and the perturbation shader consumes **exactly quad's uniform set** (uResolution, uOffsetHi/Lo, uZoomHi/Lo, uIterations, uColorShift, uFractalType, uDebugMode, uSuperSample). Zero new uniforms.
- **GPU computes the reference orbit in DS** (w_0=0; `w_{n+1} = dsSqr(w) + c_ref`). No per-frame bignum orbit, no texture upload. DS orbit absolute error ~7e-12 at |w|~1 feeds the delta recurrence *relative* to δ (term `2εw·δ_n`), so it stays sub-pixel across all v1 zooms.
- **Delta loop in DS:** `δ ← dsAdd(dsSqr(δ), dsMul(2w, δ))` (+`δ_c` only at n=0 for Mandelbrot/Tricorn — fold δ_c into δ_0, since δ_0 = δ_c after the first step... note: δ_0=0, δ_1 = 2w_0·0 + 0 + δ_c = δ_c — so add δ_c only on first iteration).
- **Glitch safety net:** if |δ_n| > 1.0 mid-loop (shouldn't happen in v1 range), break and re-run the full DS fallback loop (duplicated in-shader, rare path). Real glitch/rebase machinery is v2.
- **Mode switch (CPU):** `zoom < 1e-10 → perturb` (hysteresis: back to quad above 3e-10); only for fractalType ∈ {0,1,3}; types {2,4} stay on their DS shaders. Threshold is well above the DS ceiling, so the switch point itself is invisible.
- **v1 ceiling:** double *navigation* limit — offset ulp ~1e-16 = one pixel at zoom ~1e-15 (rendering at a fixed offset stays exact; aiming quantizes). So v1: 1e-11 → ~1e-15, i.e. 2+ more decades for free.

## 3. Staging toward 1e-30

- **v1 (now):** above. Files: `shaders/fsPerturb.glsl` (new; quad's DS fallback loop duplicated for glitch path), `perturb.js` (CPU mode selection + hysteresis state), `shaders.js` (+perturb program), `render.js` (program pick), `stateStore.js` (S.perturbMode: 'auto'|'off'|'force'), `index.html` (debug toggle: Auto/Off/Force), `perturb.test.js` (node: threshold/hysteresis/type-gating).
- **v1.5 (typed/preset coordinates):** 256-bit BigInt fixed-point. Parse preset decimal strings directly (e.g. `-0.743643887037158704762` keeps all 24 digits — `parseFloat` currently destroys them). New uniforms `uADeltaHi/Lo` = `offset_bignum − c_ref_bignum` (exact small number, ~zoom magnitude); `δ_c = A + fx·zoom`. Bignum offset for deep pan. → reaches preset precision (~1e-24 with current 24-digit presets).
- **v2 (1e-30):** glitch detection with orbit rebase (recompute reference from a glitched pixel), series approximation (polynomial fit on early orbit, skip to iter N), bignum orbit sent via WebGL2 RGBA32F texture (WebGL1 fragment uniform limit = 16 vec4, too small for an orbit array), Burning Ship / Sinusoidal perturbation.

## 4. Error budget (v1, N=2000, parabolic worst case)

| Source | Rel. to δ | Pixels at any v1 zoom |
|---|---|---|
| DS op residual per step | 2⁻⁴⁸ | ~4e-15 · N ≈ 1e-11 |
| DS orbit error 2εw·δ_n/step, εw≈7e-12 | ~1.4e-11/step | ≈ 3e-8 |
| **Total** | | **≪ 1e-8 pixel** |

## 5. Test plan

1. **Node:** `perturb.test.js` — switch thresholds, hysteresis, type gating (2,4 never perturb).
2. **Browser matrix (after 3.2 baseline is recorded):**
   - 1e-11: quad vs perturb → visually identical (crossover sanity)
   - 1e-12…1e-13: quad breaking, perturb clean (the money shot)
   - 1e-14: perturb clean
   - 1e-15: limit — rendering exact, aiming quantized (documented)
   - FPS at 1e-13, N=2000 (expect ~1.5–2× quad cost; overlay shows mode)
   - Fractal types 2/4 unaffected; debug mode works in perturb path
3. **Regression:** zoom 150 (3.4) unchanged — it runs on quad (zoom ≫ 1e-10).

## 6. Out of scope (now)

UI coordinate entry widget, bignum orbit textures, rebase/series, BS/sinusoidal perturbation, WebGL2 migration.
