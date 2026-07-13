// =============================================================================
// Double-Single (DS) Arithmetic - Simplified Model
// 
// z = z.hi + z.lo, where z.lo is the DS error term from zoom/offset precision.
// 
// z² = (z.hi + z.lo)² ≈ z.hi² + 2*z.hi*z.lo   (z.lo² ≈ 0)
// zx*zy ≈ zx.hi*zy.hi + zx.hi*zy.lo + zx.lo*zy.hi
// =============================================================================

// Compute z² for a DS number z (z.x = hi, z.y = lo)
// Returns (z.hi², 2*z.hi*z.lo) — drops z.lo² as negligible
vec2 dsSqr(vec2 z) {
    float hi2 = z.x * z.x;
    float err = 2.0 * z.x * z.y;
    return vec2(hi2, err);
}

// Multiply two DS numbers a * b
// Returns (a.hi*b.hi, a.hi*b.lo + a.lo*b.hi) — drops a.lo*b.lo as negligible
vec2 dsMul(vec2 a, vec2 b) {
    float hi = a.x * b.x;
    float err = a.x * b.y + a.y * b.x;
    return vec2(hi, err);
}

// Add two DS numbers
vec2 dsAdd(vec2 a, vec2 b) {
    return vec2(a.x + b.x, a.y + b.y);
}

// Subtract two DS numbers
vec2 dsSub(vec2 a, vec2 b) {
    return vec2(a.x - b.x, a.y - b.y);
}

// Scale a DS number by a scalar
vec2 dsMulScalar(float s, vec2 d) {
    return vec2(s * d.x, s * d.y);
}
