# Bug #1: `shaderPrograms` not exported from shaders.js

## Problem
`render.js` line 2 imports `shaderPrograms` from `./shaders.js`:
```js
import { shaderPrograms, getUniformLocations } from './shaders.js';
```

But `shaders.js` declares it as `export let shaderPrograms = {}` — which IS exported.
HOWEVER, the `shaderPrograms` is mutable (a `let`), and `getUniformLocations` reads from the passed `program` arg but the code in `render.js` uses `shaderPrograms` as a module-level reference.

The real issue: `render.js` line 11 uses `shaderPrograms[tf]` to look up shader programs, but `shaderPrograms` is a **module-level mutable variable** that gets populated by `initShaderPrograms()`. If `render.js`'s render loop runs before `initShaderPrograms()` completes, `shaderPrograms` would still be `{}`.

## Fix
1. Verify `shaders.js` exports `shaderPrograms` (it does: `export let shaderPrograms = {}`)
2. The import in `render.js` should work — but double-check by grepping all references
3. If the import works, verify the import chain: `main.js` calls `initShaderPrograms()` before `requestAnimationFrame(render)`, so timing should be fine
4. If there's actually an import error, fix the export

## Key Files
- `shaders.js` — line 5: `export let shaderPrograms = {}`
- `render.js` — line 2: `import { shaderPrograms, getUniformLocations } from './shaders.js';`
- `main.js` — line 24: `initShaderPrograms(gl);` called before `requestAnimationFrame(render)`
