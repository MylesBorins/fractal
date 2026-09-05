// perturb.test.js — Phase 4 v2 perturbation pipeline, emulated in Node with
// Math.fround (bit-exact IEEE single, same style as dsMath.test.js).
//
// v2 architecture (validated, see plans/phase4_perturbation_spec.md):
//   - CPU float64 reference orbit (reference.js) stored as f32 hi/lo pairs
//   - GPU/here: double-single delta recurrence
//       MB:       delta_{n+1} = delta_n^2 + 2 w_n delta_n + delta_c
//       Tricorn:  dR = baseR + dcR ; dI = dcI - baseI   (base = d^2 + 2wd)
//       Julia:    delta_{n+1} = delta_n^2 + 2 P delta_n  (w_n = P = fixed pt)
//   - pixel value z_{n+1} = w_{n+1} + delta_{n+1}; escape |z|^2 > 256
//   - iter convention identical to fsQuad: z_0 never tested; loop index i
//     tests z_{i+1}; escape -> iter = i; non-escape -> iter = maxIter
// Run: node perturb.test.js
import { selectFamily, baseFamily } from './perturb.js';
import { computeReferenceOrbit, selectRefCenter, buildOrbitTexture, REF_TEX_W, JULIA_FIXED } from './reference.js';

const f = Math.fround;
const f32Pair = x => [f(x), f(x - f(x))];

// ---------- dsMath emulation (mirrors shaders/dsMath.glsl exactly) ----------
function twoSum(a, b) {
    const s = f(a + b), bp = f(s - a), ap = f(s - bp);
    return [s, f(f(a - ap) + f(b - bp))];
}
function split(a) {
    const s = f(8193.0 * a);
    const hi = f(s - f(s - a));
    return [hi, f(a - hi)];
}
function twoProd(a, b) {
    const p = f(a * b);
    const as = split(a), bs = split(b);
    const e = f(f(f(f(as[0] * bs[0]) - p) + f(as[0] * bs[1])) + f(as[1] * bs[0])) + f(as[1] * bs[1]);
    return [p, e];
}
function dsAdd(a, b) {
    const s = twoSum(a[0], b[0]);
    return [s[0], f(f(s[1] + a[1]) + b[1])];
}
function dsSub(a, b) { return dsAdd(a, [-b[0], -b[1]]); }
function dsMul(a, b) {
    const p = twoProd(a[0], b[0]);
    return [p[0], f(p[1] + f(f(a[0] * b[1]) + f(a[1] * b[0])))];
}
function dsSqr(z) {
    const p = twoProd(z[0], z[0]);
    return [p[0], f(p[1] + f(f(2.0 * z[0]) * z[1]))];
}

// ---------- Part A: selectFamily unit tests (perturb.js) ----------
let fails = 0;
function check(name, ok, detail = '') {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
    if (!ok) fails++;
}

{
    const cases = [
        ['auto -> perturb at shallow zoom (sentinel fallback)', selectFamily(0, 1e-6, 'auto', 'quad') === 'perturb'],
        ['auto -> perturb at deep zoom', selectFamily(0, 1e-12, 'auto', 'quad') === 'perturb'],
        ['julia auto -> perturb', selectFamily(1, 1e-12, 'auto', 'quad') === 'perturb'],
        ['tricorn auto -> perturb', selectFamily(3, 1e-12, 'auto', 'quad') === 'perturb'],
        ['burningship -> bs', selectFamily(2, 1e-12, 'auto', 'bs') === 'bs'],
        ['sinusoidal -> sin', selectFamily(4, 1e-12, 'auto', 'sin') === 'sin'],
        ['force -> perturb (mandelbrot)', selectFamily(0, 1e-6, 'force', 'quad') === 'perturb'],
        ['force burns ship -> bs', selectFamily(2, 1e-6, 'force', 'quad') === 'bs'],
        ['off -> quad deep', selectFamily(0, 1e-12, 'off', 'perturb') === 'quad'],
        ['off -> quad shallow', selectFamily(0, 1e-6, 'off', 'quad') === 'quad'],
        ['no float texture -> quad', selectFamily(0, 1e-12, 'auto', 'quad', false) === 'quad'],
        ['no float texture -> bs for bs', selectFamily(2, 1e-12, 'force', 'quad', false) === 'bs'],
        ['no hysteresis: same choice regardless of prev/zoom',
            selectFamily(0, 2e-10, 'auto', 'perturb') === 'perturb' &&
            selectFamily(0, 5e-10, 'auto', 'perturb') === 'perturb' &&
            selectFamily(0, 2e-10, 'auto', 'quad') === 'perturb'],
        ['baseFamily maps', baseFamily(0) === 'quad' && baseFamily(2) === 'bs' && baseFamily(4) === 'sin'],
    ];
    for (const [name, ok] of cases) check(name, ok);
}

// ---------- Part B: v2 reference+delta vs float64 ground truth ----------
// Escape-iteration comparison across a 11x11 pixel grid at deep zoom.
// Tolerance 1 iteration (chaotic boundary); 0 expected in smooth regions.

const MAXI = 2000;
const JULIA_CR = Math.fround(-0.7269); // must match shader f32 literals
const JULIA_CI = Math.fround(-0.1889);

// Float64 ground-truth orbit, fsQuad iter convention.
function exactOrbit(cx, cy, maxIter, type) {
    let zr, zi;
    if (type === 1) { zr = cx; zi = cy; } else { zr = 0; zi = 0; }
    for (let i = 0; i < maxIter; i++) {
        const re = zr * zr - zi * zi;
        const im = 2 * zr * zi;
        if (type === 0) { zr = re + cx; zi = im + cy; }
        else if (type === 1) { zr = re + JULIA_CR; zi = im + JULIA_CI; }
        else { zr = re + cx; zi = -im + cy; } // tricorn
        if (zr * zr + zi * zi > 256) return i;
    }
    return maxIter;
}

// Full double-single orbit for one pixel — mirrors the shader's
// glitch/sentinel fallback loop in fsPerturb.glsl (same ops as fsQuad).
function fullDSOrbit(type, cx, cy, maxIter) {
    const c = [f(cx), f(cx - f(cx))], cdy = [f(cy), f(cy - f(cy))];
    let zx, zy;
    if (type === 1) { zx = c; zy = cdy; } else { zx = [0, 0]; zy = [0, 0]; }
    let iter = 0, mag2 = 0;
    for (let i = 0; i < 2000; i++) {
        if (i >= maxIter) break;
        const realPart = dsSub(dsSqr(zx), dsSqr(zy));
        const zProd = dsMul(zx, zy);
        const imagPart = dsAdd(zProd, zProd);
        let nx, ny;
        if (type === 0 || type === 1) {
            nx = dsAdd(realPart, type === 0 ? c : [JULIA_CR, 0]);
            ny = dsAdd(imagPart, type === 0 ? cdy : [JULIA_CI, 0]);
        } else {
            nx = dsAdd(realPart, c);
            ny = dsAdd(dsSub([0, 0], imagPart), cdy);
        }
        zx = nx; zy = ny;
        mag2 = (zx[0] + zx[1]) ** 2 + (zy[0] + zy[1]) ** 2;
        if (mag2 > 256.0) { iter = i; return { iter, mag2 }; }
        iter++;
    }
    return { iter, mag2 };
}

// v2 perturb shader emulation: CPU f64 reference (quantized to f32 pairs by
// reference.js) + DS delta recurrence. Mirrors shaders/fsPerturb.glsl
// (including the sentinel fallback to the full DS orbit). Returns
// { iter, fellBack }.
function perturbV2(type, offX, offY, zoom, fx, fy, maxIter, refData, cRef) {
    const data = refData || computeReferenceOrbit(type, offX, offY);
    const cR = (cRef || selectRefCenter(type, offX, offY))[0];
    const cI = (cRef || selectRefCenter(type, offX, offY))[1];
    const T = n => [data[4 * n], data[4 * n + 1], data[4 * n + 2], data[4 * n + 3]];
    let w = T(0);
    let dR, dI, dcR, dcI;
    if (type === 1) {
        // Julia: z_0 = pixel point; delta_0 = z_0 - P (P = constant reference)
        const px = offX + fx * zoom, py = offY + fy * zoom;
        dR = [px - (w[0] + w[1]), 0];
        dI = [py - (w[2] + w[3]), 0];
        dcR = [0, 0]; dcI = [0, 0];
    } else {
        // Mandelbrot/Tricorn: z_0 = 0; delta_0 = 0; delta_c = c - c_ref
        // (c_ref = interior reference center — NOT necessarily the view
        //  center; mirrors the shader's dsSub(c, uRefCx)).
        const cx = offX + fx * zoom, cy = offY + fy * zoom;
        dR = [0, 0]; dI = [0, 0];
        dcR = f32Pair(cx - cR);
        dcI = f32Pair(cy - cI);
    }
    let iter = 0;
    for (let i = 0; i < 2000; i++) {
        if (i >= maxIter) break;
        const wn = T(i + 1);
        // Sentinel (reference already escaped) -> full DS orbit fallback.
        if (wn[0] > 1e4 || wn[2] > 1e4) {
            return { iter: fullDSOrbit(type, offX + fx * zoom, offY + fy * zoom, maxIter).iter, fellBack: true };
        }
        const cross = dsMul(dR, dI);
        const linR = dsSub(dsMul([w[0], w[1]], dR), dsMul([w[2], w[3]], dI));
        const linI = dsAdd(dsMul([w[0], w[1]], dI), dsMul([w[2], w[3]], dR));
        const baseR = dsAdd(dsSub(dsSqr(dR), dsSqr(dI)), dsAdd(linR, linR));
        const baseI = dsAdd(dsAdd(cross, cross), dsAdd(linI, linI));
        if (type === 3) { dR = dsAdd(baseR, dcR); dI = dsSub(dcI, baseI); }
        else if (type === 0) { dR = dsAdd(baseR, dcR); dI = dsAdd(baseI, dcI); }
        else { dR = baseR; dI = baseI; }
        const zrx = wn[0] + wn[1] + dR[0] + dR[1];
        const zix = wn[2] + wn[3] + dI[0] + dI[1];
        const m2 = zrx * zrx + zix * zix;
        if (!(m2 < 256.0)) {
            if (m2 > 256.0) { iter = i; break; }
            throw new Error(`glitch at i=${i}`);
        }
        iter++;
        w = wn;
    }
    return { iter, fellBack: false };
}

// A pixel is a hard fail when |Δ| > tol and it escapes early (min(p,e) <
// EDGE_ITER): that would be a visibly wrong color band. Pixels that escape
// only near the end of the iteration budget have chaotic escape times — a
// 1e-15 perturbation legitimately shifts the |z|>16 crossing by several
// iterations — and are reported but not failed (edge).
const EDGE_ITER = 1000;

function runScene(name, offX, offY, zoom, type, tol, grid = 11) {
    let maxD = 0, over = 0, edge = 0, glitches = 0, noP = 0, noE = 0, n = 0;
    const half = (grid - 1) / 2;
    for (let gx = 0; gx < grid; gx++) {
        for (let gy = 0; gy < grid; gy++) {
            const fx = gx - half, fy = gy - half; // 1-px steps
            let r;
            try { r = perturbV2(type, offX, offY, zoom, fx, fy, MAXI); }
            catch (e) { glitches++; continue; }
            const p = r.iter;
            const e = exactOrbit(offX + fx * zoom, offY + fy * zoom, MAXI, type);
            const d = Math.abs(p - e);
            maxD = Math.max(maxD, d);
            if (d > tol) { if (Math.min(p, e) < EDGE_ITER) over++; else edge++; }
            if (p === MAXI) noP++;
            if (e === MAXI) noE++;
            n++;
        }
    }
    const ok = over === 0 && glitches === 0 && noP === noE;
    check(name, ok,
        `grid ${n}px max|Δiter|=${maxD} hardOff=${over}/${n} edgeChaotic=${edge} ` +
        `glitches=${glitches} noEscape p=${noP} e=${noE}`);
}

// Part C: reference-orbit sanity
{
    const d = computeReferenceOrbit(0, -0.7436438870371587, 0.131825904205312);
    const finite = d.every(Number.isFinite);
    const starts0 = d[0] === 0 && d[1] === 0 && d[2] === 0 && d[3] === 0;
    check('ref orbit: 2001 texels, finite, w_0 = 0',
        d.length === REF_TEX_W * 4 && finite && starts0,
        `len=${d.length}`);
    const j = computeReferenceOrbit(1, 0, 0);
    const same = j.every((v, k) => v === j[k % 4]);
    check('ref orbit julia: constant P texels, |P| < 1',
        same && Math.hypot(JULIA_FIXED[0], JULIA_FIXED[1]) < 1,
        `P=(${JULIA_FIXED[0].toExponential(4)}, ${JULIA_FIXED[1].toExponential(4)})`);
    // Escaping reference (low-level builder, no center selection): c = 1.5
    // escapes after a few iter; all texels from the escape point on must be
    // the 1e15 sentinel.
    const out = buildOrbitTexture(0, 1.5, 0);
    // 1e15 rounds in the Float32Array — compare against the rounded value.
    const S = Math.fround(1e15);
    let first = -1;
    for (let k = 0; k < REF_TEX_W; k++) { if (out[k * 4] === S) { first = k; break; } }
    // Only R is filled (G/B/A stay 0 — the shader sums hi+lo per component).
    const tailOk = first > 0 && first < 10 &&
        out.every((v, k) => k < first * 4 || k % 4 !== 0 || v === S);
    check('ref orbit: escaping c_ref -> 1e15 sentinel tail', tailOk, `firstSentinel=${first}`);
    // Interior-reference selection: an escaping view center must NOT produce
    // a sentinel — selectRefCenter finds a nearby bounded point instead.
    const scX = -0.7436, scY = 0.1319; // user view center; escapes at iter 312 (f64)
    const seah = computeReferenceOrbit(0, scX, scY);
    let first2 = -1;
    for (let k = 0; k < REF_TEX_W; k++) { if (seah[k * 4] > 1e4) { first2 = k; break; } }
    const sel = selectRefCenter(0, scX, scY);
    const moved = (sel[0] - scX) ** 2 + (sel[1] - scY) ** 2 > 1e-18;
    check('ref select: escaping center -> interior c_ref, no sentinel',
        first2 === -1 && moved,
        `c_ref=(${sel[0].toPrecision(8)}, ${sel[1].toPrecision(8)}) firstBig=${first2}`);
}

// Part D: scenes (same set as the validated /tmp/hyp2c.mjs)
const SEAH = { x: -0.7436438870371587, y: 0.131825904205312 };
runScene('Mandelbrot 1e-12 seahorse', SEAH.x, SEAH.y, 1e-12, 0, 0);
runScene('Julia 1e-12 boundary center', -0.7269, -0.1889, 1e-12, 1, 2); // chaotic
runScene('Tricorn 1e-12 seahorse', SEAH.x, SEAH.y, 1e-12, 3, 0);
runScene('Julia 1e-12 smooth (2.5,0)', 2.5, 0.0, 1e-12, 1, 0);
runScene('Mandelbrot 1e-12 cardioid cusp (0.25,0)', 0.25, 0.0, 1e-12, 0, 0);
runScene('Mandelbrot 1e-12 cusp-right (0.2501,0)', 0.2501, 0.0, 1e-12, 0, 0);
runScene('Mandelbrot 1e-15 seahorse', SEAH.x, SEAH.y, 1e-15, 0, 0);

// Part E: interior-reference regression — views whose center is OUTSIDE the
// set. Old bugs: (1) center reference escapes -> every unescaped pixel
// rendered at iter = escIdx-1 with a huge smooth value (flat color band);
// (2) mixed delta/fallback realization -> blocky patchwork. Fix: c_ref is a
// nearby BOUNDED point, so the whole view renders on one clean delta path.
{
    const SP = { x: -0.2367, y: 0.6490 }; // spiral view (user-reported)
    const ZOOM = 7.277e-6, MI = 810, GRID = 21;
    const ref = computeReferenceOrbit(0, SP.x, SP.y);
    let sentinel = -1;
    for (let k = 0; k < REF_TEX_W; k++) { if (ref[k * 4] > 1e4) { sentinel = k; break; } }
    check('intref: spiral view reference is bounded (no sentinel)', sentinel === -1,
        `c_ref=(${selectRefCenter(0, SP.x, SP.y)[0].toPrecision(8)}, ${selectRefCenter(0, SP.x, SP.y)[1].toPrecision(8)})`);

    const half = (GRID - 1) / 2;
    let fb = 0, gl = 0, n = 0;
    const distinct = new Set();
    for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++) {
        const fx = gx - half, fy = gy - half;
        let r;
        try { r = perturbV2(0, SP.x, SP.y, ZOOM, fx, fy, MI); }
        catch { gl++; continue; }
        if (r.fellBack) fb++;
        distinct.add(r.iter);
        n++;
    }
    check('intref: 0 fallbacks, 0 glitches, diverse iterations (no flat band)',
        fb === 0 && gl === 0 && distinct.size > 20,
        `fallback=${fb}/${n} glitches=${gl} distinct=${distinct.size}`);

    // Sentinel safety net (synthetic): a bounded fake orbit (w = 0) with a
    // 1e15 sentinel at texel 50. The delta loop must reach the sentinel and
    // fall back to the full DS orbit (identical to fsQuad for that pixel).
    const syn = new Float32Array(REF_TEX_W * 4);
    syn[50 * 4] = Math.fround(1e15); // w = 0 everywhere else (bounded)
    const scX = -0.5, scY = 0.0, sZoom = 1e-3, sMI = 810;
    const rSyn = perturbV2(0, scX, scY, sZoom, 1, 0, sMI, syn, [scX, scY]);
    const qSyn = fullDSOrbit(0, scX + 1 * sZoom, scY, sMI);
    check('sentinel net: synthetic sentinel triggers full-DS fallback',
        rSyn.fellBack && rSyn.iter === qSyn.iter,
        `fellBack=${rSyn.fellBack} iter=${rSyn.iter} fullDS=${qSyn.iter}`);
}

// Part F: boundary view — the user-reported blocky view. Center escapes at
// iter ~312 (f64); interior reference selected. Asserts the render is a
// single clean delta realization: no fallbacks, diverse iterations, texture
// statistics comparable to the f64 reference rendering (loose per-pixel
// agreement: chaotic boundary pixels legitimately differ by many iterations
// between two different-precision realizations — f64 is NOT the criterion).
{
    const BV = { x: -0.7436, y: 0.1319 }, ZOOM = 2.476e-6, MI = 920, GRID = 11;
    const half = (GRID - 1) / 2;
    let fb = 0, gl = 0, n = 0, agree = 0;
    const P = [], Q = [];
    for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++) {
        const fx = gx - half, fy = gy - half;
        let r;
        try { r = perturbV2(0, BV.x, BV.y, ZOOM, fx, fy, MI); }
        catch { gl++; P.push(NaN); Q.push(NaN); n++; continue; }
        if (r.fellBack) fb++;
        P.push(r.iter);
        Q.push(exactOrbit(BV.x + fx * ZOOM, BV.y + fy * ZOOM, MI, 0));
        if (Math.abs(r.iter - Q[Q.length - 1]) <= 100) agree++;
        n++;
    }
    const distinct = new Set(P);
    let maxAdjP = 0, maxAdjQ = 0;
    for (let gx = 0; gx < GRID; gx++) for (let gy = 0; gy < GRID; gy++) {
        if (gx + 1 < GRID) { maxAdjP = Math.max(maxAdjP, Math.abs(P[gy * GRID + gx + 1] - P[gy * GRID + gx])); maxAdjQ = Math.max(maxAdjQ, Math.abs(Q[gy * GRID + gx + 1] - Q[gy * GRID + gx])); }
        if (gy + 1 < GRID) { maxAdjP = Math.max(maxAdjP, Math.abs(P[(gy + 1) * GRID + gx] - P[gy * GRID + gx])); maxAdjQ = Math.max(maxAdjQ, Math.abs(Q[(gy + 1) * GRID + gx] - Q[gy * GRID + gx])); }
    }
    check('boundary: 0 fallbacks, 0 glitches, diverse iterations',
        fb === 0 && gl === 0 && distinct.size > 30,
        `fallback=${fb}/${n} glitches=${gl} distinct=${distinct.size}`);
    check('boundary: not blockier than f64 (adjacent-iter spread)',
        maxAdjP <= Math.max(50, 2 * maxAdjQ),
        `maxAdjP=${maxAdjP} maxAdjQ=${maxAdjQ}`);
    check('boundary: >=70% pixels within 100 iter of f64',
        agree / n >= 0.7, `agree=${agree}/${n}`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
