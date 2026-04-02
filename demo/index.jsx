import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { useBatchMount, __batchMountDebug } from '../src/useBatchMount.js';

// ══════════════════════════════════════════════════════════════════════════
//  DEMO COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
//  FAKE STORE — maximum nested depth, no normalization
//  Each pool: 5 lines × 10 selections × 8 client groups × 3 sub-tiers
//  = 1,200 leaf nodes per pool. Store has 400 pools = 480,000 leaf nodes.
// ══════════════════════════════════════════════════════════════════════════
const CG = ['VIP','HV','STD','NEW','RET','WHALE','SHARP','CASUAL'];
const SUB_TIERS = ['PLAT','GOLD','SILVER'];
const BT = ['1X2','HTFT','OU','AH','CS','TG','FGLG','HiLo','DC','DNB','BTS','OE','HT_OU','FT_OU','BOTH_HT','MIX_PAR','CORNER','BOOKING','PENALTY','RACE_TO'];
const SETTLEMENT_RULES = ['STANDARD','DEAD_HEAT','RULE_4','VOID_IF_DNP','HALF_PUSH'];
const TAGS = ['HOT','MONITORED','CAPPED','FREE_BET','PROMO','RESTRICTED','MANUAL_REVIEW'];

function _genStore(n) {
  const pools = [];
  for (let i = 0; i < n; i++) {
    const lc = 2 + (i % 5);
    const lines = [];
    for (let l = 0; l < lc; l++) {
      const sc = 4 + (i % 10);
      const sels = [];
      for (let s = 0; s < sc; s++) {
        const cgs = CG.map((c, ci) => ({
          name: c,
          exposure: Math.round((Math.random()-.5)*80000),
          count: Math.floor(Math.random()*500),
          maxBet: Math.round(Math.random()*200000),
          turnover: Math.round(Math.random()*1000000),
          liability: Math.round(Math.random()*300000),
          avgStake: Math.round(Math.random()*5000),
          subTiers: SUB_TIERS.map((st, si) => ({
            tier: st,
            exposure: Math.round((Math.random()-.5)*20000),
            betCount: Math.floor(Math.random()*50),
            limit: Math.round(Math.random()*50000),
          })),
          tags: TAGS.filter(() => Math.random() > 0.6),
        }));
        sels.push({
          sId: `${i}-${l}-${s}`,
          odds: +(1.01 + Math.random()*15).toFixed(2),
          prevOdds: +(1.01 + Math.random()*15).toFixed(2),
          position: Math.round((Math.random()-.5)*200000),
          earlySettle: Math.random() > 0.7,
          suspended: Math.random() > 0.85,
          settlement: SETTLEMENT_RULES[Math.floor(Math.random()*SETTLEMENT_RULES.length)],
          clientGroups: cgs,
          history: Array.from({length: 5}, (_,hi) => ({
            ts: Date.now() - hi*60000,
            odds: +(1.01 + Math.random()*15).toFixed(2),
            position: Math.round((Math.random()-.5)*100000),
          })),
        });
      }
      lines.push({ lineId: `${i}-${l}`, handicap: +(Math.random()*3-1.5).toFixed(2), selections: sels, marketStatus: Math.random()>.1?'OPEN':'SUSPENDED' });
    }
    pools.push({ pID: `pool-${i}`, betType: BT[i%BT.length], status: 'ACTIVE', priority: Math.floor(Math.random()*5), lines, metadata: { lastUpdate: Date.now(), version: Math.floor(Math.random()*100) } });
  }
  return { data: { listPool: pools } };
}
let _store = null;
function _gs(n) { if (!_store || _store.data.listPool.length !== n) _store = _genStore(n); return _store; }

// ── 8 BAD SELECTORS — every one walks the tree, returns new refs ──────

function useSel_pool(idx, n) {
  const s = _gs(n); const p = s.data.listPool.find((_,i)=>i===idx);
  if(!p) return null;
  return JSON.parse(JSON.stringify(p)); // nuclear deep clone every render
}
function useSel_exposure(pool) {
  if(!pool) return [];
  return CG.map(cg => {
    let t=0,cnt=0,liab=0;
    pool.lines.forEach(l=>l.selections.forEach(s=>{const g=s.clientGroups.find(c=>c.name===cg);if(g){t+=g.exposure;cnt+=g.count;liab+=g.liability;}}));
    return {name:cg,total:t,count:cnt,liability:liab};
  });
}
function useSel_odds(pool) {
  if(!pool) return [];
  const r=[];
  pool.lines.forEach(l=>l.selections.forEach(s=>r.push({id:s.sId,display:s.odds.toFixed(2),prev:s.prevOdds.toFixed(2),drift:((s.odds-s.prevOdds)/s.prevOdds*100).toFixed(1),isShort:s.odds<2,isSusp:s.suspended,settlement:s.settlement})));
  return r;
}
function useSel_risk(pool) {
  if(!pool) return {worst:0,best:0,net:0,avg:0,count:0};
  let w=0,b=0,n2=0,c=0;
  pool.lines.forEach(l=>l.selections.forEach(s=>{if(s.position<w)w=s.position;if(s.position>b)b=s.position;n2+=s.position;c++;}));
  return {worst:w,best:b,net:n2,avg:c?Math.round(n2/c):0,count:c};
}
function useSel_subTiers(pool) {
  if(!pool) return [];
  const map = {};
  pool.lines.forEach(l=>l.selections.forEach(s=>s.clientGroups.forEach(cg=>cg.subTiers.forEach(st=>{
    const k=`${cg.name}:${st.tier}`;
    if(!map[k]) map[k]={name:cg.name,tier:st.tier,exposure:0,bets:0};
    map[k].exposure+=st.exposure; map[k].bets+=st.betCount;
  }))));
  return Object.values(map); // new array + new objects every call
}
function useSel_history(pool) {
  if(!pool) return [];
  const all=[];
  pool.lines.forEach(l=>l.selections.forEach(s=>s.history.forEach(h=>all.push({...h,sId:s.sId}))));
  all.sort((a,b)=>b.ts-a.ts);
  return all.slice(0,20);
}
function useSel_tags(pool) {
  if(!pool) return {};
  const counts={};
  pool.lines.forEach(l=>l.selections.forEach(s=>s.clientGroups.forEach(cg=>cg.tags.forEach(t=>{counts[t]=(counts[t]||0)+1;}))));
  return {...counts}; // new obj
}
function useSel_suspendedCount(pool) {
  if(!pool) return {total:0,suspended:0,pct:'0'};
  let t=0,sus=0;
  pool.lines.forEach(l=>{if(l.marketStatus==='SUSPENDED'){l.selections.forEach(()=>sus++);}l.selections.forEach(s=>{t++;if(s.suspended)sus++;});});
  return {total:t,suspended:sus,pct:(t?(sus/t*100):0).toFixed(1)};
}

// ══════════════════════════════════════════════════════════════════════════
//  SegmentCell — child component per client group
//  Has its own form input (max bet override), own effects, own refs.
//  Form state is managed in the worst possible way.
// ══════════════════════════════════════════════════════════════════════════
const SegmentCell = React.memo(({ group, subTiers, onOverride }) => {
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => { if(ref.current) setW(ref.current.offsetWidth); }, []);

  // ── Form state: max bet override ──
  // Controlled input with validation on every keystroke
  const [maxBetInput, setMaxBetInput] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // "Sync" default from selector on mount — overwrites user input (classic bug)
  useEffect(() => {
    setMaxBetInput(String(group.total > 0 ? Math.round(group.total * 1.5) : 10000));
  }, [group.total]); // group.total is new ref every render → fires every render

  // "Validate" on every change — with regex, parseInt, range check
  useEffect(() => {
    if (!isDirty) return;
    const v = parseInt(maxBetInput, 10);
    if (isNaN(v)) { setError('NaN'); return; }
    if (v < 0) { setError('< 0'); return; }
    if (v > 999999) { setError('> max'); return; }
    if (!/^\d+$/.test(maxBetInput)) { setError('fmt'); return; }
    setError('');
  }, [maxBetInput, isDirty]);

  // "Auto-submit" when input loses focus — measures DOM again
  useEffect(() => {
    if (!isFocused && isDirty && !error && inputRef.current) {
      void inputRef.current.getBoundingClientRect();
      // would dispatch to store here
    }
  }, [isFocused, isDirty, error]);

  // Filter sub-tiers for this group — walks full array each render
  const myTiers = subTiers.filter(st => st.name === group.name);
  const tierTotal = myTiers.reduce((a,t) => a + t.exposure, 0);

  return (
    <div ref={ref} style={{background:'#0d1117',borderRadius:2,padding:'2px 4px',fontSize:7,display:'flex',flexDirection:'column',gap:1,border:`1px solid ${error?'#da363666':'#1c2333'}`,minWidth:58}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:4}}>
        <span style={{color:'#484f58',fontWeight:700}}>{group.name.slice(0,3)}</span>
        <span style={{color:group.total>=0?'#3fb950':'#f85149',fontWeight:600}}>{(group.total/1000).toFixed(0)}k</span>
      </div>
      <div style={{display:'flex',gap:2,fontSize:6,color:'#30363d'}}>
        <span>n:{group.count}</span>
        <span>L:{(group.liability/1000).toFixed(0)}k</span>
      </div>
      {/* Max bet override input — the reason virtualization is impossible */}
      <div style={{display:'flex',gap:2,alignItems:'center'}}>
        <input
          ref={inputRef}
          type="text"
          value={maxBetInput}
          onChange={e => { setMaxBetInput(e.target.value); setIsDirty(true); }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{
            width: 36, padding: '1px 2px', fontSize: 7,
            background: error ? '#da363615' : '#161b22',
            border: `1px solid ${isFocused ? '#58a6ff' : error ? '#da3633' : '#21262d'}`,
            borderRadius: 2, color: '#c9d1d9', fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        {error && <span style={{color:'#f85149',fontSize:6}}>!</span>}
        {isDirty && !error && <span style={{color:'#3fb950',fontSize:6}}>*</span>}
      </div>
      {myTiers.map(t => (
        <div key={t.tier} style={{display:'flex',justifyContent:'space-between',fontSize:6,color:'#21262d'}}>
          <span>{t.tier}</span>
          <span style={{color:t.exposure>=0?'#238636':'#da3633'}}>{(t.exposure/1000).toFixed(0)}k</span>
        </div>
      ))}
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
//  HeavyCell — maximum weight
//  8 selectors (all new refs), 9+ useEffects, layout thrashing cascades,
//  child SegmentCells each with their own form + effects + refs,
//  plus cell-level form fields (suspend toggle, priority override).
// ══════════════════════════════════════════════════════════════════════════
const HeavyCell = React.memo(({ id }) => {
  const num = parseInt(id.split(':')[1], 10);
  const N = 400;

  // 8 selectors — every one walks nested tree, returns new refs
  const pool = useSel_pool(num % N, N);
  const exposure = useSel_exposure(pool);
  const odds = useSel_odds(pool);
  const risk = useSel_risk(pool);
  const subTiers = useSel_subTiers(pool);
  const history = useSel_history(pool);
  const tags = useSel_tags(pool);
  const susInfo = useSel_suspendedCount(pool);

  // 5 refs for layout thrashing
  const cRef = useRef(null);
  const hRef = useRef(null);
  const bRef = useRef(null);
  const oRef = useRef(null);
  const fRef = useRef(null);

  const [dims, setDims] = useState({w:0,h:0});
  const [hdrH, setHdrH] = useState(0);
  const [bodyW, setBodyW] = useState(0);
  const [oddsW, setOddsW] = useState(0);

  // ── Cell-level form state ──
  // Suspend toggle — controlled checkbox with useEffect "sync"
  const [isSuspended, setIsSuspended] = useState(false);
  const [priorityInput, setPriorityInput] = useState('');
  const [prioError, setPrioError] = useState('');
  const [prioFocused, setPrioFocused] = useState(false);
  const prioRef = useRef(null);

  // "Sync" suspended state from selector — overwrites user toggle
  useEffect(() => {
    if (pool) setIsSuspended(parseFloat(susInfo.pct) > 50);
  }, [susInfo.pct, pool]);

  // "Sync" priority from selector
  useEffect(() => {
    if (pool) setPriorityInput(String(pool.priority));
  }, [pool]); // pool is new ref every render → fires every render

  // Validate priority on every keystroke
  useEffect(() => {
    const v = parseInt(priorityInput, 10);
    if (isNaN(v) || v < 0 || v > 9) { setPrioError('0-9'); return; }
    setPrioError('');
  }, [priorityInput]);

  // "Auto-save" priority on blur — layout thrash
  useEffect(() => {
    if (!prioFocused && !prioError && prioRef.current) {
      void prioRef.current.getBoundingClientRect();
    }
  }, [prioFocused, prioError]);

  // Effect 1-4: layout thrashing cascade
  useEffect(() => { if(cRef.current){const r=cRef.current.getBoundingClientRect();setDims({w:r.width,h:r.height});} }, []);
  useEffect(() => { if(hRef.current) setHdrH(hRef.current.offsetHeight); }, [dims]);
  useEffect(() => { if(bRef.current) setBodyW(bRef.current.clientWidth); }, [hdrH]);
  useEffect(() => { if(oRef.current) setOddsW(oRef.current.scrollWidth); }, [bodyW]);

  // Effect 5-9: misc waste
  useEffect(() => { const p=odds.map(o=>({...o,ts:Date.now(),dims:{...dims}})); void p; }, [odds, dims]);
  useEffect(() => { void JSON.stringify({id,risk,exposure:exposure.length,tags,sus:susInfo}); }, [id,risk,exposure,tags,susInfo]);
  useEffect(() => { const sorted=[...history].sort((a,b)=>a.ts-b.ts); void sorted; }, [history]);
  useEffect(() => { if(cRef.current){const r=cRef.current.getBoundingClientRect();void(r.top+r.left);} }, [oddsW]);
  useEffect(() => { if(fRef.current) void fRef.current.offsetHeight; }, []);

  const hue = (num*47)%360;
  const topOdds = odds.slice(0,6);
  const netExp = exposure.reduce((a,g)=>a+g.total,0);
  const isPos = netExp >= 0;
  const rc = risk.worst<-80000?'#f85149':risk.worst<-30000?'#f0883e':'#3fb950';
  const tagKeys = Object.keys(tags);
  if(!pool) return null;

  return (
    <div ref={cRef} style={{width:175,minHeight:185,margin:3,borderRadius:6,background:'#161b22',border:`1px solid ${isSuspended?'#da363666':risk.worst<-80000?'#da363633':'#21262d'}`,padding:'5px 7px',fontSize:10,color:'#c9d1d9',display:'flex',flexDirection:'column',gap:2,animation:'cellPop .2s ease both',overflow:'hidden',opacity:isSuspended?.6:1}}>
      {/* Header */}
      <div ref={hRef} style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #21262d',paddingBottom:3}}>
        <div style={{display:'flex',gap:3,alignItems:'center'}}>
          {/* Suspend toggle */}
          <input
            type="checkbox"
            checked={isSuspended}
            onChange={e => setIsSuspended(e.target.checked)}
            style={{width:8,height:8,accentColor:'#da3633',cursor:'pointer'}}
          />
          <span style={{fontWeight:700,fontSize:8,color:`hsl(${hue},55%,60%)`,letterSpacing:.5,textDecoration:isSuspended?'line-through':'none'}}>#{num} {pool.betType}</span>
        </div>
        <div style={{display:'flex',gap:3,alignItems:'center'}}>
          {/* Priority input */}
          <input
            ref={prioRef}
            type="text"
            value={priorityInput}
            onChange={e => setPriorityInput(e.target.value)}
            onFocus={() => setPrioFocused(true)}
            onBlur={() => setPrioFocused(false)}
            style={{
              width:14,padding:'0 2px',fontSize:7,textAlign:'center',
              background:prioError?'#da363615':'#0d1117',
              border:`1px solid ${prioFocused?'#58a6ff':prioError?'#da3633':'#21262d'}`,
              borderRadius:2,color:'#c9d1d9',fontFamily:'inherit',outline:'none',
            }}
          />
          {parseFloat(susInfo.pct)>0 && <span style={{fontSize:6,color:'#f85149',fontWeight:700}}>{susInfo.pct}%S</span>}
          <span style={{fontSize:7,color:'#484f58'}}>{pool.lines.length}L·{risk.count}S</span>
        </div>
      </div>

      {/* Tags */}
      {tagKeys.length>0 && (
        <div style={{display:'flex',gap:2,flexWrap:'wrap'}}>
          {tagKeys.slice(0,4).map(t=>(
            <span key={t} style={{fontSize:6,padding:'0 3px',borderRadius:2,background:'#f0883e15',color:'#f0883e',fontWeight:600}}>{t.slice(0,4)} {tags[t]}</span>
          ))}
        </div>
      )}

      {/* Odds row */}
      <div ref={oRef} style={{display:'flex',gap:2,flexWrap:'wrap'}}>
        {topOdds.map(o=>(
          <div key={o.id} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:0}}>
            <span style={{fontSize:10,fontWeight:700,padding:'1px 3px',borderRadius:2,background:o.isSusp?'#da363633':o.isShort?'#f0883e22':'#23863622',color:o.isSusp?'#f85149':o.isShort?'#f0883e':'#3fb950',textDecoration:o.isSusp?'line-through':'none'}}>{o.display}</span>
            <span style={{fontSize:6,color:parseFloat(o.drift)>0?'#3fb950':parseFloat(o.drift)<0?'#f85149':'#484f58'}}>{o.drift>0?'+':''}{o.drift}%</span>
          </div>
        ))}
      </div>

      {/* Exposure bar */}
      <div style={{display:'flex',alignItems:'center',gap:3}}>
        <div style={{flex:1,height:3,background:'#0d1117',borderRadius:2,overflow:'hidden'}}>
          <div style={{width:`${Math.min(100,Math.abs(netExp)/2000)}%`,height:'100%',borderRadius:2,background:isPos?'#238636':'#da3633'}} />
        </div>
        <span style={{fontSize:8,fontWeight:600,minWidth:38,textAlign:'right',color:isPos?'#3fb950':'#f85149'}}>{isPos?'+':''}{(netExp/1000).toFixed(1)}k</span>
      </div>

      {/* Risk strip */}
      <div style={{display:'flex',justifyContent:'space-between',fontSize:7,color:'#484f58',padding:'1px 0'}}>
        <span>W<b style={{color:rc}}>{(risk.worst/1000).toFixed(0)}k</b></span>
        <span>B<b style={{color:'#3fb950'}}>{(risk.best/1000).toFixed(0)}k</b></span>
        <span>N<b style={{color:risk.net>=0?'#8b949e':'#f85149'}}>{(risk.net/1000).toFixed(0)}k</b></span>
        <span>μ<b style={{color:'#8b949e'}}>{(risk.avg/1000).toFixed(0)}k</b></span>
      </div>

      {/* History sparkline */}
      <div style={{display:'flex',gap:1,alignItems:'flex-end',height:12}}>
        {history.slice(0,10).map((h,i)=>(
          <div key={i} style={{width:3,background:h.position>=0?'#23863688':'#da363688',borderRadius:1,height:Math.max(2,Math.min(12,Math.abs(h.position)/10000))}} />
        ))}
      </div>

      {/* Client group segments — each has its own form input + effects */}
      <div ref={bRef} style={{display:'flex',flexWrap:'wrap',gap:2,marginTop:1}}>
        {exposure.map(g=>(
          <SegmentCell key={g.name} group={g} subTiers={subTiers} onOverride={() => {}} />
        ))}
      </div>

      {/* Footer */}
      <div ref={fRef} style={{fontSize:6,color:'#21262d',marginTop:'auto',display:'flex',justifyContent:'space-between'}}>
        <span>v{pool.metadata.version}</span>
        <span>{dims.w>0?`${Math.round(dims.w)}×${Math.round(dims.h)}`:''}</span>
      </div>
    </div>
  );
});

const SkeletonCell = React.memo(() => (
  <div style={{width:175,height:185,margin:3,borderRadius:6,background:'#12161f',animation:'pulse 1.2s ease-in-out infinite',border:'1px solid #1c2333'}} />
));

function StandardTest({ ids, onComplete }) {
  const reported = useRef(false);
  const startRef = useRef(performance.now());

  useEffect(() => {
    if (!reported.current) {
      requestAnimationFrame(() => {
        reported.current = true;
        onComplete(performance.now() - startRef.current);
      });
    }
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start' }}>
      {ids.map(id => <HeavyCell key={id} id={id} />)}
    </div>
  );
}

function BatchTest({ ids, initialBatch, onProgress, onComplete }) {
  const mounted = useBatchMount(ids, { initialBatch });

  // Ref-relay for parent callbacks — prevents effect dep churn
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const startRef = useRef(performance.now());
  const prevSize = useRef(0);
  const completed = useRef(false);

  useEffect(() => {
    const size = mounted.size;
    if (size === prevSize.current) return;
    prevSize.current = size;
    onProgressRef.current(size);
    if (size >= ids.length && !completed.current) {
      completed.current = true;
      onCompleteRef.current(performance.now() - startRef.current);
    }
  }, [mounted, ids.length]);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start' }}>
      {ids.map(id =>
        mounted.has(id)
          ? <HeavyCell key={id} id={id} />
          : <SkeletonCell key={id} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  APP
// ══════════════════════════════════════════════════════════════════════════

export default function App() {
  const [count, setCount] = useState(400);
  const [initialBatch, setInitialBatch] = useState(10);
  const [runKey, setRunKey] = useState(0);
  const [activeTest, setActiveTest] = useState(null);
  const [results, setResults] = useState({ standard: null, batch: null });
  const [batchProgress, setBatchProgress] = useState(0);
  const [debugInfo, setDebugInfo] = useState(null);

  const ids = useMemo(
    () => Array.from({ length: count }, (_, i) => `item:${i}`),
    [count]
  );

  const handleComplete = useCallback((mode, duration) => {
    setResults(prev => ({ ...prev, [mode]: duration }));
  }, []);

  const handleProgress = useCallback((n) => {
    setBatchProgress(n);
    setDebugInfo(__batchMountDebug.inspect());
  }, []);

  const runTest = (mode) => {
    __batchMountDebug.resetAdaptive();
    setActiveTest(null);
    setBatchProgress(0);
    setDebugInfo(null);
    setResults(prev => ({ ...prev, [mode]: null }));
    requestAnimationFrame(() => {
      setRunKey(k => k + 1);
      setActiveTest(mode);
    });
  };

  const pct = activeTest === 'batch' ? Math.round((batchProgress / count) * 100) : 0;
  const isRunning = activeTest && (
    (activeTest === 'standard' && results.standard == null) ||
    (activeTest === 'batch' && results.batch == null)
  );

  return (
    <div style={{
      minHeight: '100vh', padding: '32px 24px',
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      background: '#0c0e14', color: '#c9d1d9',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes cellPop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes pulse { 0%,100% { opacity: .4; } 50% { opacity: .12; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', margin: '0 0 6px' }}>
              useBatchMount
              <span style={{ color: '#484f58', fontWeight: 400 }}> — perf lab</span>
            </h1>
            <p style={{ fontSize: 12, color: '#484f58', maxWidth: 520, lineHeight: 1.6 }}>
              Standard React mounts all {count} components in one synchronous frame.
              useBatchMount spreads them across idle callbacks. Watch the spinner —
              if it freezes, the main thread is blocked.
            </p>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '3px solid #21262d', borderTopColor: '#58a6ff',
              animation: 'spin .8s linear infinite',
            }} />
            <div style={{ fontSize: 9, color: '#484f58', marginTop: 6, letterSpacing: 1 }}>THREAD</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: '#484f58', letterSpacing: 1, marginBottom: 10 }}>PARAMETERS</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ fontSize: 12 }}>
                <span style={{ color: '#484f58' }}>count</span>
                <input type="number" value={count} min={10} max={5000} step={100}
                  onChange={e => setCount(Math.max(10, +e.target.value))} disabled={!!isRunning}
                  style={{ display: 'block', width: 90, marginTop: 4, background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, color: '#c9d1d9', padding: '4px 8px', fontSize: 13, fontFamily: 'inherit' }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                <span style={{ color: '#484f58' }}>initialBatch</span>
                <input type="number" value={initialBatch} min={1} max={200} step={5}
                  onChange={e => setInitialBatch(Math.max(1, +e.target.value))} disabled={!!isRunning}
                  style={{ display: 'block', width: 90, marginTop: 4, background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, color: '#c9d1d9', padding: '4px 8px', fontSize: 13, fontFamily: 'inherit' }}
                />
              </label>
            </div>
          </div>
          <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 10, color: '#484f58', letterSpacing: 1, marginBottom: 10 }}>ACTIONS</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => runTest('standard')} disabled={!!isRunning}
                style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer', background: isRunning ? '#21262d' : '#da3633', color: '#fff', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: .5, opacity: isRunning ? .4 : 1 }}>
                STANDARD
              </button>
              <button onClick={() => runTest('batch')} disabled={!!isRunning}
                style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer', background: isRunning ? '#21262d' : '#238636', color: '#fff', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: .5, opacity: isRunning ? .4 : 1 }}>
                BATCH MOUNT
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          <Stat label="STANDARD" value={results.standard != null ? `${(results.standard / 1000).toFixed(2)}s` : '—'} color="#da3633" />
          <Stat label="BATCHED" value={results.batch != null ? `${(results.batch / 1000).toFixed(2)}s` : '—'} color="#238636" />
          <Stat label="PROGRESS"
            value={activeTest === 'batch' && results.batch == null ? `${batchProgress}/${count} (${pct}%)` : activeTest === 'standard' && results.standard == null ? 'rendering...' : '—'}
            color="#58a6ff" />
        </div>

        {debugInfo && activeTest === 'batch' && (
          <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: '10px 16px', marginBottom: 14, fontSize: 11, color: '#484f58', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <span>pending: <b style={{ color: '#c9d1d9' }}>{debugInfo.pending}</b></span>
            <span>threshold: <b style={{ color: '#c9d1d9' }}>{debugInfo.adaptedThreshold}ms</b></span>
            <span>warmup: <b style={{ color: debugInfo.warmupComplete ? '#3fb950' : '#d29922' }}>{debugInfo.warmupComplete ? 'done' : `${debugInfo.samplesCollected}/${SAMPLE_SIZE}`}</b></span>
          </div>
        )}

        {activeTest === 'batch' && results.batch == null && (
          <div style={{ height: 3, background: '#21262d', borderRadius: 2, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#238636', borderRadius: 2, transition: 'width .12s ease' }} />
          </div>
        )}

        <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: 10, minHeight: 320, display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start' }}>
          {!activeTest && <div style={{ margin: 'auto', color: '#30363d', fontSize: 13 }}>press a button to start</div>}
          {activeTest === 'standard' && <StandardTest key={`std-${runKey}`} ids={ids} onComplete={(d) => handleComplete('standard', d)} />}
          {activeTest === 'batch' && <BatchTest key={`batch-${runKey}`} ids={ids} initialBatch={initialBatch} onProgress={handleProgress} onComplete={(d) => handleComplete('batch', d)} />}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: '10px 16px' }}>
      <div style={{ fontSize: 9, color: '#484f58', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
