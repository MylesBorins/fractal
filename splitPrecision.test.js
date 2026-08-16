// =============================================================================
// Phase 1 — CPU-side split correctness (zoom_precision_spec.md 1.1 / 1.2)
//
// Verifies the hi/lo split used by render.js drawScene():
//     hi = Math.fround(x);  lo = x - hi
//
// Two claims under test:
//   A. CPU exactness:      hi + lo === x            (exact in float64)
//      Why it should hold: hi = fround(x) => hi/2 <= x <= 2hi => x - hi is
//      exact (Sterbenz), and hi + lo = x is representable, so the sum is exact.
//   B. GPU uniform round-trip: lo is shipped in a float32 uniform, so the GPU
//      reconstructs hi + fround(lo), not hi + lo. Bound the loss:
//      |fround(lo) - lo| <= 2^-24 |lo| <= 2^-25 ulp32(x) <= 2^-48 |x| (rel).
//
// Run: node splitPrecision.test.js   (exit 0 = pass)
// =============================================================================
import assert from 'node:assert';

const f32 = (x) => Math.fround(x);

// Same split as render.js lines 18-23
function split(x) {
    const hi = f32(x);
    return { hi, lo: x - hi };
}

function relErr(actual, expected) {
    if (expected === 0) return Math.abs(actual);
    return Math.abs(actual - expected) / Math.abs(expected);
}

let failures = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`  ok  ${name}`);
    } catch (e) {
        failures++;
        console.error(`FAIL  ${name}\n      ${e.message}`);
    }
}

// --- Value sets (spec 1.2) ---------------------------------------------------
const offsets = [
    0.0, 1e-15, -1e-15, 1e-10, -1e-10, 1e-30, -1e-30,   // near 0 / deep
    1e10, -1e10,                                          // large
    -0.743643887037158, 0.131825904205311,               // real defaults
    12345.6789012345, -9.87654321e-7,
];
const zooms = [];
for (let e = 0; e <= 15; e++) zooms.push(10 ** e);       // 1 .. 1e15
zooms.push(2.5, 3.0, 0.001, 1.23456789e7, 9.999999e13);

// --- Tests --------------------------------------------------------------------
console.log('A. CPU exact round-trip (hi + lo === x)');
for (const x of [...offsets, ...zooms]) {
    check(`offset/zoom x=${x.toExponential(6)}`, () => {
        const { hi, lo } = split(x);
        assert.strictEqual(hi, f32(hi), 'hi must be float32-exact');
        assert.strictEqual(hi + lo, x, 'hi + lo must round-trip exactly');
        // lo must carry only the rounding residual: <= half an ulp of x
        const ulp = (x === 0) ? 0 : Math.abs(x) * 2 ** -23;
        assert.ok(Math.abs(lo) <= ulp * 0.5 + Number.EPSILON * Math.abs(x) * 8,
            `|lo|=${Math.abs(lo).toExponential(3)} exceeds 0.5 ulp of x`);
    });
}

console.log('B. GPU uniform round-trip (hi + fround(lo) ~= x)');
let worstRel = 0, worstX = 0;
for (const x of [...offsets, ...zooms]) {
    check(`gpu-recon x=${x.toExponential(6)}`, () => {
        const { hi, lo } = split(x);
        const recon = hi + f32(lo);
        const r = relErr(recon, x);
        if (r > worstRel) { worstRel = r; worstX = x; }
        // Spec-justified bound is 2^-48 ~= 3.55e-15 rel; allow 1e-14 headroom
        assert.ok(r < 1e-14, `gpu recon rel err ${r.toExponential(3)}`);
    });
}

console.log('C. Empirical worst-case sweep (log-uniform 1e-12..1e15)');
check('sweep 200k samples', () => {
    let w = 0;
    for (let i = 0; i < 200_000; i++) {
        const x = Math.sign(Math.random() < 0.5 ? -1 : 1) * 10 ** (Math.random() * 27 - 12);
        const { hi, lo } = split(x);
        assert.strictEqual(hi + lo, x, `cpu round-trip failed at ${x}`);
        w = Math.max(w, relErr(hi + f32(lo), x));
    }
    console.log(`      worst rel err (gpu recon) = ${w.toExponential(3)}`);
    assert.ok(w < 1e-14, `sweep worst rel err ${w.toExponential(3)}`);
});

console.log('D. Zoom-decade stress: split at 1e-30 scale (minZoom territory)');
check('x = 1e-30 .. 1e-25', () => {
    for (let e = 25; e <= 30; e++) {
        const x = 10 ** -e;
        const { hi, lo } = split(x);
        assert.strictEqual(hi + lo, x, `cpu round-trip at 1e-${e}`);
        // fround(1e-25) is a normal float32 (min normal 1.18e-38) — no underflow
        assert.ok(!Number.isNaN(hi) && hi !== 0 || x === 0, `hi underflowed at 1e-${e}`);
    }
});

console.log(failures === 0
    ? `\nPASS — all split checks ok (worst gpu-recon rel err: ${worstRel.toExponential(3)} at x=${worstX.toExponential(4)})`
    : `\nFAIL — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
