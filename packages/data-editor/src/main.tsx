/** Entry point of the Data editor page: starts the editor and renders it at once (it shows its own opening state). */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster, TooltipProvider } from '@open-artifact/ui';
import { App } from './App.tsx';
import { bootDataApp } from './app/start.ts';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');

bootDataApp();
createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <Toaster />
    </TooltipProvider>
  </StrictMode>,
);
