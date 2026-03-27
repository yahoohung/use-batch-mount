import React, { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useSelector, useDispatch } from 'react-redux';
import { useBatchMount } from '../src/useBatchMount.js';
import { store } from './store.js';
import {
  selectMarketZoneById,
  selectSectorRowsByMarketZoneId,
  selectSectorRowById,
  selectTerritoryCellsBySectorRowId,
  selectTerritoryCellById,
  updateRandomValue,
  updateDataConfig,
  selectLastUpdatedCellId,
  selectLastUpdatedType,
  selectLastUpdatedSegmentId,
  selectDataConfig,
} from './marketSlice.js';

// SegmentCell component
const SegmentCell = ({ segmentId, cellId }) => {
  const cell = useSelector(state => selectTerritoryCellById(state, cellId));
  const lastUpdatedCellId = useSelector(selectLastUpdatedCellId);
  const lastUpdatedType = useSelector(selectLastUpdatedType);
  const lastUpdatedSegmentId = useSelector(selectLastUpdatedSegmentId);

  const segment = cell?.segments.find(s => s.id === segmentId);
  const isHighlighted = lastUpdatedCellId === cellId && lastUpdatedType === 'segment' && lastUpdatedSegmentId === segmentId;

  // Local state for 4 numbers that update every 500ms
  const [numbers, setNumbers] = useState([0, 0, 0, 0]);

  // Update numbers every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      setNumbers(prev => {
        const newNumbers = prev.map(() => Math.floor(Math.random() * 100));
        console.log(`SegmentCell ${segmentId} numbers updated:`, newNumbers, 'Sum:', newNumbers.reduce((acc, num) => acc + num, 0));
        return newNumbers;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [segmentId]);

  // Calculate sum of numbers
  const sum = numbers.reduce((acc, num) => acc + num, 0);

  // React Hook Form setup
  const { register, formState: { isDirty, dirtyFields }, setValue, watch } = useForm({
    mode: 'onChange',
    defaultValues: {
      field1: segment?.value || 0,
      field2: (segment?.value || 0) * 2, // Second field as double the value
    }
  });

  // Watch form values for debugging
  const watchedValues = watch();

  // Update form values when segment value changes
  useEffect(() => {
    if (segment) {
      const newField1 = segment.value;
      const newField2 = segment.value * 2;

      // Only update if values are different to avoid infinite loops
      if (watchedValues.field1 !== newField1) {
        setValue('field1', newField1, { shouldDirty: false });
      }
      if (watchedValues.field2 !== newField2) {
        setValue('field2', newField2, { shouldDirty: false });
      }
    }
  }, [segment?.value, setValue, watchedValues.field1, watchedValues.field2]);

  // Debug: Log form changes
  useEffect(() => {
    console.log(`SegmentCell ${segmentId} form values:`, watchedValues, 'Dirty:', isDirty);
  }, [watchedValues, isDirty, segmentId]);

  // Debug: Log highlight status
  useEffect(() => {
    if (isHighlighted) {
      console.log(`SegmentCell ${segmentId} in cell ${cellId} is highlighted!`);
    }
  }, [isHighlighted, segmentId, cellId]);

  return (
    <div className={`segment-cell ${isHighlighted ? 'highlight' : ''}`}>
      <div className="segment-value">
        <span>Value: {segment ? segment.value.toFixed(2) : 'N/A'}</span>
      </div>
      <div className="segment-numbers">
        <div className="numbers-array">
          {numbers.map((num, index) => (
            <span key={index} className="number-item">{num}</span>
          ))}
        </div>
        <div className="numbers-sum">
          <strong>Sum: {sum}</strong>
        </div>
      </div>
      <div className="segment-form">
        <input
          {...register('field1')}
          type="number"
          step="0.01"
          placeholder="Field 1"
          className={dirtyFields.field1 ? 'dirty' : ''}
        />
        <input
          {...register('field2')}
          type="number"
          step="0.01"
          placeholder="Field 2"
          className={dirtyFields.field2 ? 'dirty' : ''}
        />
      </div>
      <div className="form-status">
        <small>Dirty: {isDirty ? 'Yes' : 'No'}</small>
        <small>F1: {dirtyFields.field1 ? 'D' : 'C'}</small>
        <small>F2: {dirtyFields.field2 ? 'D' : 'C'}</small>
      </div>
    </div>
  );
};

// SegmentBreakdown component
const SegmentBreakdown = ({ cellId }) => {
  const cell = useSelector(state => selectTerritoryCellById(state, cellId));

  return (
    <div className="segment-breakdown">
      <h5>Segments</h5>
      <div className="segments">
        {cell?.segments.map(segment => (
          <SegmentCell key={segment.id} segmentId={segment.id} cellId={cellId} />
        ))}
      </div>
    </div>
  );
};

// RatioDisplay component
const RatioDisplay = ({ cellId }) => {
  const cell = useSelector(state => selectTerritoryCellById(state, cellId));
  const lastUpdatedCellId = useSelector(selectLastUpdatedCellId);
  const lastUpdatedType = useSelector(selectLastUpdatedType);

  const isHighlighted = lastUpdatedCellId === cellId && lastUpdatedType === 'ratio';

  // Debug: Log highlight status
  useEffect(() => {
    if (isHighlighted) {
      console.log(`RatioDisplay ${cellId} is highlighted!`);
    }
  }, [isHighlighted, cellId]);

  return (
    <div className={`ratio-display ${isHighlighted ? 'highlight' : ''}`}>
      <span>Ratio: {cell ? cell.ratio.toFixed(2) : 'N/A'}</span>
    </div>
  );
};

// ExposureDisplay component
const ExposureDisplay = ({ cellId }) => {
  const cell = useSelector(state => selectTerritoryCellById(state, cellId));
  const lastUpdatedCellId = useSelector(selectLastUpdatedCellId);
  const lastUpdatedType = useSelector(selectLastUpdatedType);

  const isHighlighted = lastUpdatedCellId === cellId && lastUpdatedType === 'exposure';

  // Debug: Log highlight status
  useEffect(() => {
    if (isHighlighted) {
      console.log(`ExposureDisplay ${cellId} is highlighted!`);
    }
  }, [isHighlighted, cellId]);

  return (
    <div className={`exposure-display ${isHighlighted ? 'highlight' : ''}`}>
      <span>Exposure: {cell ? cell.exposure.toFixed(2) : 'N/A'}</span>
    </div>
  );
};

// TerritoryCell component
const TerritoryCell = ({ cellId }) => {
  return (
    <div className="territory-cell">
      <RatioDisplay cellId={cellId} />
      <ExposureDisplay cellId={cellId} />
      <SegmentBreakdown cellId={cellId} />
    </div>
  );
};

// SectorRow component
const SectorRow = ({ sectorRowId }) => {
  const cells = useSelector(state => selectTerritoryCellsBySectorRowId(state, sectorRowId));
  const sectorRow = useSelector(state => selectSectorRowById(state, sectorRowId));

  return (
    <div className="sector-row">
      <h4>{sectorRow?.name}</h4>
      <div className="cells">
        {cells.map(cell => (
          <TerritoryCell key={cell.id} cellId={cell.id} />
        ))}
      </div>
    </div>
  );
};

// MarketZone component
const MarketZone = ({ marketZoneId }) => {
  const sectorRows = useSelector(state => selectSectorRowsByMarketZoneId(state, marketZoneId));
  const marketZone = useSelector(state => selectMarketZoneById(state, marketZoneId));

  return (
    <div className="market-zone">
      <h3>{marketZone?.name}</h3>
      <div className="sector-rows">
        {sectorRows.map(sr => (
          <SectorRow key={sr.id} sectorRowId={sr.id} />
        ))}
      </div>
    </div>
  );
};

// Panel components
const LeftPanel = ({ marketZoneIds, renderMarketZones }) => (
  <div className="panel left-panel">
    <h2>Left Panel</h2>
    {renderMarketZones ? renderMarketZones(marketZoneIds) : marketZoneIds.map(id => <MarketZone key={id} marketZoneId={id} />)}
  </div>
);

const CenterPanel = ({ marketZoneIds, renderMarketZones }) => (
  <div className="panel center-panel">
    <h2>Center Panel</h2>
    {renderMarketZones ? renderMarketZones(marketZoneIds) : marketZoneIds.map(id => <MarketZone key={id} marketZoneId={id} />)}
  </div>
);

const RightPanel = ({ marketZoneIds, renderMarketZones }) => (
  <div className="panel right-panel">
    <h2>Right Panel</h2>
    {renderMarketZones ? renderMarketZones(marketZoneIds) : marketZoneIds.map(id => <MarketZone key={id} marketZoneId={id} />)}
  </div>
);

// BenchmarkRunner Component (real UI render timing)
const BenchmarkRunner = ({
  marketZoneIds,
  dataConfig,
  renderMode,
  setRenderMode,
  onResultsUpdate,
}) => {
  const [benchmarkResults, setBenchmarkResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentMode, setCurrentMode] = useState(null);
  const [queue, setQueue] = useState([]);
  const [startTime, setStartTime] = useState(0);
  const [first10Time, setFirst10Time] = useState(null);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (isRunning && queue.length > 0 && !currentMode) {
      const nextMode = queue[0];
      setCurrentMode(nextMode);
      setRenderMode(nextMode);
      setStartTime(performance.now());
    }
  }, [isRunning, queue, currentMode, setRenderMode]);

  useEffect(() => {
    if (!currentMode || !isRunning) return;

    const checkFn = () => {
      const renderedCount = document.querySelectorAll('.panel .market-zone:not(.skeleton)').length;

      if (!first10Time && renderedCount >= Math.min(10, marketZoneIds.length)) {
        setFirst10Time(performance.now() - startTime);
      }

      if (renderedCount >= marketZoneIds.length) {
        const end = performance.now();
        const duration = end - startTime;
        const result = {
          mode: currentMode,
          duration,
          first10Duration: first10Time || duration,
          renderedCount,
          config: dataConfig,
          timestamp: new Date().toLocaleTimeString(),
        };
        setBenchmarkResults(prev => [...prev, result]);
        onResultsUpdate && onResultsUpdate(result);
        setCurrentMode(null);
        setQueue(prev => prev.slice(1));
        setRenderMode(null);
        setFirst10Time(null);
      }
    };

    const timer = setInterval(checkFn, 70);
    return () => clearInterval(timer);
  }, [currentMode, isRunning, marketZoneIds.length, startTime, dataConfig, onResultsUpdate, setRenderMode]);

  useEffect(() => {
    if (isRunning && !currentMode && queue.length === 0) {
      setIsRunning(false);
      setShowResults(true);
    }
  }, [isRunning, currentMode, queue.length]);

  const startBenchmark = () => {
    setBenchmarkResults([]);
    setShowResults(false);
    setQueue(['batch', 'direct']);
    setCurrentMode(null);
    setIsRunning(true);
    setRenderMode(null);
  };

  const downloadResults = () => {
    const csv = [
      ['Mode', 'Duration (ms)', 'Components', 'Timestamp'],
      ...benchmarkResults.map(r => [r.mode, r.duration.toFixed(2), r.renderedCount, r.timestamp]),
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark-${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="benchmark-runner">
      <div className="benchmark-header">
        <h3>⚡ Benchmark Suite (Real Render)</h3>
        <div className="benchmark-controls">
          <button onClick={startBenchmark} disabled={isRunning} className={isRunning ? 'disabled' : ''}>
            {isRunning ? '⏳ Running Benchmarks...' : '🚀 Start Benchmark'}
          </button>
          {currentMode && <span className="current-test">Testing: <strong>{currentMode}</strong></span>}
        </div>
      </div>

      {showResults && benchmarkResults.length > 0 && (
        <div className="benchmark-results">
          <div className="results-table">
            <table>
              <thead>
                <tr>
                  <th>Render Mode</th>
                  <th>Duration (ms)</th>
                  <th>Components</th>
                  <th>Time/Component (μs)</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkResults.map((result, idx) => (
                  <tr key={idx}>
                    <td><strong>{result.mode}</strong></td>
                    <td>{result.duration.toFixed(2)}</td>
                    <td>{result.renderedCount}</td>
                    <td>{(result.duration * 1000 / Math.max(1, result.renderedCount)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {benchmarkResults.length === 2 && (
            <div className="comparison">
              <div className="comparison-item">
                <span>Batch / Direct ratio:</span>
                <span className="value">
                  {(benchmarkResults[0].duration / benchmarkResults[1].duration).toFixed(2)}x
                </span>
              </div>
            </div>
          )}

          <button onClick={downloadResults} className="download-btn">📥 Download CSV</button>
        </div>
      )}
    </div>
  );
};

// Main POC component
const POCRedux = () => {
  const dispatch = useDispatch();
  const marketZones = useSelector(state => state.market.marketZones);
  const marketZoneIds = marketZones.map(mz => mz.id);
  const dataConfig = useSelector(selectDataConfig);

  // Render mode control
  const [renderMode, setRenderMode] = useState(null); // null, 'batch', 'direct'

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [tempConfig, setTempConfig] = useState(dataConfig);

  // Batch mount for performance
  const mountedSet = useBatchMount(marketZoneIds, { initialBatch: 2, batchSize: 2 });

  // Update temp config when dataConfig changes
  useEffect(() => {
    setTempConfig(dataConfig);
  }, [dataConfig]);

  const handleApplyConfig = () => {
    dispatch(updateDataConfig(tempConfig));
    setShowSettings(false);
    setRenderMode(null); // Reset render mode
  };

  const handleConfigChange = (field, value) => {
    setTempConfig(prev => ({
      ...prev,
      [field]: Math.max(1, parseInt(value) || 1)
    }));
  };

  useEffect(() => {
    const interval = setInterval(() => {
      dispatch(updateRandomValue());
      // Debug: Log current state after update
      setTimeout(() => {
        const state = store.getState();
        console.log('Last updated:', {
          cellId: state.market.lastUpdatedCellId,
          type: state.market.lastUpdatedType,
          segmentId: state.market.lastUpdatedSegmentId
        });
      }, 10);
    }, 500); // Update every 500ms (half second)

    return () => clearInterval(interval);
  }, [dispatch]);

  const renderMarketZones = (ids) => {
    if (renderMode === 'batch') {
      return ids.map(id => 
        mountedSet.has(id) ? (
          <MarketZone key={id} marketZoneId={id} />
        ) : (
          <div key={id} className="market-zone skeleton">
            <div className="skeleton-header">Loading Market Zone...</div>
          </div>
        )
      );
    } else if (renderMode === 'direct') {
      return ids.map(id => <MarketZone key={id} marketZoneId={id} />);
    }
    return null;
  };

  return (
    <div className="poc-redux">
      <h1>Redux POC with Nested Components</h1>
      
      <div className="controls">
        <button 
          onClick={() => setRenderMode('batch')}
          className={renderMode === 'batch' ? 'active' : ''}
        >
          Use Batch Mount
        </button>
        <button 
          onClick={() => setRenderMode('direct')}
          className={renderMode === 'direct' ? 'active' : ''}
        >
          Direct Render
        </button>
        <button 
          onClick={() => setRenderMode(null)}
          className={renderMode === null ? 'active' : ''}
        >
          Clear
        </button>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={showSettings ? 'active' : ''}
          style={{ marginLeft: 'auto' }}
        >
          ⚙️ Settings
        </button>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <div className="settings-grid">
            <div className="settings-row">
              <label>Market Zones:</label>
              <input 
                type="number" 
                min="1" 
                max="100"
                value={tempConfig.numMarketZones}
                onChange={(e) => handleConfigChange('numMarketZones', e.target.value)}
              />
              <span className="hint">{tempConfig.numMarketZones}</span>
            </div>
            <div className="settings-row">
              <label>Sector Rows:</label>
              <input 
                type="number" 
                min="1" 
                max="500"
                value={tempConfig.numSectorRows}
                onChange={(e) => handleConfigChange('numSectorRows', e.target.value)}
              />
              <span className="hint">{tempConfig.numSectorRows}</span>
            </div>
            <div className="settings-row">
              <label>Territory Cells:</label>
              <input 
                type="number" 
                min="1" 
                max="1000"
                value={tempConfig.numSegmentCells}
                onChange={(e) => handleConfigChange('numSegmentCells', e.target.value)}
              />
              <span className="hint">{tempConfig.numSegmentCells}</span>
            </div>
            <div className="settings-row">
              <label>Segments per Cell:</label>
              <input 
                type="number" 
                min="1" 
                max="20"
                value={tempConfig.numSegmentsPerCell}
                onChange={(e) => handleConfigChange('numSegmentsPerCell', e.target.value)}
              />
              <span className="hint">{tempConfig.numSegmentsPerCell}</span>
            </div>
          </div>
          <div className="settings-buttons">
            <button onClick={handleApplyConfig} className="apply-btn">Apply</button>
            <button onClick={() => setShowSettings(false)} className="cancel-btn">Cancel</button>
          </div>
        </div>
      )}

      <BenchmarkRunner
        marketZoneIds={marketZoneIds}
        dataConfig={dataConfig}
        renderMode={renderMode}
        setRenderMode={setRenderMode}
      />

      {renderMode && (
        <div className="panels">
          <LeftPanel marketZoneIds={marketZoneIds} renderMarketZones={renderMarketZones} />
          <CenterPanel marketZoneIds={marketZoneIds} renderMarketZones={renderMarketZones} />
          <RightPanel marketZoneIds={marketZoneIds} renderMarketZones={renderMarketZones} />
        </div>
      )}
    </div>
  );
};

export default POCRedux;