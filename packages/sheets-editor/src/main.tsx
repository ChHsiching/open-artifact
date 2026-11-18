import { connectSheetsHost } from './host/sheets-host.ts';
import { bootSheetsPage } from './app/boot.ts';
import './styles.css';

const app = document.getElementById('app');
if (app === null) throw new Error('missing #app');

const host = await connectSheetsHost();
await bootSheetsPage({ host, app });
