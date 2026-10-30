const ARTE_BASE_URL = '/aniversario/arte-base.jpg';

// Área da foto e da tarja do nome na arte-base (coordenadas em px da imagem 1322x1190)
// Vão interno do quadro; a foto é desenhada um pouco maior (por baixo da moldura) e a moldura
// colorida (PNG com transparência, recortada da arte) é aplicada por cima, sem frestas.
const FOTO = { x: 812, y: 202, w: 413, h: 551, r: 68 };
const FOTO_EXTRA = 8;
const MOLDURA_URL = '/aniversario/arte-moldura.png';
const MOLDURA_POS = { x: 780, y: 170 };
const NOME = { cx: 341, cy: 434, maxW: 560 };

// Caixa onde a frase de felicitação é escrita (a arte-base vem sem a frase)
const FRASE_BOX = { x: 66, y: 506, w: 560, h: 216, maxLinhas: 5 };
const FRASE_COR = '#0f3d89';

interface FraseAniversario {
  texto: string;
  // Assinatura original da arte desta frase (PNG com fundo transparente) e posição na arte-base
  assinatura: { url: string; x: number; y: number };
}

export const FRASES_ANIVERSARIO: FraseAniversario[] = [
  {
    texto: 'Que a felicidade te acompanhe em todos os dias e que este novo ciclo te traga ainda mais motivos para sorrir!',
    assinatura: { url: '/aniversario/assinatura-1.png', x: 46, y: 720 }, // Você merece o melhor!
  },
  {
    texto: 'Que seu dia seja especial do jeito que você merece! Saúde, paz, sucesso e muitas realizações sempre!',
    assinatura: { url: '/aniversario/assinatura-2.png', x: 80, y: 723 }, // Parabéns!
  },
  {
    texto: 'Que seu dia seja repleto de alegria, boas surpresas e tudo aquilo que te faz bem!',
    assinatura: { url: '/aniversario/assinatura-3.png', x: 79, y: 758 }, // Parabéns!
  },
  {
    texto: 'Que este novo ciclo seja marcado por muitas conquistas, realizações e momentos especiais!',
    assinatura: { url: '/aniversario/assinatura-4.png', x: 79, y: 735 }, // Você faz a diferença!
  },
  {
    texto: 'Que seu dia seja doce, leve e cheio de boas energias. Você merece todo o sucesso do mundo!',
    assinatura: { url: '/aniversario/assinatura-5.png', x: 73, y: 765 }, // Parabéns!
  },
];

const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'di', 'du', 'e']);

const FILA_KEY = 'arte_aniversario_fila_frases';

/**
 * Rodízio das frases: sorteia sem repetir até todas terem sido usadas (fila embaralhada, guardada
 * no navegador). Ao esvaziar, reembaralha garantindo que a primeira nova não repita a última usada.
 */
export function proximaFrase(): FraseAniversario {
  const total = FRASES_ANIVERSARIO.length;
  let fila: number[] = [];
  let ultima = -1;
  try {
    const salvo = JSON.parse(localStorage.getItem(FILA_KEY) || 'null');
    if (salvo && Array.isArray(salvo.fila)) {
      fila = salvo.fila.filter((i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < total);
      ultima = Number.isInteger(salvo.ultima) ? salvo.ultima : -1;
    }
  } catch {}

  if (fila.length === 0) {
    fila = Array.from({ length: total }, (_, i) => i);
    for (let i = fila.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fila[i], fila[j]] = [fila[j], fila[i]];
    }
    if (total > 1 && fila[0] === ultima) [fila[0], fila[1]] = [fila[1], fila[0]];
  }

  const idx = fila.shift() as number;
  try {
    localStorage.setItem(FILA_KEY, JSON.stringify({ fila, ultima: idx }));
  } catch {}
  return FRASES_ANIVERSARIO[idx];
}

function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, maxW: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && ctx.measureText(tentativa).width > maxW) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = tentativa;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

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
export async function gerarArteAniversario(nome: string, fotoUrl?: string | null, frase: FraseAniversario = proximaFrase()): Promise<Blob> {
  // Usa a mesma fonte do sistema (Plus Jakarta Sans via next/font), com Arial de reserva
  const familia = `${getComputedStyle(document.documentElement).fontFamily}, Arial, Helvetica, sans-serif`;
  try {
    await document.fonts.load(`700 40px ${familia}`);
  } catch {}
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
  const partes = nome.trim().split(/\s+/);
  // Com partícula (da, de, do...) no nome usa primeiro + último; senão, primeiro + segundo
  const temParticula = partes.slice(1).some(w => PARTICULAS.has(w.toLowerCase()));
  const escolhidas = temParticula && partes.length > 2 ? [partes[0], partes[partes.length - 1]] : partes.slice(0, 2);
  const texto = escolhidas.join(' ').toUpperCase();
  let size = 56;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  do {
    ctx.font = `800 ${size}px ${familia}`;
    size -= 1;
  } while (ctx.measureText(texto).width > NOME.maxW && size > 16);
  ctx.fillText(texto, NOME.cx, NOME.cy + 3);

  // Frase de felicitação: reduz a fonte até caber na caixa
  ctx.fillStyle = FRASE_COR;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let fonte = 40;
  let linhas: string[] = [];
  let passo = 0;
  for (; fonte >= 24; fonte -= 1) {
    ctx.font = `700 ${fonte}px ${familia}`;
    linhas = quebrarLinhas(ctx, frase.texto, FRASE_BOX.w);
    passo = fonte * 1.14;
    if (linhas.length <= FRASE_BOX.maxLinhas && linhas.length * passo <= FRASE_BOX.h) break;
  }
  linhas.forEach((linha, i) => ctx.fillText(linha, FRASE_BOX.x, FRASE_BOX.y + fonte * 0.9 + i * passo));

  // Assinatura original da frase (Parabéns!, Você merece o melhor!, etc.)
  try {
    const assinatura = await loadImage(frase.assinatura.url);
    ctx.drawImage(assinatura, frase.assinatura.x, frase.assinatura.y);
  } catch (e) {
    console.warn('Assinatura da arte não pôde ser carregada.', e);
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), 'image/png')
  );
}
