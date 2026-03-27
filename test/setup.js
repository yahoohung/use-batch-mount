import '@testing-library/jest-dom';

const mockRic = (cb) => {
  return setTimeout(() => {
    let callCount = 0;
    cb({
      timeRemaining: () => {
        callCount++;
        return callCount === 1 ? 50 : 0; // Only true for the first check
      }
    });
  }, 1);
};

globalThis.requestIdleCallback = mockRic;
global.requestIdleCallback = mockRic;
if (typeof window !== 'undefined') window.requestIdleCallback = mockRic;

const mockCic = (id) => clearTimeout(id);
globalThis.cancelIdleCallback = mockCic;
global.cancelIdleCallback = mockCic;
if (typeof window !== 'undefined') window.cancelIdleCallback = mockCic;
