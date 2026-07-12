# Bug #1: `perfCanvas` ReferenceError in interaction.js

## Problem
The `p` key handler in `interaction.js` line 374 references `perfCanvas.style.display`, but `perfCanvas` is never imported. This throws `ReferenceError: perfCanvas is not defined` at runtime when user presses `P`.

The keyboard handler:
```js
document.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
        S.perfMode = !S.perfMode;
        const btn = document.getElementById('toggle-perf');
        btn.textContent = S.perfMode ? 'On' : 'Off';
        btn.classList.toggle('active', S.perfMode);
        perfCanvas.style.display = S.perfMode ? 'block' : 'none'; // ← perfCanvas not in scope
    }
});
```

## Fix
Add `perfCanvas` to the existing import on line 2:
```js
// Before:
import { canvas } from './state.js';
// After:
import { canvas, perfCanvas } from './state.js';
```

## Verification
- `state.js` line 14 already exports it: `export { canvas, gl, perfCanvas };`
- After fix, press `P` key should toggle perf overlay without error
