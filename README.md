# Fractal Explorer

A WebGL-powered fractal visualization tool with Double-Single (DS) precision arithmetic for deep zooming.

## Features

- **Multiple Fractal Types**
  - Mandelbrot
  - Julia Set
  - Burning Ship
  - Tricorn (Mandelbar)
  - Sinusoidal

- **Deep Zoom Support**
  - Double-Single precision arithmetic in WebGL fragment shader
  - Supports zoom levels down to 10⁻³⁰
  - 2000 iteration limit for high detail at deep zooms

- **Interactive Controls**
  - Real-time zoom and pan
  - Adjustable iteration count
  - Auto-zoom mode
  - Iteration oscillation
  - Color cycling and shifting

- **Smooth Animations**
  - Smooth iteration interpolation
  - Smooth width transitions for UI panel

## Project Structure

```
├── index.html      # Main HTML with UI controls
├── main.js         # WebGL rendering and interaction logic
├── style.css       # UI styling
├── agents.md       # Agent specifications and workflows
├── README.md       # This file
└── plans/          # Task tracking and implementation plans
    ├── tasks.md           # Current tasks and known issues
    └── zoom_fix_plan.md   # DS precision implementation plan
```

## Quick Start

Open `index.html` in a modern web browser with WebGL support.

## Controls

| Control | Description |
|---------|-------------|
| Fractal Type | Select between 5 different fractal algorithms |
| Zoom | Adjust zoom level (slider or mouse wheel) |
| Zoom Speed | Control zoom animation speed |
| Iterations | Number of iterations for fractal calculation |
| Auto Zoom | Enable automatic zoom animation |
| Color Cycle | Enable automatic color shifting |
| Iteration Oscillate | Smoothly oscillate iteration count |

## Known Issues

See [`plans/tasks.md`](./plans/tasks.md) for current issues:

1. **Julia Set** - Appears as solid color; viewport control needs verification
2. **Burning Ship** - Rendering issues with absolute value operations
3. **Tricorn** - Appears stretched; aspect ratio calculation may need adjustment

## Development

### Double-Single Precision

The shader uses DS precision to extend WebGL's floating-point limitations:

```glsl
// High and low components for offset and zoom
uniform vec2 uOffsetHi, uOffsetLo;
uniform float uZoomHi, uZoomLo;

// Calculate c with DS precision
float c_x_h = uOffsetHi.x + fx * uZoomHi;
float c_x_l = uOffsetLo.x + fx * uZoomLo;
```

See [`plans/zoom_fix_plan.md`](./plans/zoom_fix_plan.md) for full implementation details.

### Agents

See [`agents.md`](./agents.md) for agent workflows and how to use them with the plans directory.

## Browser Support

Requires WebGL 1.0+ support:
- Chrome 9+
- Firefox 4+
- Safari 6+
- Edge 12+

## License

MIT
