import type { RefObject } from 'react';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

interface GeneratePdfZipParams<T> {
  items: T[];
  renderContainerRef: RefObject<HTMLDivElement | null>;
  renderItem: (item: T) => void;
  waitForRender: () => Promise<void>;
  getFilename: (item: T, index: number) => string;
  zipFilename: string;
  onProgress?: (done: number, total: number) => void;
}

const DIACRITICS_REGEX = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const MM_TO_PX = 96 / 25.4;
const EXPECTED_WIDTH_PX = Math.round(A4_WIDTH_MM * MM_TO_PX);

async function captureCanvas(
  container: HTMLElement,
  html2canvas: typeof import('html2canvas-pro').default
) {
  // Pin the render viewport to the document's own width (210mm) so html2canvas-pro's
  // internal clone always lays out the same way, regardless of the current window size
  // or any transient layout state of the off-screen capture container.
  return html2canvas(container, {
    scale: 2,
    useCORS: true,
    width: EXPECTED_WIDTH_PX,
    windowWidth: EXPECTED_WIDTH_PX,
  });
}

async function elementToPdfBlob(
  container: HTMLElement,
  html2canvas: typeof import('html2canvas-pro').default,
  JsPdf: typeof import('jspdf').default
): Promise<Blob> {
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  let canvas = await captureCanvas(container, html2canvas);

  // Defensive retry: if the capture raced ahead of the stylesheet/layout for this
  // item, the container comes out unstyled and much wider/flatter than a real
  // A4 page. Give layout a bit more time and try once more before accepting it.
  const expectedRatio = A4_WIDTH_MM / A4_HEIGHT_MM;
  if (canvas.width / canvas.height > expectedRatio * 2.5) {
    await new Promise(resolve => setTimeout(resolve, 400));
    canvas = await captureCanvas(container, html2canvas);
  }

  const pdf = new JsPdf({ unit: 'mm', format: 'a4' });
  const pageHeightPx = (canvas.width / A4_WIDTH_MM) * A4_HEIGHT_MM;
  const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = Math.min(pageHeightPx, canvas.height - page * pageHeightPx);
    const ctx = sliceCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(
        canvas,
        0, page * pageHeightPx, canvas.width, sliceCanvas.height,
        0, 0, canvas.width, sliceCanvas.height
      );
    }
    const sliceData = sliceCanvas.toDataURL('image/png');
    const sliceHeightMm = (sliceCanvas.height / canvas.width) * A4_WIDTH_MM;
    pdf.addImage(sliceData, 'PNG', 0, 0, A4_WIDTH_MM, sliceHeightMm);
  }

  return pdf.output('blob');
}

export async function generatePdfZip<T>({
  items,
  renderContainerRef,
  renderItem,
  waitForRender,
  getFilename,
  zipFilename,
  onProgress,
}: GeneratePdfZipParams<T>): Promise<void> {
  // Loaded on demand so jsPDF/html2canvas-pro/JSZip/file-saver never ship in the
  // initial bundle for people who only use the individual (non-bulk) flow.
  const [{ default: JSZip }, fileSaverModule, { default: JsPdf }, { default: html2canvas }] = await Promise.all([
    import('jszip'),
    import('file-saver'),
    import('jspdf'),
    import('html2canvas-pro'),
  ]);
  // file-saver's CJS/ESM interop shape varies by bundler, so resolve saveAs defensively.
  const fileSaverAny = fileSaverModule as unknown as Record<string, unknown>;
  const saveAs = (fileSaverAny.saveAs
    || (fileSaverAny.default as Record<string, unknown> | undefined)?.saveAs
    || fileSaverAny.default) as (blob: Blob, filename: string) => void;

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    renderItem(item);
    await waitForRender();

    const container = renderContainerRef.current;
    if (!container) continue;

    const blob = await elementToPdfBlob(container, html2canvas, JsPdf);

    let filename = getFilename(item, i);
    if (usedNames.has(filename)) {
      filename = filename.replace(/\.pdf$/, `-${i}.pdf`);
    }
    usedNames.add(filename);

    zip.file(filename, blob);
    onProgress?.(i + 1, items.length);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, zipFilename);
}
