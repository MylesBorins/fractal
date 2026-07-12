# Bug #3: Sinusoidal shader low-precision missing Taylor derivatives

## Problem
The sinusoidal fractal shader (`shaders/fsSin.glsl`) still passes `c_x_l` and `c_y_l` directly to the low-precision components without applying Taylor expansion derivatives:

```glsl
float nx_l = c_x_l;
float ny_l = c_y_l;
```

The tasks.md says "Taylor derivatives" were added, but they're NOT present.

## Expected Fix
Apply chain rule for `sin(z)` and `cos(z)` to the low-precision part:

```glsl
// sin(z + dz) ≈ sin(z) + dz·cos(z)
// cos(z + dz) ≈ cos(z) - dz·sin(z)
float sin_cos_x = cos(zx_h);
float nx_l = c_x_l + zx_l * sin_cos_x * cosh_zh;
float ny_l = c_y_l - zx_l * sin(zx_h) * sinh_zh;
```

Where `cosh_zh` and `sinh_zh` are already computed above.

## Key File
- `shaders/fsSin.glsl` — lines ~41-42: `float nx_l = c_x_l;` and `float ny_l = c_y_l;`
