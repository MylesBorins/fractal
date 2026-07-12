# Agent Workflow & Token Budget Guide

## The Problem

This file documents why the agent keeps hitting token limits and compaction cycles, and how to avoid it.

**Root causes:**

1. `main.js` is 1,000+ lines — reading any part of it adds ~5-8KB to context
2. Three shader strings live in one file (`fsSourceQuad`, `fsSourceBS`, `fsSourceSin`) — editing one requires reading all three
3. No chunking protocol — big changes (Phase 3 = 4 shaders + uniforms + JS refactoring) get attempted in one turn
4. Compaction loses precision — after truncation, summaries miss exact line numbers and whitespace that `edit()` needs

## Rule 1: Never attempt >2 edits in a single turn

**Before you start:** count how many files or code blocks you need to change.

| Edits needed | Action |
|--------------|--------|
| 1 | OK, proceed |
| 2 | OK, but keep edits small |
| 3+ | **Stop.** Break into separate turns. Say "Turn 1 of N" and do one. |

**Example:** Phase 3 (Double-Double) = 3 shaders + uniform locations + `drawScene` splitting logic + perf UI = **5 edits minimum**. That's 2-3 turns.

## Rule 2: Ask before reading large files

**Never read more than 30 lines at a time.** If you need context:

1. Use `grep` or `wc -l` to find line numbers first
2. Read only the 10-20 lines immediately surrounding your target
3. Build a mental map of line ranges from what you've already seen

**Forbidden patterns:**
- ❌ `read main.js` with no offset
- ❌ `read deep_zoom_spec.md` in full (15KB)
- ❌ Reading files just to "get context" before asking

**Allowed patterns:**
- ✅ `grep "fsSource" main.js` → get line numbers, then read those lines
- ✅ `read main.js offset=100 limit=20` → exact target region
- ✅ Re-read a file only if an `edit()` failed due to whitespace mismatch

## Rule 3: Shard main.js's shaders into separate files

This is the **highest-leverage fix**. Shaders are self-contained GLSL — they don't need to live in JS strings.

### Plan:

```
main.js          (glslslSourceQuad  ← import from file)
├── shaders/
│   ├── fsSourceQuad.glsl   (quad/julia)
│   ├── fsSourceBS.glsl     (burning ship)
│   └── fsSourceSin.glsl    (sinusoidal)
```

**JS change:** Replace string literals with `fs.readFileSync` or inline template fetches (since this is a single HTML file app, we'd need a different approach — see below).

**Since this is a single `index.html` + `main.js` app (no bundler):**

Best approach: Use `<script type="x-shader/x-fragment" id="fsQuad">` in `index.html`, then in JS:
```js
const fsQuadSource = document.getElementById('fsQuad').textContent;
```

This lets each shader be edited independently without reading the other two.

**Priority: HIGH** — this single change eliminates ~60% of context bloat.

## Rule 4: Keep specs focused and actionable

**`deep_zoom_spec.md` (15KB) is too long.** It's a research doc, not an execution doc.

Keep it as-is for reference, but create a **short execution checklist**:

### `plans/next_steps.md` (keep under 50 lines)

```markdown
# Next Steps — Execute-Only

## Current Task: Phase 3 - Double-Double Precision

### What to do (in order):
1. Add shader `<script>` tags in index.html for all 3 shaders
2. Update JS to read from `<script>` elements instead of strings
3. Edit fsQuad.glsl: change (zh,zl) → (hh,hl,lh,ll) = 4 floats per coord
4. Edit fsSourceBS.glsl: same change
5. Edit fsSourceSin.glsl: same change + Taylor derivatives for DD
6. Update JS uniform locations (12 new uniforms)
7. Update drawScene() splitFloat → splitDoubleDouble
8. Test in browser

### Key math reference:
- See deep_zoom_spec.md §4 for full DD math derivation
- Each value: x = x_hh + x_hl + x_lh + x_ll (4 float32s sum to true value)
- DD addition requires reassociation; DD mul requires 7 partial products
- Target: ~32 digits → zoom 10⁶⁰

### Performance budget:
- 4× ops/iter → expect 1/4 current FPS at same resolution
- Cap iterations at 2000 for interactive use
- May need to lower resolution to 500×500 for acceptable FPS
```

## Rule 5: Survive compaction — what to always include

After compaction, the summary contains **what changed** but not **exact whitespace**. Always include:

1. **File path + line number** of last edit
2. **What was changed** in one sentence (not the diff)
3. **Next exact edit** needed with line number
4. **Any constants** used (e.g., `AUTO_ITER_CAP = 5000`)

### Example good summary entry:
```
Phase 1 complete. Last edit: main.js line 463 — replaced Math.fround(z) with
splitFloat(z) using power-of-2 hi/lo splitting. 3 shader edits applied to
lines 51, 144, 218 (all low-low cross-terms added). Next: test in browser.
```

### Example bad summary entry:
```
Phase 1 done. Made edits to main.js. Shader math fixed.
```

## Rule 6: Use `poke` strategically

Users can send `poke` to get a status update WITHOUT re-reading files. The agent should respond with:
- Current state (what's done, what's next)
- Exact line numbers for the next step
- No file reads

## Token Budget Calculator

| Action | Approx context cost |
|--------|-------------------|
| `grep "foo" main.js` | 0.1KB |
| `read main.js offset=100 limit=20` | 1KB |
| `read main.js` (full, no offset) | 8KB |
| `edit()` with small match | 0.5KB |
| `edit()` with large oldText (>200 chars) | 1-2KB |
| `read deep_zoom_spec.md` (full) | 15KB |
| Compaction summary | 3-5KB (lost precision) |

**Hard limit: ~30KB total context.** Stay under by keeping reads under 2KB per turn.
