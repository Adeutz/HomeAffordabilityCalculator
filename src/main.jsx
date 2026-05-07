import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* HashRouter (instead of BrowserRouter) so this works on GitHub Pages
        without server-side routing. URLs look like #/page-name */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
