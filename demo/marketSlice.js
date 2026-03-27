import { createSlice } from '@reduxjs/toolkit';

// Generate mock data
const generateMarketData = () => {
  const marketZones = [];
  let sectorRowId = 1;
  let cellId = 1;

  for (let mz = 1; mz <= 25; mz++) {
    const marketZone = {
      id: `marketzone-${mz}`,
      name: `Market Zone ${mz}`,
      sectorRows: [],
    };

    // Distribute sector rows to reach ~110 total
    const numSectorRows = Math.floor(110 / 25) + (mz <= 110 % 25 ? 1 : 0); // 4-5 per zone

    for (let sr = 0; sr < numSectorRows && sectorRowId <= 110; sr++) {
      const sectorRow = {
        id: `sectorrow-${sectorRowId}`,
        name: `Sector Row ${sectorRowId}`,
        marketZoneId: marketZone.id,
        territoryCells: [],
      };

      // Distribute cells to reach ~298 total
      const numCells = Math.floor(298 / 110) + (sectorRowId <= 298 % 110 ? 1 : 0); // 2-3 per row

      for (let c = 0; c < numCells && cellId <= 298; c++) {
        const cell = {
          id: `cell-${cellId}`,
          name: `Territory Cell ${cellId}`,
          sectorRowId: sectorRow.id,
          ratio: Math.random() * 100,
          exposure: Math.random() * 1000,
          segments: Array.from({ length: 5 }, (_, i) => ({
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
};

const marketSlice = createSlice({
  name: 'market',
  initialState,
  reducers: {
    // Add reducers if needed
  },
});

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