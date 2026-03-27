import { createSlice } from '@reduxjs/toolkit';

// Generate mock data with configurable totals
const generateMarketData = (numMarketZones = 25, numSectorRows = 110, numSegmentCells = 298, numSegmentsPerCell = 5) => {
  const marketZones = [];
  let sectorRowId = 1;
  let cellId = 1;

  for (let mz = 1; mz <= numMarketZones; mz++) {
    const marketZone = {
      id: `marketzone-${mz}`,
      name: `Market Zone ${mz}`,
      sectorRows: [],
    };

    // Distribute sector rows evenly across zones
    const numSectorRowsPerZone = Math.floor(numSectorRows / numMarketZones);
    const extraRows = mz <= numSectorRows % numMarketZones ? 1 : 0;
    const targetSectorRows = numSectorRowsPerZone + extraRows;

    for (let sr = 0; sr < targetSectorRows && sectorRowId <= numSectorRows; sr++) {
      const sectorRow = {
        id: `sectorrow-${sectorRowId}`,
        name: `Sector Row ${sectorRowId}`,
        marketZoneId: marketZone.id,
        territoryCells: [],
      };

      // Distribute cells evenly across rows
      const numCellsPerRow = Math.floor(numSegmentCells / numSectorRows);
      const extraCells = sectorRowId <= numSegmentCells % numSectorRows ? 1 : 0;
      const targetCells = numCellsPerRow + extraCells;

      for (let c = 0; c < targetCells && cellId <= numSegmentCells; c++) {
        const cell = {
          id: `cell-${cellId}`,
          name: `Territory Cell ${cellId}`,
          sectorRowId: sectorRow.id,
          ratio: Math.random() * 100,
          exposure: Math.random() * 1000,
          segments: Array.from({ length: numSegmentsPerCell }, (_, i) => ({
            id: `segment-${cellId}-${i + 1}`,
            value: Math.random() * 50,
          })),
        };
        sectorRow.territoryCells.push(cell);
        cellId++;
      }

      marketZone.sectorRows.push(sectorRow);
      sectorRowId++;
    }

    marketZones.push(marketZone);
  }

  return marketZones;
};

const initialState = {
  marketZones: generateMarketData(),
  lastUpdatedCellId: null,
  lastUpdatedType: null, // 'ratio', 'exposure', or 'segment'
  lastUpdatedSegmentId: null,
  config: {
    numMarketZones: 25,
    numSectorRows: 110,
    numSegmentCells: 298,
    numSegmentsPerCell: 5,
  },
};

const marketSlice = createSlice({
  name: 'market',
  initialState,
  reducers: {
    updateRandomValue: (state) => {
      // Randomly select a cell to update
      const allCells = [];
      state.marketZones.forEach(mz => {
        mz.sectorRows.forEach(sr => {
          sr.territoryCells.forEach(cell => {
            allCells.push(cell);
          });
        });
      });

      if (allCells.length > 0) {
        const randomCell = allCells[Math.floor(Math.random() * allCells.length)];
        const updateType = Math.floor(Math.random() * 3); // 0: ratio, 1: exposure, 2: segment

        if (updateType === 0) {
          randomCell.ratio = Math.random() * 100;
          state.lastUpdatedCellId = randomCell.id;
          state.lastUpdatedType = 'ratio';
        } else if (updateType === 1) {
          randomCell.exposure = Math.random() * 1000;
          state.lastUpdatedCellId = randomCell.id;
          state.lastUpdatedType = 'exposure';
        } else {
          const randomSegment = randomCell.segments[Math.floor(Math.random() * randomCell.segments.length)];
          randomSegment.value = Math.random() * 50;
          state.lastUpdatedCellId = randomCell.id;
          state.lastUpdatedType = 'segment';
          state.lastUpdatedSegmentId = randomSegment.id;
        }
      }
    },
    updateDataConfig: (state, action) => {
      const { numMarketZones, numSectorRows, numSegmentCells, numSegmentsPerCell } = action.payload;
      state.config = {
        numMarketZones,
        numSectorRows,
        numSegmentCells,
        numSegmentsPerCell,
      };
      state.marketZones = generateMarketData(numMarketZones, numSectorRows, numSegmentCells, numSegmentsPerCell);
      state.lastUpdatedCellId = null;
      state.lastUpdatedType = null;
      state.lastUpdatedSegmentId = null;
    },
  },
});

export const { updateRandomValue, updateDataConfig } = marketSlice.actions;

export default marketSlice.reducer;

// Selectors
export const selectMarketZones = (state) => state.market.marketZones;
export const selectMarketZoneById = (state, marketZoneId) =>
  state.market.marketZones.find(mz => mz.id === marketZoneId);
export const selectSectorRowsByMarketZoneId = (state, marketZoneId) =>
  selectMarketZoneById(state, marketZoneId)?.sectorRows || [];
export const selectSectorRowById = (state, sectorRowId) => {
  for (const mz of state.market.marketZones) {
    const sr = mz.sectorRows.find(sr => sr.id === sectorRowId);
    if (sr) return sr;
  }
  return null;
};
export const selectTerritoryCellsBySectorRowId = (state, sectorRowId) =>
  selectSectorRowById(state, sectorRowId)?.territoryCells || [];
export const selectTerritoryCellById = (state, cellId) => {
  for (const mz of state.market.marketZones) {
    for (const sr of mz.sectorRows) {
      const cell = sr.territoryCells.find(c => c.id === cellId);
      if (cell) return cell;
    }
  }
  return null;
};
export const selectLastUpdatedCellId = (state) => state.market.lastUpdatedCellId;
export const selectLastUpdatedType = (state) => state.market.lastUpdatedType;
export const selectLastUpdatedSegmentId = (state) => state.market.lastUpdatedSegmentId;
export const selectDataConfig = (state) => state.market.config;