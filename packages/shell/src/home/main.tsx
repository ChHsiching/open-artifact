/** Entry point of the daemon's home page (`/`). */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster, TooltipProvider } from '@open-artifact/ui';
import { locale } from '../lib/i18n.ts';
import { App } from './App.tsx';
import '../styles.css';

document.documentElement.lang = locale;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <Toaster>
        <App />
      </Toaster>
    </TooltipProvider>
  </StrictMode>,
);
