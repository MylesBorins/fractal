# Deep Zoom Progression Specification

## Executive Summary

This spec outlines the roadmap for progressively deeper fractal zooms in the WebGL Fractal Explorer. It covers the precision ceiling of the current implementation, identifies bottlenecks, and proposes multiple strategies to push beyond the current ~10⁻³⁰ limit.

---

## 1. Current State & Precision Analysis

### 1.1 Current Implementation

The project uses **Double-Single (DS) precision** in the fragment shader:

- **Uniforms** split into hi/lo: `uOffsetHi`, `uOffsetLo`, `uZoomHi`, `uZoomLo`
- **Splitting** done in JS via `Math.fround()` (float32 truncation)
- **Shader math** propagates both components through iterations

### 1.2 The Precision Ceiling

| Precision Level | Decimal Digits | Zoom Limit | How It Breaks |
|-----------------|----------------|------------|---------------|
| float32 only | ~7 | ~10⁷ | Pixelation, lost detail |
| DS (current) | ~14–15 | ~10³⁰ | Low parts become noise |
| DS (improved) | ~20–22 | ~10⁴⁰ | Accumulation error in iterations |
| quad-precision* | ~34 | ~10⁶⁰ | Requires custom arithmetic |

\* *Quad-precision via "double-double" (two doubles per value) or emulated 128-bit math*

### 1.3 Why DS Fails Deep

With zoom = 10⁻³⁰:

```js
// Current approach:
const zoomHi = Math.fround(1e-30);   // ~0.0 (underflows to 0!)
const zoomLo = 1e-30 - 0.0;          // 1e-30 (all precision in low part)
```

At extreme zooms, `Math.fround()` either:
- **Underflows to 0** (the hi part vanishes)
- **Has ~7 digits of precision**, so the low part carries 23 meaningful digits

The DS pair `(hi + lo)` only gives **~14 significant digits total**, meaning useful detail vanishes around zoom 10³⁰ because the `lo` component's low ~7 digits are essentially random noise from the splitting process.

---

## 2. Strategy Overview

| Strategy | Target Zoom | Effort | Complexity | Performance Cost |
|----------|-------------|--------|------------|------------------|
| A. Fix DS splitting | 10³⁵ | Low | Low | None |
| B. Double-Double precision | 10⁶⁰ | High | High | 2–4× slower |
| C. GPU FP64 / WebGL2 | 10¹⁵ | Medium | Medium | Minimal |
| D. CPU + OffscreenCanvas | 10⁶⁰+ | Medium | Medium | High |
| E. Arbitrary precision library | 10⁸⁰+ | Very High | Very High | Very high |
| F. Progressive zoom layers | 10¹⁰⁰+ | Very High | Very High | Adaptive |

---

## 3. Strategy A — Fix DS Splitting (Quick Win)

### 3.1 Problem

`Math.fround(zoom)` loses meaning at extreme zooms. When zoom = 10⁻³⁰:
- `fround(1e-30)` → `0.0` (underflows in float32)
- All precision collapses to the `lo` part, which is then just a single float32

### 3.2 Solution: Refractored Splitting

Instead of `hi = fround(zoom)`, use a **binary exponent splitting**:

```js
// For any zoom value z:
function splitDS(z) {
    const hi = Math.fround(z);  // High part with ~7 digits
    const lo = z - hi;          // Low part with remaining precision
    return [hi, lo];
}

// But for offset, use full JS double precision splitting:
function splitOffset(hi, lo, uvX, aspect) {
    // c = offset + uv * zoom
    // Split into two doubles that sum to the correct value
    const cx_hi = hi + uvX * zoomHi;  // ~7 digits
    const cx_lo = lo + uvX * zoomLo;  // remaining ~17 digits
    return [cx_hi, cx_lo];
}
```

### 3.3 Shader Improvements

The current DS iteration loses precision in the accumulation of `z_lo`. The fix is to use **Kahan-style compensated summation** within the iteration:

```glsl
// Instead of:
zx_l = 2.0 * zx_h * zx_l;  // loses precision

// Use:
float zx2_new_hi = zx_h * zx_h;
float zx2_new_lo = 2.0 * zx_h * zx_l + zx_l * zx_l;  // capture more
zx_h = zx2_new_hi - zy_h * zy_h;
zx_l = zx2_new_lo - 2.0 * zy_h * zy_l;              // better low part
```

### 3.4 Expected Result

- **Improvement**: ~10–100× deeper before noise dominates
- **New limit**: ~10³⁵–10³⁷
- **Cost**: None (same shader structure)

---

## 4. Strategy B — Double-Double Precision (Big Leap)

### 4.1 Concept

Represent each number as **two `double` (float64) values** that sum to the true value:

```
x ≈ x_hi + x_lo
where x_hi = f64(x) and x_lo = x - x_hi (the remainder)
```

This gives **~32 decimal digits of precision**.

### 4.2 WebGL Constraints

Standard WebGL only guarantees **float32**. However:

| Approach | Availability | Precision | Notes |
|----------|--------------|-----------|-------|
| WebGL2 `highp float` | Most devices | 32-bit float | Still float32 |
| `GL_EXT_float_blend` | Some GPUs | 32-bit | No real gain |
| **Custom FP64 emulation** | All GPUs | ~14 digits | Two floats per value |
| **Shader-based double-double** | All GPUs | ~32 digits | Four floats per value |

### 4.3 Double-Double in WebGL (4 floats per value)

Each coordinate becomes `vec4(x_hi, x_lo, y_hi, y_lo)`:

```glsl
// DS double-double: each value = 2 floats (hi + lo)
// z = (zh, zl) where zh is the "high double" and zl is the "low double"
// Each of zh, zl is itself a pair: (z_hi_h, z_hi_l), (z_lo_h, z_lo_l)

// Total: 4 floats per complex number instead of 2
```

This means **4× the operations** per iteration but **~32 digits** of precision.

### 4.4 Implementation Plan

#### Step 1: New Uniform Layout
```js
// Each complex number represented by 4 floats (double-double)
uniform vec2 uOffsetHH;  // offset_hi high half
uniform vec2 uOffsetHL;  // offset_hi low half
uniform vec2 uOffsetLH;  // offset_lo high half
uniform vec2 uOffsetLL;  // offset_lo low half
uniform float uZoomHH, uZoomHL, uZoomLH, uZoomLL;
```

#### Step 2: Splitting in JS (Full double-double)
```js
function toDoubleDouble(z) {
    // Step 1: Split z into two doubles
    const d1 = z;  // Full JS double (53 bits)
    const d2 = 0.0;  // Placeholder
    
    // Step 2: Split d1 into two float32s
    const h1 = Math.fround(d1);
    const l1 = d1 - h1;
    
    // Step 3: l1 is already small, split it further
    const h2 = Math.fround(l1);
    const l2 = l1 - h2;
    
    return [h1, l1 - h2, h2, l2];
}
```

#### Step 3: DS-Quadruple Math in Shader
```glsl
// Each component: (v_hh, v_hl, v_lh, v_ll)
// Product of two such values requires careful expansion
// to maintain the double-double invariant
```

#### Step 4: Performance
- **Iterations/sec**: ~1/4 current (4× operations per iteration)
- **Max practical iterations**: ~500–1000 (vs 2000 current)
- **Effective depth**: ~10⁶⁰

---

## 5. Strategy C — WebGL2 + GPU FP64 (Device-Dependent)

### 5.1 Approach

Use WebGL2 with `GL_EXT_float64` extension if available:

```js
const ext = gl.getExtension('EXT_color_buffer_float');
const hasFP64 = gl.getExtension('WEBGL_float64');  // Non-standard
```

Most consumer GPUs do **not** support true FP64. This is primarily useful on:
- Professional/ workstation GPUs (NVIDIA RTX A-series, AMD Radeon Pro)
- Some Intel Arc GPUs

### 5.2 Hybrid Approach

Detect FP64 availability and fall back:

```js
function detectPrecision() {
    const ext = gl.getExtension('OES_texture_float_linear');
    if (ext) {
        // Check for higher precision support
        return 'highp';
    }
    return 'standard';
}
```

---

## 6. Strategy D — CPU Rendering (OffscreenCanvas)

### 6.1 Concept

Use the **OffscreenCanvas API** to render fractals on a Web Worker with full JS double precision:

```js
// Main thread
const offscreen = canvas.transferControlToOffscreen();
const worker = new Worker('fractal-worker.js');
worker.postMessage(offscreen);

// Worker: Full 53-bit precision, arbitrary precision libraries
// Can use `bigint` for arbitrary precision
```

### 6.2 Advantages

- Full **JavaScript double precision** (53-bit mantissa, ~15 digits)
- Can integrate **arbitrary precision libraries** (e.g., [bigfloat](https://github.com/peterkrautz/bigfloat.js))
- No WebGL shader limitations

### 6.3 Disadvantages

- **Much slower** than GPU (no parallelism across pixels without SharedArrayBuffer)
- **No hardware acceleration** for fractal math
- Memory constraints on worker heap

### 6.4 Target Performance

| Resolution | Time/Frame | Zoom Limit |
|------------|------------|------------|
| 256×256 | ~50ms | 10¹⁵ |
| 256×256 + DS | ~200ms | 10³⁰ |
| 128×128 + arbitrary-precision | ~500ms | 10⁶⁰+ |

---

## 7. Strategy E — Arbitrary Precision (The Nuclear Option)

### 7.1 Approach

Integrate an arbitrary-precision arithmetic library and compute the fractal with **N-digit precision**:

```js
// Using a library like bigfloat.js or custom BigInt-based arithmetic
import { BigFloat } from 'bigfloat.js';

// Each iteration uses arbitrary precision
let z = new BigFloat(0, precision);  // e.g., 100 digits
let c = computeCPixel(precision);

for (let i = 0; i < maxIter; i++) {
    z = z * z + c;  // All arithmetic at full precision
    if (abs(z) > 2) break;
}
```

### 7.2 GPU Port of Arbitrary Precision

Implement the arbitrary precision math **inside the shader** using multiple float32 values:

```glsl
// 32-digit precision: use 4 float32s per value
// v0: most significant ~7 digits
// v1: next ~7 digits
// v2: next ~7 digits
// v3: least ~7 digits

// Multiply two such values with full carry propagation
```

### 7.3 Trade-offs

| Digits | Floats/Value | Ops/Iteration | Zoom Limit | Perf Impact |
|--------|--------------|---------------|------------|-------------|
| 14 (DS) | 2 | ~16 | 10³⁰ | baseline |
| 32 (DD) | 4 | ~64 | 10⁶⁰ | 4× slower |
| 50 (triple) | 6 | ~144 | 10¹⁰⁰ | 9× slower |
| 100+ | 12+ | ~576+ | 10²⁰⁰+ | 36× slower |

---

## 8. Strategy F — Progressive Zoom Layers

### 8.1 Concept

Rather than computing the entire fractal at extreme precision, use **a multi-pass approach**:

1. **Pass 1**: Render at moderate zoom (float32)
2. **Pass 2**: Zoom deeper, compute only the visible region at DS precision
3. **Pass 3**: Zoom even deeper, compute at double-double precision

Each pass uses **increasing precision** only where needed.

### 8.2 Implementation

```js
// Multi-pass rendering with FBO ping-pong
const fbo1 = createFBO(256, 256);  // Low precision base
const fbo2 = createFBO(256, 256);  // DS precision overlay
const fbo3 = createFBO(256, 256);  // Double-double deep overlay

function renderDeepZoom() {
    // Pass 1: Base at 10⁻⁷ precision
    bindFBO(fbo1); renderPass1();
    
    // Pass 2: DS precision for center region
    bindFBO(fbo2); renderPass2(fbo1);  // Sample from pass 1
    
    // Pass 3: Double-double for extreme center
    bindFBO(fbo3); renderPass3(fbo2);  // Sample from pass 2
    
    // Composite all passes
    renderComposite(fbo3);
}
```

### 8.3 Benefits

- Only computes high precision where visually necessary
- **Adaptive**: zoom levels determine precision tier
- **Smooth transitions** between precision layers
- Avoids computing unnecessary high-precision pixels

---

## 9. Recommended Implementation Order

### Phase 1: Quick Wins (Week 1–2)

1. **[A]** Fix DS splitting to handle extreme zooms without underflow
2. **[A]** Improve shader accumulation to preserve low-part precision
3. **Result**: Push from ~10³⁰ → ~10³⁷

### Phase 2: Double-Double (Week 3–6)

4. **[B]** Implement double-double precision in shader
5. **[B]** Update uniform layout and JS splitting
6. **[B]** Performance profiling and optimization
7. **Result**: Push from ~10³⁷ → ~10⁶⁰

### Phase 3: Arbitrary Precision (Month 2+)

8. **[E]** Integrate arbitrary precision for extreme cases
9. **[E]** Add progressive zoom layers for smooth UX
10. **[F]** Multi-pass rendering with adaptive precision
11. **Result**: Push to 10⁸⁰+

### Phase 4: Hardware Acceleration (Stretch)

12. **[C]** WebGL2 FP64 detection and fallback
13. **[D]** OffscreenCanvas worker for CPU rendering
14. **[D]** Hybrid GPU+CPU for very deep zooms

---

## 10. Precision Math Reference

### 10.1 Double-Single Multiplication

For `a = (a_h, a_l)` and `b = (b_h, b_l)`:

```
a * b = (a_h + a_l) * (b_h + b_l)
      = a_h*b_h + a_h*b_l + a_l*b_h + a_l*b_l

Product in DS:
result_h = a_h * b_h          (most significant)
result_l = a_h*b_l + a_l*b_h + a_l*b_l  (all remaining terms)
```

### 10.2 Double-Double Multiplication

For `a = (a_hh, a_hl)` and `b = (b_hh, b_hl)`:

```
a * b ≈ a_hh * b_hh                                    (hh component)
      + a_hh * b_hl + a_hl * b_hh                     (hl component)
      + a_hl * b_hl + negligible                      (ll component, optional)
```

Full expansion with error correction requires **32–64 operations** per multiplication.

### 10.3 Kahan Summation for Iteration

```glsl
// Compensated iteration accumulation
float c_sum = zx_h * zx_h - zy_h * zy_h + c_x_h;
float c_err = zx_h * zx_h - (c_sum - c_x_h + zy_h * zy_h);  // error term
float c_lo = c_err + 2.0 * zx_h * zx_l - 2.0 * zy_h * zy_l + c_x_l;
```

---

## 11. Visual Quality Considerations

### 11.1 At Extreme Zooms

As precision decreases, artifacts appear in this order:

1. **Pixelation** (float32 limit, ~10⁷)
2. **Band patterns** (DS low-part noise, ~10²⁰–10³⁰)
3. **Random speckling** (DS underflow, ~10³⁰+)
4. **Uniform garbage** (all precision lost, ~10⁶⁰+)

### 11.2 Detection & Graceful Degradation

```js
function detectPrecisionBreak() {
    // Track color variance across iterations
    // Sudden random color changes = precision breakdown
    // Trigger zoom reset or precision upgrade
}
```

### 11.3 User Experience

- **Warn before precision limit**: Show "approaching precision limit" indicator
- **Graceful fallback**: Auto-suggest resetting to a new region
- **Progressive disclosure**: Show which precision layer is active

---

## 12. Performance Budget

| Mode | Resolution | Iterations | FPS | Max Depth |
|------|-----------|------------|-----|-----------|
| float32 | 1920×1080 | 500 | 60 | 10⁷ |
| DS (current) | 1920×1080 | 2000 | 15 | 10³⁰ |
| DS (improved) | 1920×1080 | 2000 | 15 | 10³⁷ |
| Double-Double | 1920×1080 | 500 | 4 | 10⁶⁰ |
| Arbitrary (CPU) | 256×256 | 1000 | 0.1 | 10⁸⁰+ |

---

## 13. Open Questions

1. **Which approach gives the best UX/performance ratio?**
   - Double-double (10⁶⁰) vs arbitrary precision (10⁸⁰+) with CPU?

2. **Should we add a "precision indicator" to the UI?**
   - Show current precision tier (float32 / DS / DD / Arbitrary)

3. **Can we use compute shaders for parallel arbitrary precision?**
   - Requires WebGL2 compute (limited support)

4. **What's the practical limit of deep zoom exploration?**
   - At 10⁶⁰, the visual features become sub-atomic scale

5. **Should we support saving/loading deep zoom states?**
   - Store the full hi/lo/ll/llL precision state for reproducibility

---

## Appendix: Known Deep Zoom Points

| Point | Coordinates | Current Reach | Target Reach |
|-------|-------------|---------------|--------------|
| Seahorse Valley | (-0.743643887037158, 0.131825904205311) | ~10³⁰ | 10³⁷+ |
| Elephant Valley | (-0.1607205, 1.037724) | ~10³⁰ | 10³⁷+ |
| West Arm | (-1.76, 0) | ~10²⁵ | 10³⁵+ |
| Mini Mandelbrot | (0.275, 0.008) | ~10²⁸ | 10³⁵+ |
| Airplane Valley | (0.275769, 0.008258) | ~10²⁸ | 10³⁵+ |
| **Burning Ship deep** | (-0.381966, 0.035612) | ~10²⁰ | 10³⁰+ |
