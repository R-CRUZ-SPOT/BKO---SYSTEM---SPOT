const ARTE_BASE_URL = '/aniversario/arte-base.jpg';

// Área da foto e da tarja do nome na arte-base (coordenadas em px da imagem 1322x1190)
// Vão interno do quadro; a foto é desenhada um pouco maior (por baixo da moldura) e a moldura
// colorida (PNG com transparência, recortada da arte) é aplicada por cima, sem frestas.
const FOTO = { x: 812, y: 202, w: 413, h: 551, r: 68 };
const FOTO_EXTRA = 8;
const MOLDURA_URL = '/aniversario/arte-moldura.png';
const MOLDURA_POS = { x: 780, y: 170 };
const NOME = { cx: 341, cy: 434, maxW: 560 };

function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
    img.src = src;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Monta a arte de aniversário com a foto e o nome do colaborador e devolve um PNG. */
export async function gerarArteAniversario(nome: string, fotoUrl?: string | null): Promise<Blob> {
  const base = await loadImage(ARTE_BASE_URL);
  const scale = 1;
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth * scale;
  canvas.height = base.naturalHeight * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(scale, scale);
  ctx.drawImage(base, 0, 0);

  // Foto (cover-crop dentro do quadro arredondado). Sem foto, mantém o avatar padrão da arte.
  if (fotoUrl) {
    try {
      const foto = await loadImage(fotoUrl, true);
      const dw = FOTO.w + 2 * FOTO_EXTRA;
      const dh = FOTO.h + 2 * FOTO_EXTRA;
      const ratio = Math.max(dw / foto.naturalWidth, dh / foto.naturalHeight);
      const sw = dw / ratio;
      const sh = dh / ratio;
      const sx = (foto.naturalWidth - sw) / 2;
      const sy = Math.max(0, (foto.naturalHeight - sh) / 3); // favorece o rosto (parte de cima)
      ctx.save();
      ctx.beginPath();
      roundedRect(ctx, FOTO.x - FOTO_EXTRA, FOTO.y - FOTO_EXTRA, FOTO.w + 2 * FOTO_EXTRA, FOTO.h + 2 * FOTO_EXTRA, FOTO.r + FOTO_EXTRA);
      ctx.clip();
      ctx.drawImage(foto, sx, sy, sw, sh, FOTO.x - FOTO_EXTRA, FOTO.y - FOTO_EXTRA, FOTO.w + 2 * FOTO_EXTRA, FOTO.h + 2 * FOTO_EXTRA);
      ctx.restore();

      // Moldura colorida por cima da foto
      const moldura = await loadImage(MOLDURA_URL);
      ctx.drawImage(moldura, MOLDURA_POS.x, MOLDURA_POS.y);
    } catch (e) {
      console.warn('Foto do colaborador não pôde ser carregada, usando avatar padrão da arte.', e);
    }
  }

  // Nome, reduzindo a fonte até caber na tarja
  const texto = nome.trim().toUpperCase();
  let size = 56;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  do {
    ctx.font = `800 ${size}px Arial, Helvetica, sans-serif`;
    size -= 1;
  } while (ctx.measureText(texto).width > NOME.maxW && size > 16);
  ctx.fillText(texto, NOME.cx, NOME.cy + 3);

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), 'image/png')
  );
}
