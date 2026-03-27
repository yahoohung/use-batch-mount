import React, { useState, useMemo } from 'react';
import { useBatchMount } from '../src/useBatchMount';
import './poc.css';

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
const ServerNode = ({ server }) => {
  // Simulate slight rendering weight per server
  const start = performance.now();
  while (performance.now() - start < 0.2) {} 
  return (
    <div className="server-node">
      <span className="server-name">{server.name}</span>
      <span className="server-ping">{server.ping}</span>
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
// Both left and right panels will use this exact same component.
// This proves that useBatchMount maintains its own independence per instance!
const DataPanel = ({ title, regions, align, useBatch }) => {
  const regionIds = useMemo(() => regions.map(r => r.id), [regions]);

  const mountedSet = useBatchMount(useBatch ? regionIds : [], {
    initialBatch: 2,   // Only mount 2 regions initially to guarantee instant load
    batchSize: 2,      // Mount 2 regions per idle tick (each region has 40 components)
  });

  const isMounted = (id) => useBatch ? mountedSet.has(id) : true;

  return (
    <div className={`data-panel align-${align}`}>
      <h2 className="panel-title">{title}</h2>
      <div className="panel-stats">
        {useBatch ? 
          `Mounting progress: ${Math.min(mountedSet.size, regions.length)} / ${regions.length} Regions` 
          : '⚠️ All mounted instantly (Browser Main Thread Blocked)'}
      </div>
      <div className="panel-scroll-area">
        {regions.map(region => (
          isMounted(region.id)
            ? <RegionNode key={region.id} region={region} />
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
  const regions = useMemo(() => generateData(), [dataKey]);

  return (
    <div className="poc-container">
      <header className="poc-header">
        <h1>Cloud Architecture POC</h1>
        <p>40 Regions × 20 Zones × 2 Servers = 1,600 elements per panel.</p>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button 
            className="reload-btn" 
            onClick={() => { setUseBatch(!useBatch); setDataKey(k => k + 1); }}
            style={{ background: useBatch ? '#238636' : '#da3633' }}
          >
            {useBatch ? '🟢 Batch Mount (Smooth UI)' : '🔴 Mount All at Once (Lag Warning!)'}
          </button>
          
          <button className="reload-btn" onClick={() => setDataKey(k => k + 1)}>
            🔄 Reload Data (Trigger Diff)
          </button>
        </div>
      </header>

      <div className="split-view">
        <DataPanel title="Left Panel (Instance A)" regions={regions} align="left" useBatch={useBatch} />
        <DataPanel title="Right Panel (Instance B)" regions={regions} align="right" useBatch={useBatch} />
      </div>
    </div>
  );
}
