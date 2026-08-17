// dsMath.test.js — emulates shaders/dsMath.glsl's DS pipeline in Node with
// Math.fround (bit-exact for IEEE single). Finds where the low channel dies.
// Run: node dsMath.test.js
const f = Math.fround;

function twoSum(a, b) {
    const s = f(a + b), bp = f(s - a), ap = f(s - bp);
    return [s, f(f(a - ap) + f(b - bp))];
}
function split(a) {
    const s = f(8193.0 * a);
    const hi = f(s - f(s - a)); // Veltkamp: inner subtraction first
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
    return [p[0], f(p[1] + f(f(2.0 * z[0]) * z[1]))]; // GLSL: 2.0*z.x*z.y left-assoc
}
function dsMulScalar(s, d) {
    const p = twoProd(s, d[0]);
    return [p[0], f(p[1] + f(s * d[1]))];
}

let fails = 0;
function check(name, ok, detail = '') {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
    if (!ok) fails++;
}

// T1: twoSum exact for |a| >= |b|
{
    let bad = 0;
    for (let i = 0; i < 200000; i++) {
        const a = f((Math.random() * 2 - 1) * Math.pow(2, Math.floor(Math.random() * 21) - 10));
        const b = f((Math.random() * 2 - 1) * Math.abs(a) * Math.random());
        const [s, e] = twoSum(a, b);
        if ((a + b) - (s + e) !== 0) bad++;
    }
    check('twoSum exact for |a|>=|b|', bad === 0, `bad=${bad}`);
}

// T2: twoProd exact
{
    let bad = 0, worst = 0;
    for (let i = 0; i < 200000; i++) {
        const a = f((Math.random() * 2 - 1) * Math.pow(2, Math.floor(Math.random() * 13) - 6));
        const b = f((Math.random() * 2 - 1) * Math.pow(2, Math.floor(Math.random() * 13) - 6));
        const [p, e] = twoProd(a, b);
        const err = (a * b) - (p + e);
        if (err !== 0) bad++;
        worst = Math.max(worst, Math.abs(err));
    }
    check('twoProd exact', bad === 0, `bad=${bad}, worst=${worst.toExponential(2)}`);
}

// T3: twoSum when |a| < |b| — how broken is it?
{
    let bad = 0, worst = 0;
    for (let i = 0; i < 200000; i++) {
        const b = f((Math.random() * 2 - 1) * Math.pow(2, Math.floor(Math.random() * 21) - 10));
        const a = f((Math.random() * 2 - 1) * Math.abs(b) * Math.random());
        const [s, e] = twoSum(a, b);
        const err = (a + b) - (s + e);
        if (err !== 0) bad++;
        worst = Math.max(worst, Math.abs(err));
    }
    check('twoSum |a|<|b| (expected sometimes non-exact)', true,
        `non-exact ${bad}/200000, worst abs err=${worst.toExponential(3)}`);
}

// T4: user's exact scene — c construction across the 4% center patch.
// Preset Deep Seahorse, zoom ~1.113e-5 as reported in the perf overlay.
{
    const offX = -0.7436438870371587, offY = 0.131825904205312, zoom = 1.113e-5;
    const oHi = [f(offX), f(offY)], oLo = [offX - oHi[0], offY - oHi[1]];
    const zHi = f(zoom), zLo = zoom - zHi;
    console.log(`INFO  oLo=(${oLo[0].toExponential(3)}, ${oLo[1].toExponential(3)}), zLo=${zLo.toExponential(3)}`);
    const aspect = 1.7; // ~typical canvas aspect
    let worst = 0, blocks = 0;
    let prevC = null;
    const fx0 = -0.02 * aspect, fx1 = 0.02 * aspect, N = 2000;
    for (let i = 0; i <= N; i++) {
        const fx = fx0 + (fx1 - fx0) * i / N;
        const c = dsAdd([oHi[0], oLo[0]], dsMulScalar(fx, [zHi, zLo]));
        const exact = offX + fx * zoom; // float64 truth
        worst = Math.max(worst, Math.abs((c[0] + c[1]) - exact));
        if (prevC !== null && c[0] === prevC[0] && c[1] === prevC[1]) blocks++;
        prevC = c;
    }
    // block size in pixels: 'blocks' repeats out of N steps over the patch
    const patchPx = N; // patch spans 0.04*aspect uv = 4% of width = N px if N=width*0.04*aspect... approximate
    check('c construction per-pixel precise (worst < 1e-12)', worst < 1e-12,
        `worst abs err=${worst.toExponential(3)}`);
    console.log(`INFO  duplicate c values across ${N+1} patch samples: ${blocks} (consecutive dupes -> blocky size ~ ${(blocks / (N / 80)).toFixed(1)} px per 80px patch)`);
}

// T5: full loop — 60 iters at the patch center vs float64-exact orbit.
{
    const offX = -0.7436438870371587, offY = 0.131825904205312, zoom = 1.113e-5;
    const oHi = [f(offX), f(offY)], oLo = [offX - oHi[0], offY - oHi[1]];
    const zHi = f(zoom);
    const cX = dsAdd([oHi[0], oLo[0]], dsMulScalar(0.0, [zHi, zoom - zHi]));
    const cY = dsAdd([oHi[1], oLo[1]], dsMulScalar(0.0, [zHi, zoom - zHi]));
    let zx = [0, 0], zy = [0, 0];
    let ex = 0, ey = 0; // float64 exact
    let worst = 0;
    for (let i = 0; i < 60; i++) {
        const zxS = dsSqr(zx), zyS = dsSqr(zy);
        const rp = dsSub(zxS, zyS);
        const zp = dsMul(zx, zy);
        const ip = dsAdd(zp, zp);
        zx = dsAdd(rp, cX);
        zy = dsAdd(ip, cY);
        const cx = cX[0] + cX[1], cy = cY[0] + cY[1];
        const nex = ex * ex - ey * ey + cx;
        const ney = 2 * ex * ey + cy;
        ex = nex; ey = ney;
        worst = Math.max(worst, Math.abs((zx[0] + zx[1]) - ex), Math.abs((zy[0] + zy[1]) - ey));
    }
    check('DS orbit tracks exact float64 (60 iters)', worst < 1e-8,
        `worst abs divergence=${worst.toExponential(3)} (pixel=${(worst / zoom).toExponential(2)} px)`);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
