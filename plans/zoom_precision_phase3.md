# Phase 3: Replace Scalar Iteration with DS Arithmetic

## Problem
At zoom 10⁷, float32 precision (~7 significant digits) is insufficient. The offset (~0.74) consumes 2 digits, leaving only 5 for the zoom-detail (~10⁻⁷), causing rounding errors that accumulate each iteration → pixelated/rectangular artifacts.

## Current State
- `dsMath.glsl` exists with: `dsSqr(z)`, `dsMul(a,b)`, `dsAdd(a,b)`, `dsSub(a,b)`, `dsMulScalar(s,d)`
- All three shaders (`fsQuad.glsl`, `fsBS.glsl`, `fsSin.glsl`) still use `float zx, zy` (scalar)
- The iteration loop (`zx*zx`, `zx*zy`, etc.) is scalar — loses precision after step 1

## Solution
Replace `float zx, zy` with `vec2 zx, zy` (DS format: x=hi, y=lo) and rewrite the iteration loop using DS primitives.

## DS Math Reference
- `dsSqr(z)` → `(z.x*z.x, 2*z.x*z.y)` — squaring
- `dsMul(a,b)` → `(a.x*b.x, a.x*b.y + a.y*b.x)` — multiply
- `dsAdd(a,b)` → `(a.x+b.x, a.y+b.y)` — add
- `dsSub(a,b)` → `(a.x-b.x, a.y-b.y)` — subtract

## Implementation Steps

### Step 1: fsQuad.glsl — Mandelbrot/Julia/Tricorn
- Change `float zx, zy` → `vec2 zx, zy`
- Mandelbrot/Tricorn init: `zx = vec2(0.0); zy = vec2(0.0);`
- Julia init: `zx = c_x; zy = c_y;` (both are already vec2)
- Iterate:
  ```glsl
  vec2 zxSqr = dsSqr(zx);
  vec2 zySqr = dsSqr(zy);
  vec2 zxzy = dsMul(zx, zy);
  vec2 zxzy2 = dsAdd(zxzy, zxzy);  // 2*zx*zy
  ```
  - Mandelbrot/Julia: `nx = dsSub(dsSub(zxSqr, zySqr), c_xAdd); ny = dsAdd(zxzy2, c_yAdd);`
  - Tricorn: same but `ny = dsSub(c_y, zxzy2);`
- Magnitude check: `float mag2 = zx.x*zx.x + zy.x*zy.x;` (hi components only)

### Step 2: fsBS.glsl — Burning Ship
- Same pattern: `vec2 zx, zy`
- Init: `zx = vec2(0.0); zy = vec2(0.0);`
- Iterate:
  ```glsl
  vec2 ax = (zx.x >= 0.0) ? zx : vec2(-zx.x, -zx.y);
  vec2 ay = (zy.x >= 0.0) ? zy : vec2(-zy.x, -zy.y);
  vec2 axSqr = dsSqr(ax);
  vec2 aySqr = dsSqr(ay);
  vec2 realPart = dsSub(axSqr, aySqr);
  vec2 zProd = dsMul(ax, ay);
  vec2 imagPart = dsAdd(zProd, zProd);
  vec2 nx = dsAdd(realPart, c_x);
  vec2 ny = dsAdd(imagPart, c_y);
  ```

### Step 3: fsSin.glsl — Sinusoidal
- More complex: sin(z) for complex z involves exp/sin/cos
- Use Taylor expansion for DS:
  ```glsl
  // sin(z) ≈ sin(zx.x)*cosh(zy.x) + i*cos(zx.x)*sinh(zy.x)  [high part]
  // Derivative of sin(z) = cos(z)
  // Low part = cos(zx.x)*cosh(zy.x)*zx.y + sin(zx.x)*sinh(zy.x)*zy.y  [imag derivative]
  ```
- This requires more careful handling but same DS pattern

### Step 4: Debug output update
- Update debug color mode to show `zx.x` and `zx.y` separately
- Verify the DS low component is non-zero (proving precision is preserved)
