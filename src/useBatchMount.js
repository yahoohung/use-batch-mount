import { useState, useEffect, useRef } from 'react'

// ─── Safari / old browser polyfill ────────────────────────────────────────
// In environments without requestIdleCallback (like Safari or Jest), 
// we fall back to setTimeout.
const rIC = typeof requestIdleCallback !== 'undefined'
    ? requestIdleCallback
    : typeof window !== 'undefined' && window.requestIdleCallback
        ? window.requestIdleCallback
        : (cb) => setTimeout(() => {
            const start = Date.now();
            let checked = false;
            cb({ 
              timeRemaining: () => {
                // If Date.now() doesn't advance (e.g. fake timers), 
                // return 0 on the second check to prevent infinite sync loops.
                if (checked) return 0;
                checked = true;
                return Math.max(0, 50 - (Date.now() - start));
              } 
            });
          }, 1)

const cIC = typeof cancelIdleCallback !== 'undefined'
    ? cancelIdleCallback
    : typeof window !== 'undefined' && window.cancelIdleCallback
        ? window.cancelIdleCallback
        : clearTimeout

// ─── useBatchMount ─────────────────────────────────────────────────────────
//
// Mounts a large number of components in batches to prevent memory spikes
// and main thread blocking in the browser.
//
// Parameters
//   ids          : string[]  - An array of all IDs to be mounted.
//   initialBatch : number    - How many components to mount synchronously on the first render (recommend matching viewport capacity).
//   batchSize    : number    - How many components to mount per idle tick (smaller for heavier components).
//
// Returns
//   Set<string>  - The set of IDs that should currently be rendered.
//
// Usage
//   const mountedSet = useBatchMount(itemIds, { initialBatch: 5, batchSize: 5 })
//   ...
//   {itemIds.map(id => mountedSet.has(id)
//     ? <RealComponent key={id} id={id} />
//     : <SkeletonComponent key={id} />
//   )}
//
// Rules
//   Add ID -> Queued and processed in batches via idle callbacks.
//   Remove ID -> Immediately removed from both mountedSet and queue (no queuing).
//   Child components are completely transparent and unaware of the batching.
// ──────────────────────────────────────────────────────────────────────────

export function useBatchMount(ids, { initialBatch = 8, batchSize = 6 } = {}) {
    // Keep all internal states in a ref to avoid unnecessary re-renders.
    const s = useRef({
        mounted: new Set(),   // IDs currently mounted
        queue: [],            // IDs waiting to be mounted (ordered)
        icId: null,           // Current requestIdleCallback handle
        prevSet: new Set(),   // Previous IDs Set for diffing
        ready: false,         // Whether initialization has occurred
    })

    // Synchronize initialBatch / batchSize into a ref.
    // Reason: The useEffect dependency is 'ids', not these parameters.
    // If read directly inside the closure, it would constantly hold the stale 
    // values from the first render. Using a ref ensures rIC callbacks get the latest config.
    const configRef = useRef({ initialBatch, batchSize })
    useEffect(() => {
        configRef.current = { initialBatch, batchSize }
    })

    // Use a counter state to trigger re-renders instead of setting mountedSet directly.
    // Reason: mountedSet is a mutable ref. Providing a new Set object upon each update
    // would unnecessarily re-render all places utilizing this hook.
    const [, bump] = useState(0)
    const rerender = () => bump(n => n + 1)

    // The flush function is kept in a ref, ensuring rIC callbacks 
    // always fetch the latest version and avoid stale closures.
    const flushRef = useRef(null)
    flushRef.current = () => {
        const state = s.current

        // If the queue is empty or a callback is already scheduled, don't schedule another.
        if (!state.queue.length || state.icId) return

        state.icId = rIC((deadline) => {
            state.icId = null
            let changed = false

            // Always retrieve the latest batchSize per tick, avoiding stale closures.
            const { batchSize: bs } = configRef.current

            // Mount as many as possible within the deadline, 'batchSize' elements at a time.
            while (state.queue.length && deadline.timeRemaining() > 4) {
                state.queue
                    .splice(0, bs)
                    .forEach(id => { state.mounted.add(id); changed = true })
            }

            if (changed) rerender()

            // If elements remain, schedule the next idle callback.
            if (state.queue.length) flushRef.current()

        }, { timeout: 3000 }) // 3s hard deadline to force execution even if the browser is busy.
    }

    // ── Main Logic: Diffing when 'ids' changes ────────────────────────────────
    useEffect(() => {
        const state = s.current

        // Retrieve initialBatch from configRef, bypassing stale closures.
        const { initialBatch: ib } = configRef.current

        const nextSet = new Set(ids)

        if (!state.ready) {
            // Initialization: Mount the first 'initialBatch' immediately, queue the rest.
            state.ready = true
            ids.slice(0, ib).forEach(id => state.mounted.add(id))
            state.queue = ids.slice(ib)
            state.prevSet = nextSet
            rerender()
            flushRef.current()
            return
        }

        // Calculate diffs
        const removed = [...state.prevSet].filter(id => !nextSet.has(id))
        const added = ids.filter(id => !state.prevSet.has(id))
        let changed = false

        if (removed.length) {
            // Removal: Remove immediately, do not wait in queue.
            // Clear from both mountedSet and queue to prevent useless mount->unmount work.

            // Convert 'removed' array to a Set for O(n) filtering rather than O(n*m).
            const removedSet = new Set(removed)
            removed.forEach(id => state.mounted.delete(id))
            state.queue = state.queue.filter(id => !removedSet.has(id))
            changed = true
        }

        if (added.length) {
            // Addition: Push to queue, wait for idle callbacks to mount in batches.
            state.queue.push(...added)
            flushRef.current()
        }

        state.prevSet = nextSet
        if (changed) rerender()

    }, [ids]) 
    // ⚠️ Warning: The 'ids' array reference passed in must be stable (e.g., via useMemo).
    // Otherwise, every parent re-render will trigger this effect, causing empty diffing.

    // ── Cleanup ─────────────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            if (s.current.icId) cIC(s.current.icId)
        }
    }, [])

    return s.current.mounted
}
