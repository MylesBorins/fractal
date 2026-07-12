# Phase 0 Audit: Module Wiring Issues

## Task
Audit and fix all broken imports, missing exports, and dead code in the modular refactor. The app is non-functional due to cascading import failures.

## Known Issues (discovered so far)

### 1. Duplicate import in render.js
Line: `import { resizeCanvasToDisplaySize } from './state.js';` appears twice
- Once on the main import line: `import { buffers, perfCanvas, perfCtx, getFractalFamily, canvas, gl } from './state.js';`
- Once on a separate line (dead import)

### 2. HTML module loading order
`index.html` has a single `<script type="module">` block. This works for side-effect imports, BUT:
- `main.js` is loaded last in HTML but contains the `init()` call
- `main.js` imports from state.js, shaders.js, and render.js
- `render.js` imports from state.js, stateStore.js, shaders.js, state.js (again)
- Need to verify no circular dependencies

### 3. `render.js` function call pattern
`render.js` calls `resizeCanvasToDisplaySize()` but this function may need the canvas element
- Check if render.js has its own resize function or relies on state.js

### 4. Missing `initInteraction` import in main.js
main.js calls `initInteraction()` but this function is defined in... interaction.js?
- Check if initInteraction is exported from interaction.js or needs to be imported

### 5. `render.js` calls functions from interaction.js?
- Check if render.js references any interaction.js functions
- Check if render.js has its own animation loop or delegates to interaction.js

### 6. Shader switch logic
render.js has `S.shaderFamily` / `S.shaderProgram` / `S.shaderUniforms` references
- Check if these properties exist in stateStore.js
- Check if `shaderPrograms` object is being used correctly with the new structure

### 7. Perf overlay
`render.js` draws to `perfCtx` — verify it's exported from state.js correctly
- `perfCanvas` and `perfCtx` should be exported from state.js

## Steps

1. **Read all 6 JS files** — grep for all imports and exports
2. **Map the dependency graph** — ensure no cycles or missing exports
3. **Check stateStore.js** — verify ALL properties used across modules exist in S
4. **Check shaders.js** — verify ALL function exports match usage
5. **Check state.js** — verify ALL exports match usage
6. **Verify HTML module loading** — check script order and imports
7. **Fix all issues found** — use edit tool for targeted fixes
8. **Test in browser** — confirm app loads without errors

## Key Files to Audit

- `main.js` — Entry point, init() call
- `state.js` — Canvas, WebGL, buffers, utilities
- `stateStore.js` — All mutable state in S object
- `shaders.js` — Shader compilation, program management
- `render.js` — Draw loop, perf overlay, shader switching
- `interaction.js` — Mouse/touch/keyboard events
- `index.html` — Module loading, DOM

## What to Verify

1. Every `import` in every file resolves to a valid export
2. Every called function is defined somewhere and imported where needed
3. All `S.<property>` references exist in stateStore.js
4. No dead code (unused imports, unused variables)
5. No circular dependencies
6. HTML module loading doesn't break any imports
