// Benchmark Worker for performance testing
self.onmessage = (event) => {
  const { testId, renderMode, config } = event.data;
  
  const startTime = performance.now();
  const startMemory = performance.memory?.usedJSHeapSize || 0;
  
  try {
    // Simulate rendering complexity based on config
    const totalComponents = config.numMarketZones * 
                          config.numSectorRows * 
                          config.numSegmentCells * 
                          config.numSegmentsPerCell;

    // Use mode to adjust weight: batch should be cheaper than direct, realistically
    const modeFactor = renderMode === 'batch' ? 0.6 : 1.0;
    const baseIterationCount = Math.max(1, Math.floor(totalComponents / 20));
    const iterations = Math.floor(baseIterationCount * (modeFactor * 100 + 50));

    // Simulate work proportional to component count and mode factor
    let work = 0;
    for (let i = 0; i < iterations; i++) {
      work += Math.sqrt(i) * (renderMode === 'batch' ? 0.75 : 1.2);
    }

    const endTime = performance.now();
    const endMemory = performance.memory?.usedJSHeapSize || 0;
    
    self.postMessage({
      testId,
      renderMode,
      config,
      duration: endTime - startTime,
      memoryUsed: endMemory - startMemory,
      totalComponents,
      timestamp: new Date().toLocaleTimeString(),
      status: 'completed'
    });
  } catch (error) {
    self.postMessage({
      testId,
      renderMode,
      status: 'failed',
      error: error.message
    });
  }
};
