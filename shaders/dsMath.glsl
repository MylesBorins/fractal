// =============================================================================
// Double-Single (DS) Arithmetic — Error-Free Transforms
// z = (z.x + z.y), z.x = hi, z.y = lo
//
// Every + and * goes through twoSum / twoProd (Knuth / Veltkamp / Dekker) so
// the rounding error is captured in the lo channel instead of silently
// vanishing. This is what lifts the usable zoom ceiling from ~10^7 toward
// the DS limit (~10^12-10^13).
//
// Requires IEEE-754 single-precision semantics. GLSL ES 1.00 has no fma(),
// so the split-based twoProd below is the only option (spec 2.4 resolved).
// Dropped terms are bounded: lo*lo ~ 2^-50 relative — sub-float32-ULP.
// =============================================================================

// --- Error-free primitives ----------------------------------------------------

// TwoSum (Knuth fast two-sum): returns (sum, error) with (a+b) - sum exact.
vec2 twoSum(float a, float b) {
    float s = a + b;
    float bp = s - a;
    float ap = s - bp;
    float e = (a - ap) + (b - bp);
    return vec2(s, e);
}

// Split (Veltkamp): a = hi + lo exactly; hi carries the top ~13 mantissa bits,
// lo the bottom ~11. F = 2^13 + 1 is exact for 24-bit IEEE single.
// NOTE: hi = s - (s - a), NOT s - a — the inner subtraction must happen first;
// "s - a" alone yields ~8192*a (the wrong half) and destroys twoProd exactness.
vec2 split(float a) {
    const float F = 8193.0;
    float s = F * a;
    float hi = s - (s - a);
    float lo = a - hi;
    return vec2(hi, lo);
}

// TwoProd (Dekker): returns (product, error) with a*b - product exact.
vec2 twoProd(float a, float b) {
    float p = a * b;
    vec2 as = split(a);
    vec2 bs = split(b);
    float e = ((as.x * bs.x - p) + as.x * bs.y + as.y * bs.x) + as.y * bs.y;
    return vec2(p, e);
}

// --- DS operations -------------------------------------------------------------

// (a.hi+a.lo) + (b.hi+b.lo): exact = twoSum(a.hi,b.hi) + a.lo + b.lo
// residual rounding of the lo channel is ~2^-48 relative.
vec2 dsAdd(vec2 a, vec2 b) {
    vec2 s = twoSum(a.x, b.x);
    return vec2(s.x, s.y + a.y + b.y);
}

// Sign flip is exact, so subtraction is negation + addition.
vec2 dsSub(vec2 a, vec2 b) {
    return dsAdd(a, vec2(-b.x, -b.y));
}

// (a.hi+a.lo) * (b.hi+b.lo): exact = twoProd(a.hi,b.hi) + cross terms.
// a.lo*b.lo ~ 2^-50 relative (sub-ULP) — dropped (spec 2.11, verified).
vec2 dsMul(vec2 a, vec2 b) {
    vec2 p = twoProd(a.x, b.x);
    float cross = a.x * b.y + a.y * b.x;
    return vec2(p.x, p.y + cross);
}

// z^2 = twoProd(z.hi,z.hi) + 2*z.hi*z.lo; z.lo^2 ~ 2^-50 relative — dropped.
// One twoProd instead of two (specialization of dsMul(z,z)).
vec2 dsSqr(vec2 z) {
    vec2 p = twoProd(z.x, z.x);
    return vec2(p.x, p.y + 2.0 * z.x * z.y);
}

// s * (d.hi+d.lo) with error capture (scalar s as DS (s,0)).
// Used for the world-coordinate construction: c = offset + fx*zoom.
vec2 dsMulScalar(float s, vec2 d) {
    vec2 p = twoProd(s, d.x);
    return vec2(p.x, p.y + s * d.y);
}
