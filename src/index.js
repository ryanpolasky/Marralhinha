import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { register } from './serviceWorkerRegistration';
// The gitignored local preview gallery loads only when the file exists, so fresh checkouts still build
const localModules = require.context('./', false, /^\.\/Previews\.js$/);
const Previews = localModules.keys().length ? localModules('./Previews.js').default : null;
const preview = Previews && window.location.hash.startsWith('#preview');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode>{preview ? <Previews /> : <App />}</React.StrictMode>);

reportWebVitals();
register((registration) => window.dispatchEvent(new CustomEvent('sw-update', { detail: registration })));
