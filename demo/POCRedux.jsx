import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { store } from './store.js';
import {
  selectMarketZoneById,
  selectSectorRowsByMarketZoneId,
  selectSectorRowById,
  selectTerritoryCellsBySectorRowId,
  selectTerritoryCellById,
  updateRandomValue,
  selectLastUpdatedCellId,
  selectLastUpdatedType,
  selectLastUpdatedSegmentId,
} from './marketSlice.js';

// SegmentCell component
const SegmentCell = ({ segmentId, cellId }) => {
  const cell = useSelector(state => selectTerritoryCellById(state, cellId));
  const lastUpdatedCellId = useSelector(selectLastUpdatedCellId);
  const lastUpdatedType = useSelector(selectLastUpdatedType);
  const lastUpdatedSegmentId = useSelector(selectLastUpdatedSegmentId);

  const segment = cell?.segments.find(s => s.id === segmentId);
  const isHighlighted = lastUpdatedCellId === cellId && lastUpdatedType === 'segment' && lastUpdatedSegmentId === segmentId;

  // Debug: Log highlight status
  useEffect(() => {
    if (isHighlighted) {
      console.log(`SegmentCell ${segmentId} in cell ${cellId} is highlighted!`);
    }
  }, [isHighlighted, segmentId, cellId]);

  return (
    <div className={`segment-cell ${isHighlighted ? 'highlight' : ''}`}>
      <span>{segment ? segment.value.toFixed(2) : 'N/A'}</span>
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
const LeftPanel = ({ marketZoneIds }) => (
  <div className="panel left-panel">
    <h2>Left Panel</h2>
    {marketZoneIds.map(id => (
      <MarketZone key={id} marketZoneId={id} />
    ))}
  </div>
);

const CenterPanel = ({ marketZoneIds }) => (
  <div className="panel center-panel">
    <h2>Center Panel</h2>
    {marketZoneIds.map(id => (
      <MarketZone key={id} marketZoneId={id} />
    ))}
  </div>
);

const RightPanel = ({ marketZoneIds }) => (
  <div className="panel right-panel">
    <h2>Right Panel</h2>
    {marketZoneIds.map(id => (
      <MarketZone key={id} marketZoneId={id} />
    ))}
  </div>
);

// Main POC component
const POCRedux = () => {
  const dispatch = useDispatch();
  const marketZones = useSelector(state => state.market.marketZones);
  const marketZoneIds = marketZones.map(mz => mz.id);

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

  return (
    <div className="poc-redux">
      <h1>Redux POC with Nested Components</h1>
      <div className="panels">
        <LeftPanel marketZoneIds={marketZoneIds} />
        <CenterPanel marketZoneIds={marketZoneIds} />
        <RightPanel marketZoneIds={marketZoneIds} />
      </div>
    </div>
  );
};

export default POCRedux;