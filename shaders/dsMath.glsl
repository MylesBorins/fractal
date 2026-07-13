// =============================================================================
// Double-Single (DS) Arithmetic - Simplified Model
// z = z.hi + z.lo  (z.x = hi, z.y = lo)
//
// We track the low-precision component through every operation.
// The "error" term captures the detail that would be rounded away.
// =============================================================================

// Square: z² = (z.hi + z.lo)² ≈ z.hi² + 2*z.hi*z.lo
// Drops z.lo² as negligible
vec2 dsSqr(vec2 z) {
    return vec2(z.x * z.x, 2.0 * z.x * z.y);
}

// Multiply: a * b ≈ a.hi*b.hi + (a.hi*b.lo + a.lo*b.hi)
// Drops a.lo*b.lo as negligible
vec2 dsMul(vec2 a, vec2 b) {
    return vec2(a.x * b.x, a.x * b.y + a.y * b.x);
}

// Add: (a.hi+a.lo) + (b.hi+b.lo) = (a.hi+b.hi) + (a.lo+b.lo)
vec2 dsAdd(vec2 a, vec2 b) {
    return vec2(a.x + b.x, a.y + b.y);
}

// Subtract: same as add with negated b
vec2 dsSub(vec2 a, vec2 b) {
    return vec2(a.x - b.x, a.y - b.y);
}

// Scale by scalar
vec2 dsMulScalar(float s, vec2 d) {
    return vec2(s * d.x, s * d.y);
}
