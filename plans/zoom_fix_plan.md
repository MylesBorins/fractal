# Zoom Precision Fix Plan

## Goal
Eliminate pixelation during deep zooms by implementing Double-Single (DS) precision arithmetic in the WebGL fragment shader.

## ✅ Phase 1: Infrastructure for Double-Single (DS) precision — COMPLETED

### Step 1.1: Update Fragment Shader Uniforms
- Replace `uOffset` and `uZoom` with:
    - `uOffsetHi` (vec2)
    - `uOffsetLo` (vec2)
    - `uZoomHi` (float)
    - `uZoomLo` (float)

### Step 1.2: Update JS Uniform Locations
- Update `programInfo.uniformLocations` in `main.js` to reflect the new uniform names and types.

### Step 1.3: Implement DS Math in Fragment Shader
- **Calculate $c$ using DS math**: 
    - $c_{hi} = \text{uOffsetHi} + (\text{uv\_rel} \cdot \text{aspect} \cdot \text{uZoomHi})$
    - $c_{lo} = \text{uOffsetLo} + (\text{uv\_rel} \cdot \text{aspect} \cdot \text{uZoomLo})$
- **Implement DS iteration loop**:
    - Represent $z$ as two `vec2`s: `z_hi` and `z_lo`.
    - Update $z$ using:
        - $z_{new\_hi}.x = x_h^2 - y_h^2 + c_{x,hi}$
        - $z_{new\_hi}.y = 2x_h y_h + c_{y,hi}$
        - $z_{new\_lo}.x = 2x_h x_l - 2y_h y_l + c_{x,lo}$
        - $z_{new\_lo}.y = 2x_h y_l + 2x_l y_h + c_{y,lo}$
- **ADDED: Low-low cross-terms** — `zx_l * zx_l`, `zy_l * zy_l`, `2.0 * zx_l * zy_l` added to all DS squaring
- **ADDED: Taylor expansion** for sinusoidal shader low-part derivatives

### Step 1.4: Update `drawScene` in `main.js`
- Replaced `Math.fround(x)` with exponent-based `splitFloat(x)` (power-of-2 + remainder)
- Pass these components to the shader via `gl.uniform2f` and `gl.uniform1f`.

## ✅ Phase 2: Refinement — COMPLETED

### Step 2.1: Fix Smooth Coloring with DS precision
- Update the $|z|$ calculation in the shader to use $z_{hi}$ and $z_{lo}$ components for better precision: $|z|^2 \approx \text{dot}(z_{hi}, z_{hi}) + 2 \cdot (z_{hi}.x \cdot z_{lo}.x + z_{hi}.y \cdot z_{lo}.y) + z_{hi}^2 + z_{lo}^2$.

### Step 2.2: Increase Iteration Limit
- Shader loop limit raised from 2000 to 10,000 with break at maxIter
- Auto-iterations now scale with zoom depth: base 100 + 150 × zoomDecade, cap 5000

### Step 2.3: Update UI/UX
- Adjust `minZoom` in `index.html` and `main.js` to allow deeper exploration (e.g., $10^{-30}$).
- Added perf overlay auto-iter status line

## Phase 3: Double-Double Precision (Stretch)

For zooms beyond $10^{37}$, Phase 3 will implement Double-Double (DD) precision:
- Represent values as 4 floats (hi + lo + mid + tiny) instead of 2
- ~30 significant digits → $10^{60}$ target
- Performance cost: ~2-4 FPS at 1080p
- Key math: DD multiplication requires 7 partial products, DD addition requires reassociation

## Phase 4: Arbitrary Precision / Multi-pass (Stretch Goal)

For extreme zooms beyond $10^{60}$:
- Multi-pass rendering: precompute high-precision c values on CPU, pass as textures
- CPU-based arithmetic with BigInt or FP64 libraries
- Target: $10^{80}+$ with acceptable performance via lower resolution rendering
