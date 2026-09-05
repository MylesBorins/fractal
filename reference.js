// =============================================================================
// Phase 4 v2 — CPU reference orbit for the perturb shader
// See plans/phase4_perturbation_spec.md
//
// Why the reference orbit is computed on the CPU in float64:
//   A double-single (float32 pair) reference orbit accumulates ~2^-48
//   absolute error per step. Near the Mandelbrot boundary an orbit stays
//   chaotic for ~10^3 iterations before landing on an attracting cycle;
//   during that transient the error is amplified chaotically (measured
//   ~2.7x/iter) and the DS reference is ejected off the attractor,
//   escaping where the true orbit never does (iter 1052 vs never). A
//   float64 reference (~2^-53/step) stays on the true orbit.
//   Validated (CPU emulation, /tmp/hyp2c.mjs): 0/121 mismatches on all
//   scenes at 1e-12 and 1e-15 — Mandelbrot seahorse, parabolic cusp,
//   Julia fjord, smooth Julia, Tricorn.
//
// Storage: RGBA32F 2001x1 texture, texel n = w_n as f32 (hi, lo) pairs:
//   R = wr_hi, G = wr_lo, B = wi_hi, A = wi_lo
// Width 2001 because the shader reads texel(i+1) at i = maxIter-1
// (maxIter <= 2000).
//
// Julia: the reference orbit is the CONSTANT fixed point P of z^2 + c_j
// (w_n = P for all n). Roots of z^2 - z + c = 0 are (1 +/- sqrt(1-4c))/2;
// we take the smaller root (|P| < 1 for our c_j). c_j itself is NOT in
// K(c_j) (its orbit escapes at iter ~6), so an orbit of c_j would be a
// bad reference. The fixed point keeps the reference bounded and makes
// the delta recurrence delta_{n+1} = 2P*delta_n + delta_n^2 (c_j cancels).
// =============================================================================

export const REF_TEX_W = 2001;
export const REF_TEX_H = 1;

// Julia constant as f32 — the shader uses f32 literals, the CPU must match
// exactly (a 4e-8 mismatch is 4e8 pixels at 1e-12 zoom).
const JULIA_CR = Math.fround(-0.7269);
const JULIA_CI = Math.fround(-0.1889);

// Principal complex square root (result re >= 0, sign of im preserved).
function cSqrt(re, im) {
    const r = Math.hypot(re, im);
    if (re === 0 && im === 0) return [0, 0];
    if (re >= 0) {
        const sr = Math.sqrt((r + re) / 2);
        return [sr, im / (2 * sr)];
    }
    const si = Math.sqrt((r - re) / 2);
    return [Math.abs(im) / (2 * si), Math.sign(im) * si];
}

// Smaller fixed point of z^2 + c_j = z, in float64.
const S14C = cSqrt(1 - 4 * JULIA_CR, -4 * JULIA_CI); // sqrt(1 - 4*c_j)
export const JULIA_FIXED = [(1 - S14C[0]) / 2, -S14C[1] / 2];

// f64 -> f32 (hi, lo) pair; the residual x - hi is exact in f64
// (Sterbenz: within a factor of 2) and representable to ~2^-48 relative.
function f32Pair(x) {
    const hi = Math.fround(x);
    return [hi, Math.fround(x - hi)];
}

// ---------------------------------------------------------------------------
// Reference-center selection (interior reference)
//
// Perturbation theory requires a BOUNDED reference orbit. If the view center
// escapes, the delta path degenerates: pixels near the reference share its
// escape envelope (a flat color band) and the rest hit the sentinel fallback
// (blocky patchwork). Fix: when the center is outside the set, ring-search
// nearby for a bounded point and use it as c_ref. The delta recurrence is
// exact for any |delta_c| = |c - c_ref|, so a nearby interior point works
// perfectly and the whole view renders on a single clean delta path.
//
// The boundedness check runs the FULL 2000-iteration budget: slow escapers
// (e.g. the center of the blocky user view escapes at iter 312) must NOT be
// treated as interior.
// ---------------------------------------------------------------------------

const REF_BUDGET = 2000; // shader maximum iteration budget

function orbitBounded(type, cr, ci) {
    let zr = 0, zi = 0;
    for (let i = 0; i < REF_BUDGET; i++) {
        const re = zr * zr - zi * zi;
        const im = 2 * zr * zi;
        zr = re + cr;
        zi = (type === 3 ? -im : im) + ci;
        if (zr * zr + zi * zi > 256) return false;
    }
    return true;
}

const refCenterCache = new Map(); // "type|qx|qy" -> [cR, cI]

/**
 * Choose c_ref for the reference orbit: the view center when its orbit is
 * bounded, else the first bounded point on expanding rings
 * (r = 1e-6 * 3^k, 96 angles, out to r < 8), else the center itself (the
 * shader's sentinel fallback remains the safety net).
 * Cached by offset quantized to 1e-5 so pan gestures reuse the last found
 * center (a slightly stale c_ref is safe: delta_c simply gets bigger).
 * @returns {number[]} [cR, cI] in float64
 */
export function selectRefCenter(type, offX, offY) {
    if (type === 1) return [JULIA_FIXED[0], JULIA_FIXED[1]];
    const key = type + '|' + Math.round(offX * 1e5) + '|' + Math.round(offY * 1e5);
    const hit = refCenterCache.get(key);
    if (hit && orbitBounded(type, hit[0], hit[1])) return hit;
    let cRef = null;
    if (orbitBounded(type, offX, offY)) {
        cRef = [offX, offY];
    } else {
        for (let k = 0; k < 14 && !cRef; k++) {
            const r = 1e-6 * Math.pow(3, k);
            if (r > 8) break;
            for (let a = 0; a < 96; a++) {
                const th = (a * Math.PI) / 48;
                const px = offX + r * Math.cos(th);
                const py = offY + r * Math.sin(th);
                if (orbitBounded(type, px, py)) { cRef = [px, py]; break; }
            }
        }
        if (!cRef) cRef = [offX, offY]; // last resort: sentinel path
    }
    if (refCenterCache.size > 512) refCenterCache.clear();
    refCenterCache.set(key, cRef);
    return cRef;
}

/**
 * Build the 2001x1 RGBA32F orbit texture for a specific c_ref (low-level;
 * computeReferenceOrbit adds center selection on top).
 */
export function buildOrbitTexture(type, cr, ci) {
    const data = new Float32Array(REF_TEX_W * 4);
    let wr = 0, wi = 0;
    for (let n = 0; n < REF_TEX_W; n++) {
        const [hr, hl] = f32Pair(wr);
        const [hi, li] = f32Pair(wi);
        const o = n * 4;
        data[o] = hr; data[o + 1] = hl;
        data[o + 2] = hi; data[o + 3] = li;

        const re = wr * wr - wi * wi;
        const im = 2 * wr * wi;
        wr = re + cr;
        wi = (type === 3 ? -im : im) + ci;

        if (wr * wr + wi * wi > 256) {
            // c_ref escaped (last-resort case). Sentinel: the shader detects
            // 1e15 and falls back to the full double-single orbit for that
            // pixel (identical result to fsQuad, no flat-band artifact).
            for (let m = n + 1; m < REF_TEX_W; m++) data[m * 4] = 1e15;
            break;
        }
    }
    return data;
}

const orbitCache = new Map(); // "type|cr|ci" -> Float32Array

/**
 * Compute the reference orbit w_0..w_2000 for the perturb shader.
 * c_ref is chosen by selectRefCenter (view center if bounded, else a nearby
 * bounded point found by ring search — the reference orbit must be bounded).
 * @param {number} type  fractal type: 0=Mandelbrot, 1=Julia, 3=Tricorn
 * @param {number} offX  view center x (f64 — same value as uOffsetHi+Lo)
 * @param {number} offY  view center y (f64)
 * @returns {Float32Array} 4 * REF_TEX_W floats, RGBA texels
 */
export function computeReferenceOrbit(type, offX, offY) {
    if (type === 1) {
        // Julia: constant orbit w_n = P.
        const data = new Float32Array(REF_TEX_W * 4);
        const [prH, prL] = f32Pair(JULIA_FIXED[0]);
        const [piH, piL] = f32Pair(JULIA_FIXED[1]);
        for (let n = 0; n < REF_TEX_W; n++) {
            const o = n * 4;
            data[o] = prH; data[o + 1] = prL;
            data[o + 2] = piH; data[o + 3] = piL;
        }
        return data;
    }

    // Mandelbrot / Tricorn: w_0 = 0, w_{n+1} = f(w_n) + c_ref, f = z^2 or
    // conj(z)^2. c_ref chosen so the reference orbit is bounded.
    const [cr, ci] = selectRefCenter(type, offX, offY);
    const key = type + '|' + cr + '|' + ci;
    let cached = orbitCache.get(key);
    if (!cached) {
        cached = buildOrbitTexture(type, cr, ci);
        if (orbitCache.size > 64) orbitCache.clear();
        orbitCache.set(key, cached);
    }
    return cached;
}

let refTex = null;
let refFmt = null;

/**
 * Create (once) the reference-orbit texture.
 * @returns {WebGLTexture|null} null if float textures are unsupported
 */
export function createRefTexture(gl, isWebGL2) {
    if (refTex) return refTex;
    let internalFormat;
    if (isWebGL2) {
        internalFormat = gl.RGBA32F; // core
    } else {
        if (!gl.getExtension('OES_texture_float')) return null;
        internalFormat = gl.RGBA;
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, REF_TEX_W, REF_TEX_H, 0,
        gl.RGBA, gl.FLOAT, null);
    refTex = tex;
    refFmt = internalFormat;
    return tex;
}

/**
 * Compute + upload the reference orbit for the current view.
 * Called once per frame while the perturb family is active.
 * @returns {number[]|null} [cR, cI] (the chosen c_ref, float64) on success,
 *   null if float textures are unsupported (caller should use quad family).
 *   The caller passes c_ref to the shader as uRefCx/uRefCy so it can compute
 *   delta_c = c - c_ref (c_ref is NOT necessarily the view center).
 */
export function uploadRefOrbit(gl, isWebGL2, type, offX, offY) {
    if (!refTex && !createRefTexture(gl, isWebGL2)) return null;
    if (!refTex) return null;
    const [cr, ci] = selectRefCenter(type, offX, offY);
    const data = buildOrbitTexture(type, cr, ci);
    gl.bindTexture(gl.TEXTURE_2D, refTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, REF_TEX_W, REF_TEX_H,
        gl.RGBA, gl.FLOAT, data);
    return [cr, ci];
}
