# Fractal Explorer - Remaining Tasks

## Completed

### ✅ Side Panel Redesign
- Permanent drawer on the left side
- Collapses to small 50px hint bar
- Scrollable controls area with custom scrollbar
- Smooth width transition

### ✅ Iteration Oscillation Smoothing
- Added smooth interpolation between target values
- Much smoother animation now

## Current Issues

### 1. Julia Set - Solid Color
- Julia set appears as solid color instead of showing the fractal
- Need to verify the offset/zoom are controlling viewport correctly
- The c value should be fixed, but viewport should still work

### 2. Burning Ship - "Borning"
- Burning Ship fractal has issues
- The absolute value operation may be breaking DS error tracking
- May need to simplify DS math for this fractal type

### 3. Tricorn - Stretched
- Tricorn appears stretched/distorted
- Need to check if aspect ratio is being applied correctly
- May need to adjust the coordinate calculation
