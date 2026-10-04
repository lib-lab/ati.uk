import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { adapters } from './adapters';
import { store } from './store/store';
import { App } from './ui/App';
import { startEmailDelivery } from './ui/emailDelivery';
import { applyTheme, initialTheme } from './ui/theme';
import './ui/tokens.css';
import './ui/styles.css';

applyTheme(initialTheme()); // before the first render: no flash of the other theme
startEmailDelivery(store, adapters.email);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
