import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './index.css';
import App from './App';
import { register } from './serviceWorkerRegistration';
// The gitignored local preview/promo pages load only when the files exist, so fresh checkouts still build
const localModules = require.context('./', false, /^\.\/(Previews|Promo)\.js$/);
const localPage = (name) => (localModules.keys().includes(`./${name}.js`) ? localModules(`./${name}.js`).default : null);
const Page = window.location.hash.startsWith('#promo') ? localPage('Promo') : window.location.hash.startsWith('#preview') ? localPage('Previews') : null;
const Analytics = lazy(() => import('./components/Analytics'));
const isAnalytics = window.location.pathname.replace(/\/+$/, '') === '/analytics';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode>{Page ? <Page /> : isAnalytics ? <Suspense fallback={null}><Analytics /></Suspense> : <App />}</React.StrictMode>);

register((registration) => window.dispatchEvent(new CustomEvent('sw-update', { detail: registration })));
