# useBatchMount

A React custom Hook that batches the mounting of a large number of components, preventing sudden memory spikes that can crash the browser.

---

## Background & Problem

When a dashboard needs to render hundreds to thousands of complex components simultaneously, mounting all components at once leads to:

- Instantaneous memory spikes exceeding 1GB+
- Chrome showing "Kill" / "Wait" popups
- The main thread being completely blocked, making the UI unresponsive

**Root Cause**: The issue isn't simply the large number of components, but that all memory allocation occurs within a single frame. The browser has no chance to run Garbage Collection (GC), causing the memory peak to immediately hit the limit.

`useBatchMount` turns this instantaneous spike into a gradual slope, giving the browser room to breathe.

---

## Design Principles

- **Completely Transparent to Child Components**: Child components are unaware they appear in batches.
- **Minimal Changes Required**: Only requires modifying the top-level `.map()` function.
- **Queued Additions, Instant Removals**: New IDs are added to a queue for step-by-step processing; removed IDs take effect immediately to avoid wasting resources.
- **Browser-Dictated Pacing**: Relies on `requestIdleCallback`. Mounting only happens when the browser is idle, automatically yielding to high-priority tasks like WebSocket pushes.

---

## Installation

```bash
npm install use-batch-mount
```

**Requirements:** React 16.8+ (Supports Hooks)

---

## Basic Usage

```jsx
import { useMemo } from 'react'
import { useBatchMount } from 'use-batch-mount'

function ItemList({ allItems }) {
  // ⚠️ You MUST use 'useMemo' to stabilize the 'ids' reference.
  // Otherwise, every parent re-render will trigger the diff logic to run unnecessarily.
  const itemIds = useMemo(() => allItems.map(p => p.id), [allItems])

  const mountedSet = useBatchMount(itemIds, {
    initialBatch: 5,  // How many components to mount synchronously on first render.
    batchSize: 5,     // How many components to mount per idle tick.
  })

  return (
    <div>
      {itemIds.map(id => (
        mountedSet.has(id)
          ? <ItemPanel key={id} itemId={id} />
          : <ItemSkeleton key={id} />
      ))}
    </div>
  )
}
```

---

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ids` | `string[]` | Required | An array containing all IDs to mount. **Must use `useMemo` to stabilize reference.** |
| `initialBatch` | `number` | `8` | Number of components mounted synchronously during initial render. Best kept around the number visible in the viewport. |
| `batchSize` | `number` | `6` | Number of components mounted every idle tick. A heavier component warrants a smaller batch size. |

## Returns

| Return | Type | Description |
|--------|------|-------------|
| `mountedSet` | `Set<string>` | The set of currently active IDs. Use `.has(id)` to determine render state. |

> ⚠️ The returned value is a mutable `Set`. Do not use strict equality (`===`) reference checks on it.

---

## Behavioral Rules

### Initial Load
The first `initialBatch` items are mounted synchronously. The rest are pushed onto a queue and batch-processed via `requestIdleCallback`. Users instantly see a portion of the real content upon load, with the remainder filled by placeholders/skeletons.

### Adding IDs
Newly added IDs are pushed to the end of the queue. They wait for the next idle tick to process. Useful for: new items appearing mid-session, users clicking "Show All", etc.

### Removing IDs
**Removed instantly**, bypassing the queue. Cleared simultaneously from both the `mountedSet` and the pending queue. Unmounting cleans up component state naturally, saving system resources.

---

## Skeleton Integration Tips

During the batching period, fill empty spots with skeleton components, showing a loading state instead of suddenly displaying components.

```jsx
{itemIds.map(id => (
  mountedSet.has(id)
    ? <ItemPanel key={id} itemId={id} />
    : <ItemSkeleton key={id} />   // Lightweight, can render all at once
))}
```

Because skeleton components are extremely lightweight, they can all render simultaneously without affecting performance.

---

## Tuning Guidelines

There is no universal best setting for `initialBatch` and `batchSize`—it heavily depends on component weight.

**Suggested Tuning Process:**

1. Create a quick Proof of Concept using `requestIdleCallback` to monitor `timeRemaining()` per idle tick.
2. Mount one real component to measure how many milliseconds it demands.
3. Calculate: `timeRemaining() / single component ms` to estimate batch capacity.
4. Test in a real-world environment under WebSocket push pressure. Adjust until "janking" (stuttering) halts.

**Rough Reference (Based on component complexity):**

| Component Complexity | Suggested `batchSize` |
|----------------------|-----------------------|
| Light (Pure display, minimal calculation) | 15–20 |
| Medium (Some sub-components, light calculation) | 8–12 |
| Heavy (Deep sub-components, heavy per-render calculation) | 3–6 |

---

## Known Limitations

### What it Solves
- Browser crashes during initial massive rendering operations.
- Chrome's "Kill / Wait" popups showing on heavy tabs.
- Main thread blocking upon initial render.

### What it Doesn't Solve
- Post-mount **Total Memory Usage** (eventually, memory will be identical to mounting all at once).
- Continual re-rendering pressure triggered by bulk WebSocket payloads arriving every 250ms (requires normalized stores + selectors to mitigate).
- Idle callbacks pausing when switching tabs (mitigated by a 3s `timeout` fallback).

---

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome 47+ | ✅ Native `requestIdleCallback` |
| Firefox 55+ | ✅ Native `requestIdleCallback` |
| Safari | ⚠️ Unofficial Support (Automatically falls back to `setTimeout(fn, 1)`) |
| Edge 79+ | ✅ Native `requestIdleCallback` |

The Safari polyfill simulates behavior via `setTimeout(fn, 1)`. Although the pacing is slower than native, core functionality remains perfectly intact.

---

## Technical Decisions

### Why `requestIdleCallback` vs React Scheduler
React's official `scheduler` package ties tightly into the React render cycle, which is a good built-in approach. However, requiring `scheduler` implies strict version locking, and as an internal React package, its API stability is unconfirmed for direct general use. `requestIdleCallback` is a native browser API, carries zero dependencies, offers predictable behavior, and is sufficient for this scope.

### Why not use `useState` for `mountedSet`?
Calling `setState` requires generating a brand new reference each time to trigger a re-render. Given hundreds of IDs, this demands memory re-allocations (e.g. `new Set([...prev, ...batch])`) on every single tick, straining the GC. Modifying a mutable ref and "bumping" a dummy counter triggers normal React re-renders while updating the Set in-place perfectly.

### Why are ID Removals not queued?
Removal operations are usually triggered by direct user action or vital business logic representing high-priority events. Furthermore, tearing down DOM nodes is much faster than building them, completely bypassing the need to throttle the action.

---

## Diff Algorithm Complexity

| Operation | Complexity | Description |
|-----------|------------|-------------|
| Initialization | O(n) | Iterates over `ids` once |
| Addition | O(m) | m = number of new IDs |
| Removal | O(n) | Build `removedSet` then filter queue |
| Every idle tick | O(batchSize) | Fixed small batch size |

---

## Common Mistakes

**❌ Not using `useMemo` to stabilize `ids`**
```jsx
// WRONG: A new array is formed every render, causing the effect to loop constantly.
const mountedSet = useBatchMount(items.map(p => p.id))

// ✅ CORRECT
const ids = useMemo(() => items.map(p => p.id), [items])
const mountedSet = useBatchMount(ids)
```

**❌ Using reference comparison on the returned `Set`**
```jsx
// WRONG: 'mountedSet' is a mutable ref, its reference NEVER changes.
if (mountedSet === prevSet) return

// ✅ CORRECT: Verify state relying on .has() or .size.
mountedSet.has(id)
```

**❌ Calling `useBatchMount` per child component individually**
```jsx
// WRONG: Each child sparks an individual hook instance, their scheduling will collide.
function ItemPanel({ itemId }) {
  const selIds = useMemo(...)
  const mountedSet = useBatchMount(selIds)  // ❌
}
```

If internal batching is necessary within lists or nested groups, dictate it from the parent container directly. Alternatively, if components must drive this themselves, realize their scheduling queues won't synchronize natively.

---

## Changelog

| Version | Changes |
|---------|---------|
| v1.1 | Fixed removal operation processing from O(n×m) to O(n); Applied config refs to halt stale closures. |
| v1.0 | Initial release: Support for `initialBatch` + idle callbacks for batch loading + Safari polyfill. |

