// =============================================================================
// Double-Single (DS) Arithmetic
// z = z.hi + z.lo  (z.x = hi, z.y = lo)
//
// Key insight: every float operation introduces a rounding error.
// DS arithmetic captures that error so it can be added back later.
// =============================================================================

// Compute sum = a + b and its rounding error exactly
vec2 dsTwoSum(float a, float b) {
    float s = a + b;
    float bDelta = b - (s - a);
    float aDelta = a - (s - b);
    float err = aDelta + bDelta;
    return vec2(s, err);
}

// Multiply two floats and return (product, rounding error)
// Veltkamp split: split a into high 11-bit half + low remainder
vec2 dsTwoProd(float a, float b) {
    float s = a * b;
    // Extract the rounding error using the fact that
    // the error = (a*b) - s, but we can't compute a*b exactly.
    // Instead, split a and b into halves and recombine.
    float uHi = a * 32769.0;  // split(a)
    float uLo = a - uHi;
    float vHi = b * 32769.0;  // split(b)
    float vLo = b - vHi;
    
    // The error is: uHi*vHi + (uHi*vLo + uLo*vHi) - a*b
    float err = uHi * vHi - s + uHi * vLo + uLo * vHi;
    return vec2(s, err);
}

// Square a DS number: z² = (z.hi + z.lo)²
// Returns (z.hi², 2*z.hi*z.lo) — drops z.lo² as sub-ULP
vec2 dsSqr(vec2 z) {
    vec2 p0 = dsTwoProd(z.x, z.x);  // (z.hi², exact error of z.hi²)
    float cross = 2.0 * z.x * z.y;  // 2*z.hi*z.lo
    vec2 loSum = dsTwoSum(p0.y, cross);
    vec2 total = dsTwoSum(p0.x, loSum.x);
    float err = total.y + loSum.y;
    return vec2(total.x, err);
}

// Multiply two DS numbers: a * b = a.hi*b.hi + (a.hi*b.lo + a.lo*b.hi) + a.lo*b.lo
// Drops a.lo*b.lo as sub-ULP
vec2 dsMul(vec2 a, vec2 b) {
    vec2 p0 = dsTwoProd(a.x, b.x);  // (a.hi*b.hi, exact error)
    float cross = a.x * b.y + a.y * b.x;  // a.hi*b.lo + a.lo*b.hi
    vec2 loSum = dsTwoSum(p0.y, cross);
    vec2 total = dsTwoSum(p0.x, loSum.x);
    float err = total.y + loSum.y;
    return vec2(total.x, err);
}

// Add two DS numbers
vec2 dsAdd(vec2 a, vec2 b) {
    vec2 total = dsTwoSum(a.x, b.x);
    float err = total.y + a.y + b.y;
    return vec2(total.x, err);
}

// Subtract two DS numbers
vec2 dsSub(vec2 a, vec2 b) {
    vec2 total = dsTwoSum(a.x, -b.x);
    float err = total.y + a.y - b.y;
    return vec2(total.x, err);
}

// Scale a DS number by a scalar
vec2 dsMulScalar(float s, vec2 d) {
    return vec2(s * d.x, s * d.y);
}
