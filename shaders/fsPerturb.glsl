precision highp float;

// =============================================================================
// Phase 4 v2 — perturbation renderer (Mandelbrot, Julia, Tricorn)
//
// z = w + delta. w = CPU float64 reference orbit, uploaded as RGBA32F
// 2001x1 (texel n = w_n as f32 hi/lo pairs: R=wr_hi G=wr_lo B=wi_hi A=wi_lo).
// delta iterated on GPU in double-single:
//
//   Mandelbrot: delta_{n+1} = 2 w_n d_n + d_n^2 + delta_c
//   Tricorn:    dR_next = baseR + dcR ; dI_next = dcI - baseI  (conj base)
//   Julia:      delta_{n+1} = 2 P d_n + d_n^2   (w_n = P = fixed point of
//                                                       z^2 + c_j; c_j cancels)
//
//   delta_c = c - c_ref (per-pixel offset from the reference center),
//   added every step for MB/T; delta_0 = 0 for MB/T, delta_0 = c - P for
//   Julia. c_ref is passed via uRefCx/uRefCy (NOT assumed to be the view
//   center): reference.js picks an INTERIOR (bounded) c_ref — the view
//   center when its orbit is bounded (full 2000-iter check), else a nearby
//   bounded point from a CPU ring search. A bounded reference is REQUIRED:
//   with an escaping reference the whole view collapses onto the reference's
//   escape envelope (flat band) plus sentinel-fallback patchwork (blocky).
//
// CPU reference MUST be float64: a DS reference accumulates 2^-48/step,
// chaotically amplified in the ~10^3-iter transient, ejecting the orbit off
// its attractor. Float64 stays on orbit. See reference.js.
//
// Escape convention identical to fsQuad: z_0 never tested; loop index i
// tests z_{i+1}; escape -> iter = i; non-escape -> iter = maxIter (black).
//
// Glitch safety: NaN-safe check !(m2 < 256.0); on NaN/Inf the pixel falls
// back to the full double-single fsQuad loop.
//
// Sentinel (last-resort safety net only): selectRefCenter finds an interior
// c_ref for essentially every view, so the sentinel tail (1e15, filled by
// reference.js when the orbit escapes) is reached only if no nearby interior
// point exists. Pixels that reach a sentinel texel fall back to the full
// double-single orbit (identical result to fsQuad for that pixel).
// =============================================================================

uniform highp vec2 uResolution;
uniform highp vec2 uOffsetHi;
uniform highp vec2 uOffsetLo;
uniform highp float uZoomHi;
uniform highp float uZoomLo;
uniform highp float uIterations;
uniform highp float uColorShift;
uniform int uFractalType;
uniform int uDebugMode;
uniform int uSuperSample;
uniform sampler2D uRefOrbit;
uniform vec2 uRefCx; // c_ref (f32 hi/lo pair, Re) — interior reference center
uniform vec2 uRefCy; // c_ref (f32 hi/lo pair, Im)

vec4 refPoint(float i) {
    return texture2D(uRefOrbit, vec2((i + 0.5) / 2001.0, 0.5));
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    float aspect = uResolution.x / uResolution.y;

    float fx = (uv.x - 0.5) * aspect;
    float fy = (0.5 - uv.y);

    vec2 juliaCReal = vec2(-0.7269, 0.0);
    vec2 juliaCImag = vec2(-0.1889, 0.0);

    vec2 c_x = dsAdd(vec2(uOffsetHi.x, uOffsetLo.x),
                     dsMulScalar(fx, vec2(uZoomHi, uZoomLo)));
    vec2 c_y = dsAdd(vec2(uOffsetHi.y, uOffsetLo.y),
                     dsMulScalar(fy, vec2(uZoomHi, uZoomLo)));

    int maxIter = int(uIterations);

    // --- Perturbation solve ---
    vec4 wCur = refPoint(0.0);
    vec2 dR, dI, dcR, dcI;
    if (uFractalType == 1) {
        dR = dsSub(c_x, wCur.xy); // delta_0 = c - P
        dI = dsSub(c_y, wCur.zw);
        dcR = vec2(0.0, 0.0);
        dcI = vec2(0.0, 0.0);
    } else {
        dR = vec2(0.0, 0.0);
        dI = vec2(0.0, 0.0);
        // delta_c = c - c_ref (c_ref = interior reference center, NOT
        // necessarily the view center — see uRefCx/uRefCy header note).
        dcR = dsSub(c_x, uRefCx);
        dcI = dsSub(c_y, uRefCy);
    }

    int iter = 0;
    float mag2 = 0.0;
    bool escaped = false;
    bool glitch = false;

    for (int i = 0; i < 2000; i++) {
        if (i >= maxIter) break;
        vec4 wNext = refPoint(float(i) + 1.0);

        // Sentinel: reference already escaped (reference.js tail = 1e15).
        // Fall back to the full double-single orbit for this pixel.
        if (wNext.x > 1e4 || wNext.z > 1e4) { glitch = true; break; }

        // base = delta^2 + 2 w delta  (the linear term must be doubled:
        //   Re(2 w delta) = 2 (wR dR - wI dI)
        //   Im(2 w delta) = 2 (wR dI + wI dR))
        vec2 cross = dsMul(dR, dI);
        vec2 linR = dsSub(dsMul(wCur.xy, dR), dsMul(wCur.zw, dI));
        vec2 linI = dsAdd(dsMul(wCur.xy, dI), dsMul(wCur.zw, dR));
        vec2 baseR = dsAdd(dsSub(dsSqr(dR), dsSqr(dI)), dsAdd(linR, linR));
        vec2 baseI = dsAdd(dsAdd(cross, cross), dsAdd(linI, linI));

        if (uFractalType == 3) {
            dR = dsAdd(baseR, dcR);
            dI = dsSub(dcI, baseI);
        } else if (uFractalType == 0) {
            dR = dsAdd(baseR, dcR);
            dI = dsAdd(baseI, dcI);
        } else {
            dR = baseR;
            dI = baseI;
        }

        float zrx = wNext.x + wNext.y + dR.x + dR.y;
        float zix = wNext.z + wNext.w + dI.x + dI.y;
        float m2 = zrx * zrx + zix * zix;

        if (!(m2 < 256.0)) { // NaN-safe
            if (m2 > 256.0) { escaped = true; mag2 = m2; iter = i; }
            else { glitch = true; }
            break;
        }
        iter++;
        wCur = wNext;
    }

    // --- Glitch fallback: full DS orbit (fsQuad logic) ---
    if (glitch) {
        vec2 zx, zy;
        if (uFractalType == 1) { zx = c_x; zy = c_y; }
        else { zx = vec2(0.0, 0.0); zy = vec2(0.0, 0.0); }
        iter = 0;
        mag2 = 0.0;
        for (int i = 0; i < 2000; i++) {
            if (i >= maxIter) break;
            vec2 realPart = dsSub(dsSqr(zx), dsSqr(zy));
            vec2 zProd = dsMul(zx, zy);
            vec2 imagPart = dsAdd(zProd, zProd);
            vec2 nx, ny;
            if (uFractalType == 0 || uFractalType == 1) {
                nx = dsAdd(realPart, (uFractalType == 0) ? c_x : juliaCReal);
                ny = dsAdd(imagPart, (uFractalType == 0) ? c_y : juliaCImag);
            } else {
                nx = dsAdd(realPart, c_x);
                ny = dsAdd(dsSub(vec2(0.0, 0.0), imagPart), c_y);
            }
            zx = nx;
            zy = ny;
            float mm = (zx.x + zx.y) * (zx.x + zx.y) + (zy.x + zy.y) * (zy.x + zy.y);
            if (mm > 256.0) { mag2 = mm; escaped = true; iter = i; break; }
            iter++;
        }
    }

    // --- Debug mode (self-test patch same as fsQuad) ---
    if (uDebugMode == 1) {
        vec2 centerDist = abs(uv - 0.5);
        bool isCenter = (centerDist.x < 0.02) && (centerDist.y < 0.02);
        bool isSelfTest = (uv.x > 0.42 && uv.x < 0.48) && (centerDist.y < 0.02);
        if (isSelfTest) {
            bool okAdd = (1.0 + 1.0 / 1048576.0) > 1.0;
            vec2 sp = split(uOffsetHi.x);
            bool okSplit = (sp.x + sp.y) == uOffsetHi.x;
            gl_FragColor = (okAdd && okSplit) ? vec4(0.0, 1.0, 0.0, 1.0)
                          : okAdd             ? vec4(1.0, 1.0, 0.0, 1.0)
                          : okSplit           ? vec4(0.0, 1.0, 1.0, 1.0)
                          :                    vec4(1.0, 0.0, 0.0, 1.0);
        } else if (isCenter) {
            // R = iter/maxIter, G = log2|delta_final| in [-40,40], B = log2|w_last|
            float dMag = (dR.x + dR.y) * (dR.x + dR.y) + (dI.x + dI.y) * (dI.x + dI.y);
            vec4 wLast = refPoint(float(maxIter > 0 ? maxIter - 1 : 0));
            float wMag = (wLast.x + wLast.y) * (wLast.x + wLast.y)
                       + (wLast.z + wLast.w) * (wLast.z + wLast.w);
            float rC = (maxIter > 0) ? float(iter) / float(maxIter) : 0.0;
            gl_FragColor = vec4(rC,
                (log2(max(dMag, 1e-30)) + 40.0) / 80.0,
                (log2(max(wMag, 1e-30)) + 40.0) / 80.0, 1.0);
        } else {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
        return;
    }

    // --- Coloring (identical to fsQuad) ---
    if (iter == maxIter) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        float smoothVal = float(iter) + 1.0 - log2(max(mag2, 1e-20));
        float color = smoothVal / uIterations;
        vec3 col = 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 0.6, 0.4) * color + uColorShift));
        gl_FragColor = vec4(col, 1.0);
    }
}
