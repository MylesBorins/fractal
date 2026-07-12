# Bug #2: `zoom` is undefined in interaction.js

## Problem
Two references to `zoom` (not `S.zoom` or a local variable) in `interaction.js` will cause `ReferenceError: zoom is not defined`.

### Location 1 — Wheel handler (line ~369):
```js
document.getElementById('zoom').value = String(zoom);
// Should be: String(S.zoom)
```

### Location 2 — Last line of file (line ~430):
```js
document.getElementById('zoom').value = String(zoom);
// Should be: String(S.zoom)
```

## Fix
Replace both occurrences of `String(zoom)` with `String(S.zoom)`.

## Context
The wheel handler and the final line are both trying to update the zoom input field after a zoom change. Since `zoom` is not a local variable or imported, it should reference `S.zoom` (the state store's zoom property).
