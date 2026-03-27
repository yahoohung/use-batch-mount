import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store.js';
import App from './App';
import POC from './POC';
import POCRedux from './POCRedux';
import './index.css';

const Root = () => {
  const [view, setView] = useState('poc-redux'); // Default to POC Redux

  return (
    <Provider store={store}>
      <div>
        <div style={{ background: '#21262d', padding: '10px 20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <strong style={{ color: 'white' }}>Navigation:</strong>
          <button 
            onClick={() => setView('app')}
            style={{ background: view === 'app' ? '#58a6ff' : 'transparent', color: view === 'app' ? '#0d1117' : '#58a6ff' }}
          >
            Basic Benchmark
          </button>
          <button 
            onClick={() => setView('poc')}
            style={{ background: view === 'poc' ? '#58a6ff' : 'transparent', color: view === 'poc' ? '#0d1117' : '#58a6ff' }}
          >
            Cloud Hierarchy POC
          </button>
          <button 
            onClick={() => setView('poc-redux')}
            style={{ background: view === 'poc-redux' ? '#58a6ff' : 'transparent', color: view === 'poc-redux' ? '#0d1117' : '#58a6ff' }}
          >
            Redux Nested POC
          </button>
        </div>
        {view === 'app' ? <App /> : view === 'poc' ? <POC /> : <POCRedux />}
      </div>
    </Provider>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
