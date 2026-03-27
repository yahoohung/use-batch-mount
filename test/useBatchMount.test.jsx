import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useBatchMount } from '../src/useBatchMount';

describe('useBatchMount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Advance exactly one pending timer, preventing cascaded rIC calls from executing in the same tick.
  const runIdleCallbacks = () => {
    vi.advanceTimersToNextTimer(); 
  };

  it('mounts exactly initialBatch immediately', () => {
    const ids = ['1', '2', '3', '4', '5'];
    const { result } = renderHook(() => 
      useBatchMount(ids, { initialBatch: 2, batchSize: 2 })
    );

    expect(result.current.size).toBe(2);
    expect(result.current.has('1')).toBe(true);
    expect(result.current.has('2')).toBe(true);
    expect(result.current.has('3')).toBe(false);
  });

  it('mounts in batches during idle callbacks', () => {
    const ids = ['1', '2', '3', '4', '5'];
    const { result } = renderHook(() => 
      useBatchMount(ids, { initialBatch: 2, batchSize: 2 })
    );

    expect(result.current.size).toBe(2);

    // Run first idle callback
    act(() => {
      runIdleCallbacks();
    });

    // Should have added 2 more (batchSize = 2)
    expect(result.current.size).toBe(4);
    expect(result.current.has('3')).toBe(true);
    expect(result.current.has('4')).toBe(true);

    // Run next idle callback
    act(() => {
      runIdleCallbacks();
    });

    // Should have added the last 1
    expect(result.current.size).toBe(5);
    expect(result.current.has('5')).toBe(true);
  });

  it('removes IDs immediately, avoiding queue processing', () => {
    let ids = ['1', '2', '3', '4', '5'];
    const { result, rerender } = renderHook(
      (props) => useBatchMount(props.ids, { initialBatch: 2, batchSize: 2 }),
      { initialProps: { ids } }
    );

    expect(result.current.size).toBe(2);

    // Now remove '1' and '3' (3 is in the queue, 1 is mounted)
    ids = ['2', '4', '5'];
    rerender({ ids });

    expect(result.current.has('1')).toBe(false);
    expect(result.current.has('3')).toBe(false);
    expect(result.current.size).toBe(1); // '2' is mounted, '1' was removed instantly

    // Trigger idle to process queue
    act(() => {
      runIdleCallbacks();
    });

    // We removed 3 from the queue, so it should process 4 and 5 next
    expect(result.current.size).toBe(3);
    expect(result.current.has('4')).toBe(true);
    expect(result.current.has('5')).toBe(true);
    expect(result.current.has('3')).toBe(false);
  });

  it('adds newly pushed IDs to the queue seamlessly', () => {
    let ids = ['1', '2'];
    const { result, rerender } = renderHook(
      (props) => useBatchMount(props.ids, { initialBatch: 2, batchSize: 2 }),
      { initialProps: { ids } }
    );

    // Both are mounted due to initialBatch
    expect(result.current.size).toBe(2);

    // Add more
    ids = ['1', '2', '3', '4'];
    rerender({ ids });

    // Instantly after render, size should still be 2 (queue needs idle ticks to process)
    expect(result.current.size).toBe(2);
    expect(result.current.has('3')).toBe(false);

    act(() => {
      runIdleCallbacks();
    });

    // Next batch processes 3 and 4
    expect(result.current.size).toBe(4);
    expect(result.current.has('3')).toBe(true);
    expect(result.current.has('4')).toBe(true);
  });
});
