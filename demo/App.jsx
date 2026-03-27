import React, { useState, useMemo } from 'react';
import { useBatchMount } from '../src/useBatchMount';

// A mock "heavy" component
const HeavyComponent = ({ id }) => {
  // Simulate some heavy layout/render calculation
  const start = performance.now();
  while (performance.now() - start < 5) {
    // block for 5ms per component to simulate heavy calculation
  }

  return (
    <div className="heavy-card fade-in">
      <div className="card-header">
        <span className="dot"></span>
        <h4>Component #{id}</h4>
      </div>
      <div className="card-body">
        <div className="skeleton-line"></div>
        <div className="skeleton-line short"></div>
      </div>
    </div>
  );
};

// A lightweight skeleton placeholder
const SkeletonComponent = () => (
  <div className="heavy-card skeleton-card fade-in">
    <div className="card-header">
      <div className="skeleton-avatar"></div>
      <div className="skeleton-line title"></div>
    </div>
    <div className="card-body">
      <div className="skeleton-line"></div>
      <div className="skeleton-line short"></div>
    </div>
  </div>
);

export default function App() {
  const [count, setCount] = useState(0);
  const [useBatch, setUseBatch] = useState(true);

  // Generate IDs. useMemo keeps reference stable!
  const ids = useMemo(() => {
    return Array.from({ length: count }, (_, i) => String(i));
  }, [count]);

  const mountedSet = useBatchMount(useBatch ? ids : [], {
    initialBatch: 12,
    batchSize: 2, // Set to 2 so the batching effect is visually obvious
  });

  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-content">
          <div>
            <h1>useBatchMount Demo</h1>
            <p className="subtitle">Render 2,000 heavy components smoothly.</p>
          </div>
          
          <div className="controls glass-panel">
            <div className="control-group">
              <label>Items to Render:</label>
              <div className="btn-group">
                <button onClick={() => setCount(0)}>Clear (0)</button>
                <button onClick={() => setCount(100)}>100</button>
                <button onClick={() => setCount(500)}>500</button>
                <button className="danger" onClick={() => setCount(2000)}>2,000 (Stress Test)</button>
              </div>
            </div>

            <div className="control-group switch-group">
              <label className="switch-label">
                <span>Enable Batch Mounting</span>
                <input 
                  type="checkbox" 
                  checked={useBatch} 
                  onChange={(e) => setUseBatch(e.target.checked)} 
                />
                <span className="slider round"></span>
              </label>
              {!useBatch && <span className="warning-text">⚠️ Warning: Browser may freeze on large numbers!</span>}
            </div>
          </div>
        </div>
      </header>

      <main className="grid-container">
        {ids.length === 0 && (
          <div className="empty-state">
            <div className="icon">🚀</div>
            <h2>Ready for takeoff</h2>
            <p>Select a number above to start rendering.</p>
          </div>
        )}
        
        {ids.map(id => {
          // If batching is OFF, render them all immediately.
          // If batching is ON, consult mountedSet.
          const shouldMount = !useBatch || mountedSet.has(id);
          
          return shouldMount 
            ? <HeavyComponent key={id} id={id} />
            : <SkeletonComponent key={id} />;
        })}
      </main>
    </div>
  );
}
