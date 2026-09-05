// =============================================================================
// Phase 4 v2 — perturbation mode selection (CPU side)
// See plans/phase4_perturbation_spec.md
//
// The perturb shader (shaders/fsPerturb.glsl) is used for the quad-formula
// families (Mandelbrot=0, Julia=1, Tricorn=3). Burning Ship and Sinusoidal
// stay on their own DS shaders.
//
// No zoom threshold / hysteresis: when the CPU reference orbit escapes
// (|w|^2 > 256), reference.js marks the tail texels with a 1e15 sentinel and
// the shader falls back to the full double-single orbit for affected pixels
// — so perturb is correct (never worse than quad) at any zoom, and strictly
// better deep inside the set where plain DS loses precision.
// =============================================================================

export const PERTURB_TYPES = new Set([0, 1, 3]);
// Legacy zoom thresholds — kept for API compatibility, no longer consulted.
export const PERTURB_ON_ZOOM = 1e-10;
export const PERTURB_OFF_ZOOM = 3e-10;

export function baseFamily(type) {
    if (type === 2) return 'bs';
    if (type === 4) return 'sin';
    return 'quad';
}

/**
 * Pick the shader family for this frame.
 * @param {number} type      fractal type (0..4)
 * @param {number} [zoom]    current zoom (unused; kept for API compat)
 * @param {string} mode      S.perturbMode: 'auto' | 'off' | 'force'
 * @param {string} [prevFamily] family used last frame (unused; no hysteresis)
 * @param {boolean} [supported=true] float-texture support (RGBA32F)
 * @returns {'quad'|'bs'|'sin'|'perturb'}
 */
export function selectFamily(type, zoom, mode, prevFamily, supported = true) {
    const base = baseFamily(type);
    if (!supported || !PERTURB_TYPES.has(type)) return base;
    if (mode === 'off') return base;
    // 'auto' and 'force' both use perturb: the shader's sentinel fallback
    // (full DS orbit when the reference has escaped) makes it exact at any
    // zoom, so there is no zoom regime where quad is preferable.
    return 'perturb';
}
