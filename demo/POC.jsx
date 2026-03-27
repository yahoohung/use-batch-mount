import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useBatchMount } from '../src/useBatchMount';
import './poc.css';

// --- PERFORMANCE TRACKING ---
const PerformanceMonitor = {
  marks: {},
  measurements: {},

  start(label) {
    this.marks[label] = {
      time: performance.now(),
      memory: performance.memory?.usedJSHeapSize || 0,
    };
  },

  end(label) {
    if (!this.marks[label]) return null;
    const end = performance.now();
    const duration = end - this.marks[label].time;
    const memoryDelta = (performance.memory?.usedJSHeapSize || 0) - this.marks[label].memory;
    this.measurements[label] = { duration, memoryDelta, timestamp: end };
    return { duration, memoryDelta };
  },

  get(label) {
    return this.measurements[label];
  },

  reset() {
    this.marks = {};
    this.measurements = {};
  },
};

// --- MOCK DATA GENERATOR ---
const generateData = () => {
  return Array.from({ length: 40 }, (_, rIdx) => ({
    id: `region-${rIdx + 1}`,
    name: `Region ${rIdx + 1}`,
    zones: Array.from({ length: 20 }, (_, zIdx) => ({
      id: `region-${rIdx + 1}-zone-${zIdx + 1}`,
      name: `Zone ${zIdx + 1}`,
      servers: Array.from({ length: 2 }, (_, sIdx) => ({
        id: `region-${rIdx + 1}-zone-${zIdx + 1}-server-${sIdx + 1}`,
        name: `Server ${sIdx + 1}`,
        ping: (Math.random() * 100).toFixed(0) + 'ms',
      }))
    }))
  }));
};

// --- HIERARCHY COMPONENTS ---
const ServerNode = ({ server, stressLoad }) => {
  // Simulate render weight per server. stressLoad mode is used for forced hang proof.
  const duration = stressLoad ? 7.5 : 0.2; // 7.5ms per server in stress mode => 1,600 servers = ~12s in all-at-once
  const start = performance.now();
  while (performance.now() - start < duration) {}
  return (
    <div className="server-node">
      <span className="server-name">{server.name}</span>
      <span className="server-ping">{server.ping}</span>
      {stressLoad && <small style={{ marginLeft: '6px', color: '#f85149' }}>STRESS</small>}
    </div>
  );
};

const ZoneNode = ({ zone }) => {
  return (
    <div className="zone-node">
      <div className="zone-header">{zone.name}</div>
      <div className="servers-container">
        {zone.servers.map(server => <ServerNode key={server.id} server={server} />)}
      </div>
    </div>
  );
};

const RegionNode = ({ region }) => {
  return (
    <div className="region-node fade-in">
      <div className="region-header">
        <span className="indicator"></span>
        <h3>{region.name}</h3>
      </div>
      <div className="zones-container">
        {region.zones.map(zone => <ZoneNode key={zone.id} zone={zone} />)}
      </div>
    </div>
  );
};

const RegionSkeleton = () => (
  <div className="region-node skeleton fade-in">
    <div className="region-header">
      <div className="pulse-circle"></div>
      <div className="pulse-line" style={{ width: '120px' }}></div>
    </div>
    <div className="zones-container">
      <div className="pulse-line" style={{ height: '40px' }}></div>
      <div className="pulse-line" style={{ height: '40px' }}></div>
    </div>
  </div>
);

// --- PANEL COMPONENT ---
// Demonstrates the key difference between batched and non-batched rendering.
const DataPanel = ({ title, regions, align, useBatch, stressLoad, performanceMetrics }) => {
  const regionIds = useMemo(() => regions.map(r => r.id), [regions]);
  const startTimeRef = useRef(null);
  const [renderStats, setRenderStats] = useState({ initialTime: 0, totalMounted: 0 });

  // BATCH MODE: Use useBatchMount
  const mountedSet = useBatchMount(useBatch ? regionIds : [], {
    initialBatch: 2,
    batchSize: 2,
  });

  // Track when all components are mounted
  useEffect(() => {
    if (useBatch) {
      if (startTimeRef.current === null) {
        startTimeRef.current = performance.now();
        PerformanceMonitor.start(`panel-${align}-batch`);
      }
      setRenderStats(prev => ({
        initialTime: performance.now() - startTimeRef.current,
        totalMounted: mountedSet.size,
      }));

      if (mountedSet.size === regions.length) {
        const measurement = PerformanceMonitor.end(`panel-${align}-batch`);
        if (measurement && performanceMetrics) {
          performanceMetrics.current[`${align}-batch`] = measurement;
        }
      }
    } else {
      // NON-BATCH MODE: Record immediate mount time
      if (startTimeRef.current === null) {
        PerformanceMonitor.start(`panel-${align}-all-at-once`);
        startTimeRef.current = performance.now();
        PerformanceMonitor.end(`panel-${align}-all-at-once`);
        const measurement = PerformanceMonitor.get(`panel-${align}-all-at-once`);
        if (measurement && performanceMetrics) {
          performanceMetrics.current[`${align}-all-at-once`] = measurement;
        }
        setRenderStats({
          initialTime: 0,
          totalMounted: regions.length,
        });
      }
    }
  }, [useBatch, mountedSet.size, regions.length, align, performanceMetrics]);

  // Determine if a region is mounted
  const isMounted = (id) => {
    if (!useBatch) return true;  // Non-batch: always render
    return mountedSet.has(id);
  };

  const progressPercent = regions.length > 0 
    ? Math.round((mountedSet.size / regions.length) * 100) 
    : 0;

  return (
    <div className={`data-panel align-${align}`}>
      <h2 className="panel-title">{title}</h2>
      <div className="panel-stats">
        {useBatch ? (
          <div className="stats-batch">
            <div className="stat-row">
              <span className="stat-label">Mode:</span>
              <span className="stat-value batch">🟢 Batch Mount</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Progress:</span>
              <span className="stat-value">{mountedSet.size} / {regions.length} ({progressPercent}%)</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Time elapsed:</span>
              <span className="stat-value">{renderStats.initialTime.toFixed(0)}ms</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }}></div>
            </div>
          </div>
        ) : (
          <div className="stats-all-at-once">
            <div className="stat-row">
              <span className="stat-label">Mode:</span>
              <span className="stat-value danger">🔴 All at Once</span>
            </div>
            <div className="stat-row warning-text">
              ⚠️ All {regions.length} regions rendered immediately (Main thread blocked!)
            </div>
          </div>
        )}
      </div>
      <div className="panel-scroll-area">
        {regions.map(region => (
          isMounted(region.id)
            ? <RegionNode key={region.id} region={region} stressLoad={stressLoad} />
            : <RegionSkeleton key={region.id} />
        ))}
      </div>
    </div>
  );
};

// --- MAIN POC COMPONENT ---
export default function POC() {
  const [dataKey, setDataKey] = useState(0);
  const [useBatch, setUseBatch] = useState(true);
  const [stressLoad, setStressLoad] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const performanceMetrics = useRef({});
  const regions = useMemo(() => generateData(), [dataKey]);

  const handleModeSwitch = () => {
    performanceMetrics.current = {};
    setUseBatch(!useBatch);
    setDataKey(k => k + 1);
  };

  const handleReload = () => {
    performanceMetrics.current = {};
    setDataKey(k => k + 1);
  };

  const metrics = performanceMetrics.current;
  const leftBatchMetric = metrics['left-batch'];
  const rightBatchMetric = metrics['right-batch'];
  const leftAllMetric = metrics['left-all-at-once'];
  const rightAllMetric = metrics['right-all-at-once'];

  return (
    <div className="poc-container">
      <header className="poc-header">
        <h1>Cloud Architecture POC - Batch Mount Demo</h1>
        <p>40 Regions × 20 Zones × 2 Servers = 1,600+ elements per panel.</p>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            className="reload-btn" 
            onClick={handleModeSwitch}
            style={{ background: useBatch ? '#238636' : '#da3633' }}
          >
            {useBatch ? '🟢 Batch Mount (Smooth)' : '🔴 All at Once (Blocked)'}
          </button>
          
          <button className="reload-btn" onClick={handleReload}>
            🔄 Reload Data
          </button>

          <button
            className="reload-btn"
            onClick={() => setStressLoad(s => !s)}
            style={{ background: stressLoad ? '#da3633' : '#a371f7' }}
          >
            {stressLoad ? '⚡ Stress Mode ON (Very Heavy)' : '🧪 Enable Stress Mode'}
          </button>

          <button 
            className="reload-btn" 
            onClick={() => setShowMetrics(!showMetrics)}
            style={{ background: '#0969da' }}
          >
            📊 {showMetrics ? 'Hide' : 'Show'} Metrics
          </button>
        </div>

        {showMetrics && (
          <div className="metrics-display">
            <h3>Performance Metrics</h3>
            <div className="metrics-grid">
              {leftBatchMetric && (
                <div className="metric-card batch">
                  <div className="metric-title">Left Panel - Batch Mode</div>
                  <div className="metric-item">
                    <span className="label">Duration:</span>
                    <span className="value">{leftBatchMetric.duration.toFixed(0)}ms</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Memory Δ:</span>
                    <span className="value">{(leftBatchMetric.memoryDelta / 1024 / 1024).toFixed(2)}MB</span>
                  </div>
                </div>
              )}
              {rightBatchMetric && (
                <div className="metric-card batch">
                  <div className="metric-title">Right Panel - Batch Mode</div>
                  <div className="metric-item">
                    <span className="label">Duration:</span>
                    <span className="value">{rightBatchMetric.duration.toFixed(0)}ms</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Memory Δ:</span>
                    <span className="value">{(rightBatchMetric.memoryDelta / 1024 / 1024).toFixed(2)}MB</span>
                  </div>
                </div>
              )}
              {leftAllMetric && (
                <div className="metric-card all-at-once">
                  <div className="metric-title">Left Panel - All at Once</div>
                  <div className="metric-item">
                    <span className="label">Duration:</span>
                    <span className="value">{leftAllMetric.duration.toFixed(0)}ms</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Memory Δ:</span>
                    <span className="value">{(leftAllMetric.memoryDelta / 1024 / 1024).toFixed(2)}MB</span>
                  </div>
                </div>
              )}
              {rightAllMetric && (
                <div className="metric-card all-at-once">
                  <div className="metric-title">Right Panel - All at Once</div>
                  <div className="metric-item">
                    <span className="label">Duration:</span>
                    <span className="value">{rightAllMetric.duration.toFixed(0)}ms</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Memory Δ:</span>
                    <span className="value">{(rightAllMetric.memoryDelta / 1024 / 1024).toFixed(2)}MB</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="split-view">
        <DataPanel title="Left Panel (Instance A)" regions={regions} align="left" useBatch={useBatch} stressLoad={stressLoad} performanceMetrics={performanceMetrics} />
        <DataPanel title="Right Panel (Instance B)" regions={regions} align="right" useBatch={useBatch} stressLoad={stressLoad} performanceMetrics={performanceMetrics} />
      </div>
    </div>
  );
}
