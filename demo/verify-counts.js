// Quick verification of data counts
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

console.log('Market Zones:', marketZones.length);
console.log('Total Sector Rows:', marketZones.reduce((sum, mz) => sum + mz.sectorRows.length, 0));
console.log('Total Cells:', marketZones.reduce((sum, mz) => sum + mz.sectorRows.reduce((sum2, sr) => sum2 + sr.territoryCells.length, 0), 0));