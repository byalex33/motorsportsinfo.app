// PDF.js worker, bundled by Next as a module worker (see loadPdfjs in pdf-viewer.tsx). Importing the
// build is enough: it detects that it runs in a worker and starts listening for the main thread.
import "pdfjs-dist/build/pdf.worker.min.mjs";
