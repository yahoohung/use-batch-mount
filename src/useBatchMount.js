import { useState, useEffect, useRef } from 'react'

// ══════════════════════════════════════════════════════════════════════════
//  POLYFILL  —  requestIdleCallback
//
//  Safari does not support requestIdleCallback. The fallback fires after
//  1 ms and simulates a 50 ms deadline — the same upper bound the real
//  API uses. One limitation: the fallback reads Date.now() once at entry,
//  so every call to timeRemaining() within the same tick returns the same
//  value. Throughput per tick may be lower on Safari, but behaviour is
//  otherwise correct.
// ══════════════════════════════════════════════════════════════════════════

const rIC =
    typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback
        : (cb) =>
            setTimeout(() => {
                const start = Date.now()
                cb({
                    didTimeout: false,
                    timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
                })
            }, 1)

// ══════════════════════════════════════════════════════════════════════════
//  SCHEDULER  —  module-private singleton
//
//  All useBatchMount instances share one queue and one rIC handle.
//  This way every instance works within the same idle budget instead of
//  each scheduling its own callback and fighting over the same tick.
//
//  Queue entry: { id: string, onMount: (id) => void, notify: () => void }
//
//    onMount  — called once per ID inside the idle callback.
//               Must be fast. Must not trigger a re-render directly.
//    notify   — called once per tick after all IDs in that tick are done.
//               Triggers a re-render for the owning hook instance.
//               Stored in a Set so each instance re-renders at most once
//               per tick, regardless of how many IDs were mounted.
//
//  Adaptive idle threshold
//    For the first 20 ticks the threshold is fixed at WARMUP_MS.
//    After that it becomes: average(post-mount timeRemaining) × IDLE_RATIO.
//    The sample is taken after mounting, not before. This matters because
//    React's commit work (useSelector, derived state) runs after mount and
//    eats into the remaining idle time. Sampling post-mount captures that
//    cost. IDLE_RATIO of 0.6 keeps 40 % as headroom for it.
//    Pass minIdleMs > 0 to lock the threshold to a fixed value instead.
//
//  ID uniqueness
//    IDs are shared across all instances. Each ID must belong to exactly
//    one { onMount, notify } pair. Use a namespace prefix to avoid
//    collisions, e.g. "zone:HDC-L0" or "sector:123-0-1".
//
//  Cross-root limitation
//    This scheduler is a module singleton. If the page has more than one
//    React root (multiple ReactDOM.createRoot calls), all roots share the
//    same queue and idle budget. Mounting in one root consumes time that
//    would otherwise be available to another. There is no per-root priority.
// ══════════════════════════════════════════════════════════════════════════

/** Idle threshold used during the warmup period (ms). */
const WARMUP_MS = 4

/**
 * The adaptive threshold is set to this fraction of the average post-mount
 * idle time. 0.6 keeps 40 % as headroom for React commit work that runs
 * after mount but outside this idle callback.
 */
const IDLE_RATIO = 0.6

/**
 * How far the head pointer can advance before the queue array is compacted.
 * Compaction rewrites the array once and then resets the pointer to zero.
 * This is O(n) but only happens every COMPACT_AT mounts, so the average
 * cost per mount stays low.
 */
const COMPACT_AT = 200

/**
 * How long the browser may wait before it force-runs an idle callback (ms).
 * Set to 10 s because the initial page load of a heavy dashboard can stay
 * busy well beyond 3 s (WebSocket handshake, Redux hydration, first renders).
 * Forcing a mount during that window causes jank, so we want to wait it out.
 */
const FORCE_TIMEOUT_MS = 10000

// ── Queue ──────────────────────────────────────────────────────────────────
// A head pointer advances O(1) per dequeue instead of shift() which is O(n).
// The array is compacted when the pointer exceeds COMPACT_AT.

/** @type {Array<{id: string, onMount: function, notify: function}>} */
const _q = []
let _head = 0   // index of the next entry to process

/**
 * Fast lookup to skip duplicate enqueues. Kept in sync with _q at all times.
 * Stores a boolean sentinel (true) — only .has() and .delete() are ever used.
 * The value is never read back.
 */
const _cbMap = new Map() // id → true

/** Set to the rIC return value while a callback is pending; null otherwise. */
let _icId = null

/**
 * True after a forced tick has been deferred once. Allows the next forced
 * tick to proceed so the queue cannot stall forever (starvation guard).
 * Reset to false on any genuine idle tick.
 */
let _deferredOnce = false

// ── Adaptive threshold ─────────────────────────────────────────────────────
// A fixed-size circular buffer keeps inserts at O(1).
// A running sum keeps the average at O(1) — no reduce() needed.

const _samples = new Array(20).fill(0)
let _sIdx = 0          // next write position in the circular buffer
let _sCnt = 0          // total samples written, capped at 20
let _sSum = 0          // sum of all values currently in the buffer
let _adapted = WARMUP_MS  // threshold currently in use
let _fixed = 0          // when > 0, this value is used instead of _adapted

/**
 * Records the post-mount idle time for one tick and recalculates the
 * adaptive threshold once the buffer is full.
 * Does nothing when a fixed override is active.
 * @param {number} ms - timeRemaining() read after all mounts for this tick.
 */
function _recordSample(ms) {
    if (_fixed > 0) return
    _sSum -= _samples[_sIdx]   // remove the value about to be overwritten
    _samples[_sIdx] = ms
    _sSum += ms
    _sIdx = (_sIdx + 1) % 20
    if (_sCnt < 20) _sCnt++
    if (_sCnt >= 20) {
        _adapted = Math.max(WARMUP_MS, (_sSum / 20) * IDLE_RATIO)
    }
}

/**
 * Returns the idle threshold currently in use (ms).
 * Returns the fixed override when set; otherwise returns the adaptive value.
 * @returns {number}
 */
function _threshold() {
    return _fixed > 0 ? _fixed : _adapted
}

/**
 * Locks the threshold to a fixed value. Called from the diff effect each
 * time `ids` changes when the caller passes minIdleMs > 0. The call is
 * idempotent when the value has not changed. Keeping this function separate
 * from _enqueue ensures no instance accidentally mutates the global
 * threshold as a side-effect of enqueueing.
 * @param {number} ms
 */
function _setMinIdleMs(ms) {
    if (ms > 0) _fixed = ms
}

// ── Core flush loop ────────────────────────────────────────────────────────

/**
 * Schedules an idle callback that mounts as many queued IDs as the idle
 * budget allows, then schedules itself again if the queue is not empty.
 * _icId prevents a second callback from being scheduled while one is already
 * waiting or running.
 */
function _flush() {
    if (_head >= _q.length || _icId) return

    _icId = rIC((deadline) => {
        _icId = null

        // deadline.didTimeout is the correct way to detect a forced tick.
        // It is true only when the browser ran this callback because FORCE_TIMEOUT_MS
        // elapsed with no idle time — not simply because timeRemaining() happens to
        // be low. Mounting during a forced tick inserts work into a busy frame,
        // which is the jank we are trying to avoid.
        //
        // On the first forced tick: defer once and reschedule. This gives the
        // browser one more FORCE_TIMEOUT_MS window to become idle.
        // On the second consecutive forced tick: accept the disruption and mount
        // one item (via forceOnce below). This is the starvation guard — without
        // it the queue could stall forever on a page that is never idle.
        // On any genuine idle tick: clear _deferredOnce and mount normally.
        if (deadline.didTimeout) {
            if (!_deferredOnce) {
                _deferredOnce = true
                if (_head < _q.length) _flush()
                return
            }
            // Second consecutive forced tick — fall through and accept one mount.
            _deferredOnce = false
        } else {
            _deferredOnce = false  // genuine idle tick — reset the defer flag
        }

        const threshold = _threshold()
        let forceOnce = true       // mount at least one ID even if time is short
        const notifySet = new Set()  // one notify fn per instance for this tick

        while (_head < _q.length && (deadline.timeRemaining() > threshold || forceOnce)) {
            forceOnce = false
            const { id, onMount, notify } = _q[_head++]
            _cbMap.delete(id)

            // onMount is always a function when enqueued, but this guard defends
            // against any future misuse of _enqueue with a non-function value.
            // The alive flag inside onMountRef is the primary guard against stale
            // execution after unmount; this check is a secondary safety net.
            if (typeof onMount === 'function') {
                try {
                    onMount(id)
                    if (typeof notify === 'function') notifySet.add(notify)
                } catch (e) {
                    console.error('[useBatchMount] onMount error, id:', id, e)
                }
            }
        }

        // Only sample genuine idle ticks. A forced tick reports timeRemaining() = 0,
        // which does not reflect real idle capacity. Recording it would unfairly
        // depress the adaptive threshold. Genuine idle ticks will restore it.
        if (!deadline.didTimeout) {
            _recordSample(deadline.timeRemaining())
        }

        // Fire each instance's notify once. This triggers one re-render per
        // instance per tick regardless of how many IDs were mounted this tick.
        notifySet.forEach(fn => {
            try { fn() } catch (e) {
                console.error('[useBatchMount] notify error', e)
            }
        })

        // Compact the array. This is O(n) but only runs every COMPACT_AT mounts.
        if (_head > COMPACT_AT) {
            _q.splice(0, _head)
            _head = 0
        }

        if (_head < _q.length) _flush()

    }, { timeout: FORCE_TIMEOUT_MS })
}

/**
 * Adds IDs to the global queue and triggers a flush.
 * IDs already in the queue are skipped silently.
 * @param {string[]} ids
 * @param {(id: string) => void} onMount
 * @param {() => void} notify
 */
function _enqueue(ids, onMount, notify) {
    for (const id of ids) {
        if (_cbMap.has(id)) continue
        _cbMap.set(id, true)             // sentinel — only .has() and .delete() are ever called
        _q.push({ id, onMount, notify })
    }
    _flush()
}

/**
 * Removes IDs from both the lookup map and the queue in one O(n) pass,
 * then resumes flushing if entries remain.
 *
 * The pass starts from _head, so already-processed entries are discarded
 * for free. _head is reset to 0 after the rewrite.
 *
 * Without the _flush() call at the end, a pure removal with no subsequent
 * enqueue would leave remaining entries stuck until the next enqueue.
 * @param {string[]} ids
 */
function _dequeue(ids) {
    if (!ids.length) return
    const removeSet = new Set(ids)

    for (const id of ids) _cbMap.delete(id)

    let w = 0
    for (let r = _head; r < _q.length; r++) {
        if (!removeSet.has(_q[r].id)) _q[w++] = _q[r]
    }
    _q.length = w
    _head = 0

    // If the queue is now empty, clear _deferredOnce. Without this, a forced
    // tick that set _deferredOnce = true before the queue drained would leave
    // the flag stale. The next batch of IDs enqueued would then skip their
    // first defer and go straight to the starvation guard on a forced tick,
    // causing an unnecessary mount in a busy frame.
    if (w === 0) _deferredOnce = false

    if (_head < _q.length && !_icId) _flush()
}

// ══════════════════════════════════════════════════════════════════════════
//  DEBUG API
//
//  For development and testing only. Do not import in production code.
//
//  HMR note: all adaptive-threshold state (sample buffer, adapted threshold,
//  sample count) resets on every Hot Module Replacement reload because the
//  module re-executes from scratch. After each code change, wait for
//  20 genuine idle ticks before reading adaptedThreshold.
// ══════════════════════════════════════════════════════════════════════════

/**
 * @typedef  {object} BatchMountDebugSnapshot
 * @property {number}  pending           - IDs in the queue not yet mounted.
 * @property {number}  adaptedThreshold  - Adaptive idle threshold in use (ms).
 * @property {number}  fixedMinIdleMs    - Fixed override; 0 means adaptive is active.
 * @property {number}  samplesCollected  - Post-mount idle samples recorded so far (max 20).
 * @property {number}  runningSumMs      - Sum of all values in the sample buffer (ms).
 * @property {boolean} deferredOnce      - True if the last forced tick was deferred; next forced tick will mount.
 */

export const batchMountDebug = {
    /**
     * Returns a snapshot of the current scheduler state.
     * Use this to tune initialBatch and minIdleMs during development.
     * @returns {BatchMountDebugSnapshot}
     */
    inspect() {
        return {
            pending: _q.length - _head,
            adaptedThreshold: +_adapted.toFixed(2),
            fixedMinIdleMs: _fixed,
            samplesCollected: _sCnt,
            runningSumMs: +_sSum.toFixed(2),
            deferredOnce: _deferredOnce,
        }
    },

    /**
     * Resets all adaptive-threshold state back to its starting values.
     * Use this in unit tests to get a clean scheduler between test cases.
     */
    resetAdaptive() {
        _samples.fill(0)
        _sIdx = 0
        _sCnt = 0
        _sSum = 0
        _adapted = WARMUP_MS
        _fixed = 0
        _deferredOnce = false
    },
}

// ══════════════════════════════════════════════════════════════════════════
//  useBatchMount
// ══════════════════════════════════════════════════════════════════════════

/**
 * Mounts a large list of components in idle-time batches to avoid RAM
 * spikes and main-thread blocking on initial render. All hook instances
 * share the module-level scheduler above.
 *
 * Returns an object with two fields:
 *   - mountedSet  — the set of IDs currently allowed to render their real
 *                   component. IDs not yet in the set should render a
 *                   lightweight skeleton. Child components have no knowledge
 *                   of this mechanism.
 *   - isComplete  — true once every ID in the list has been mounted.
 *                   Use this to show a loading indicator or unblock actions
 *                   that require all content to be present.
 *
 * **Add** — new IDs are queued and mounted the next time the browser is idle.
 * **Remove** — removed IDs are unmounted immediately without queuing.
 *
 * ⚠️  Do not use mountedSet in a dependency array. Its object reference
 *     never changes — mutations happen in place and are invisible to React's
 *     dependency comparison. Use mountedSet directly inside the render
 *     function, where bump()-triggered re-renders will pick up the changes.
 *
 * ⚠️  On a fast machine with long idle windows, many IDs can mount in a
 *     single tick, causing a visible "pop-in" wave. If this is noticeable,
 *     raise minIdleMs to reduce the number of IDs mounted per tick.
 *
 * @param {string[]} ids
 *   The full list of IDs to mount. Must be referentially stable — wrap with
 *   useMemo in the parent. Must be globally unique across all hook instances.
 *   Use a namespace prefix such as "zone:HDC-L0" or "sector:123-0-1".
 *
 * @param {object}  [options]
 * @param {number}  [options.initialBatch=8]
 *   How many IDs to mount synchronously on the first render so the user
 *   sees content straight away. Set this to roughly how many items fit in
 *   the initial viewport.
 * @param {number}  [options.minIdleMs=0]
 *   Locks the idle threshold to this value (ms) and disables adaptation.
 *   Raise this if heavy selectors or derived state cause jank after mount,
 *   or to limit the number of IDs mounted per tick on fast machines.
 *   0 leaves the adaptive algorithm in control.
 *
 * @returns {{ mountedSet: ReadonlySet<string>, isComplete: boolean }}
 *
 * @example
 * const zoneIds = useMemo(() => zones.map(z => `zone:${z.id}`), [zones])
 * const { mountedSet, isComplete } = useBatchMount(zoneIds, { initialBatch: 5 })
 *
 * return (
 *   <>
 *     {!isComplete && <LoadingBar />}
 *     {zoneIds.map(id =>
 *       mountedSet.has(id)
 *         ? <MarketZone key={id} id={id} />
 *         : <MarketZoneSkeleton key={id} />
 *     )}
 *   </>
 * )
 */
export function useBatchMount(ids, {
    initialBatch = 8,
    minIdleMs = 0,
} = {}) {

    // ── Config ref ──────────────────────────────────────────────────────────
    // Updated synchronously during render — not inside an effect — so that
    // callbacks and effects always read the latest values without needing to
    // list them as effect dependencies. Properties are assigned individually
    // to avoid allocating a new object on every render.
    const configRef = useRef({ initialBatch, minIdleMs })
    configRef.current.initialBatch = initialBatch
    configRef.current.minIdleMs = minIdleMs

    // ── Instance state ──────────────────────────────────────────────────────
    // Stored in a ref so that mutations do not trigger renders on their own.
    // Re-renders are scheduled explicitly through bump() when needed.
    const instanceRef = useRef({
        mounted: new Set(),  // IDs currently allowed to render
        prevSet: new Set(),  // full ID list from the last effect run, used to diff
        ready: false,      // true after the first effect run
        alive: true,       // set to false on unmount to block stale callbacks
    })

    // The lightest way to force a re-render. React guarantees this dispatch
    // function never changes, so no useCallback wrapper is needed.
    const [, bump] = useState(0)

    // ── Scheduler callbacks ─────────────────────────────────────────────────
    // The scheduler is long-lived and holds references to these functions.
    // To avoid stale closures, each function is split into two parts:
    //   - stableXxx  never changes — safe to pass to the scheduler once.
    //   - xxxRef.current  is overwritten each render with the latest closure.
    // The stable function simply forwards its call into the ref.

    const onMountRef = useRef(null)
    onMountRef.current = (id) => {
        if (!instanceRef.current.alive) return  // hook unmounted between enqueue and execution
        instanceRef.current.mounted.add(id)
        // No bump() here — notify() fires once after all IDs in this tick are
        // added, which batches the re-render to one per tick per instance.
    }

    const notifyRef = useRef(null)
    notifyRef.current = () => {
        if (!instanceRef.current.alive) return
        bump(n => n + 1)
    }

    const stableOnMount = useRef((id) => onMountRef.current(id))
    const stableNotify = useRef(() => notifyRef.current())

    // ── Main diff effect ────────────────────────────────────────────────────
    // Runs when `ids` changes. The first run seeds the mounted set and queues
    // the rest. Later runs diff the new list against prevSet.
    //
    // ⚠️  Wrap ids in useMemo in the parent. A new array reference on every
    //     parent render triggers this effect repeatedly, causing empty diffs
    //     and unnecessary scheduler calls.
    useEffect(() => {
        const state = instanceRef.current
        const { initialBatch: ib, minIdleMs: ms } = configRef.current
        const nextSet = new Set(ids)

        // Restore the alive flag. The cleanup effect sets it to false on both
        // real unmount and React 18 StrictMode's intentional cleanup pass.
        // When StrictMode remounts this effect, alive must be true so scheduler
        // callbacks can run again. This is safe to always set here because this
        // effect body only runs on mount or when ids changes — never during a
        // real unmount, which only triggers the cleanup function.
        state.alive = true

        // Set the fixed threshold here (in an effect), not during render, to
        // keep the render phase free of module-level side-effects.
        if (ms > 0) _setMinIdleMs(ms)

        if (!state.ready) {
            // First run: mount the first ib IDs synchronously so the user sees
            // content on the initial paint, then queue the rest for idle time.
            state.ready = true
            ids.slice(0, ib).forEach(id => state.mounted.add(id))
            const deferred = ids.slice(ib)
            if (deferred.length) {
                _enqueue(deferred, stableOnMount.current, stableNotify.current)
            }
            state.prevSet = nextSet
            bump(n => n + 1)
            return
        }

        // Re-enqueue IDs that were pending but removed during a StrictMode cleanup.
        // state.prevSet holds every ID from the last run; state.mounted holds only
        // those already processed. The difference is what was lost. During normal
        // operation this filter always produces an empty array.
        const requeue = [...state.prevSet].filter(id => !state.mounted.has(id))
        if (requeue.length) {
            _enqueue(requeue, stableOnMount.current, stableNotify.current)
        }

        // Incremental diff. Both passes are O(n) and use Set.has() for O(1)
        // lookups, so the total cost is O(n + m).
        const removed = [...state.prevSet].filter(id => !nextSet.has(id))
        const added = ids.filter(id => !state.prevSet.has(id))
        let changed = false

        if (removed.length) {
            // Removals are immediate: delete from the mounted set and purge any
            // pending queue entries in one pass inside _dequeue.
            removed.forEach(id => state.mounted.delete(id))
            _dequeue(removed)
            changed = true
        }

        if (added.length) {
            _enqueue(added, stableOnMount.current, stableNotify.current)
        }

        state.prevSet = nextSet
        if (changed) bump(n => n + 1)

    }, [ids])

    // ── Cleanup on unmount ──────────────────────────────────────────────────
    useEffect(() => {
        // Capture the state ref here at setup time, not inside the returned
        // function. Under React 18 StrictMode an effect is mounted, torn down,
        // then remounted; capturing here means the cleanup always refers to the
        // same object regardless of when it runs.
        const state = instanceRef.current
        return () => {
            state.alive = false
            // Only dequeue IDs that are still waiting in the scheduler. IDs
            // already in state.mounted have been processed and are not queued.
            const pending = [...state.prevSet].filter(id => !state.mounted.has(id))
            if (pending.length) _dequeue(pending)
        }
    }, [])

    // isComplete is true once every ID in the current list has been mounted.
    // It becomes false again immediately if new IDs are added (diff path enqueues
    // them) and returns to true once those IDs finish mounting.
    const { mounted, prevSet, ready } = instanceRef.current
    const isComplete = ready && mounted.size >= prevSet.size

    return { mountedSet: mounted, isComplete }
}