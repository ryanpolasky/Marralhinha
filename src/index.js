import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
// Local-only preview galleries must not be imported by the production entry point.
// To view them, restore the commented wiring below and open http://localhost:3000/#preview
// import Previews from './Previews';
// const preview = window.location.hash.startsWith('#preview');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/*preview ? <Previews /> : */}<App />
  </React.StrictMode>
);

reportWebVitals();
