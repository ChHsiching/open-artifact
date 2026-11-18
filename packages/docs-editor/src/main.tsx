/** Entry point of the Docs editor page. */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Announcer } from '@open-artifact/editor-kit/react';
import { Toaster, TooltipProvider } from '@open-artifact/ui';
import { App } from './App.tsx';
import { bootDocsApp } from './app/start.ts';
import './features.ts';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');

void bootDocsApp();
createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <Toaster />
      <Announcer />
    </TooltipProvider>
  </StrictMode>,
);
