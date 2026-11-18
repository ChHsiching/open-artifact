/**
 * PDF.js, which import-pdf.ts loads only when a PDF is imported. The legacy build is the one made for Node; with no
 * real worker there, it runs its worker's code here, found through this global.
 */
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
// @ts-expect-error The package has no types for its worker, and only this global uses it.
import * as worker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;

export { getDocument, OPS };
