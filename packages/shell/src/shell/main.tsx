/** Entry point of the Shell page (`/a/<id>`); the daemon injects the boot as `window.__OPEN_ARTIFACT_BOOT__`. */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster, TooltipProvider } from '@open-artifact/ui';
import { locale } from '../lib/i18n.ts';
import { loadBoot } from './actions.ts';
import { App } from './App.tsx';
import '../styles.css';

document.documentElement.lang = locale;
void loadBoot();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <Toaster>
        <App />
      </Toaster>
    </TooltipProvider>
  </StrictMode>,
);
