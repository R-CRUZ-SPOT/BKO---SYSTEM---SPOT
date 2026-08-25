export interface RoteiroEntry {
  nome?: string;
  nom_pessoa_completo?: string;
  rede?: string;
  nom_fantasia?: string;
  end_logradouro?: string;
  supervisor?: string;
  uf?: string;
}

const HEADER_MAP: Record<string, keyof RoteiroEntry> = {
  NOME: 'nome',
  NOM_PESSOA_COMPLETO: 'nom_pessoa_completo',
  REDE: 'rede',
  NOM_FANTASIA: 'nom_fantasia',
  END_LOGRADOURO: 'end_logradouro',
  SUPERVISOR: 'supervisor',
  UF: 'uf',
};

export async function parseRoteiroFile(file: File): Promise<RoteiroEntry[]> {
  // Loaded on demand so the (large) xlsx parser only ships once the user actually uploads a spreadsheet.
  const XLSX = await import('xlsx');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetNameBase = workbook.SheetNames.find(s => s.trim().toUpperCase() === 'BASE');
        const sheetName = sheetNameBase || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, unknown>[];

        const normalizedData: RoteiroEntry[] = jsonData.map(row => {
          const newRow: RoteiroEntry = {};
          for (const key in row) {
            const normalizedKey = key.trim().toUpperCase();
            const mappedKey = HEADER_MAP[normalizedKey];
            if (mappedKey) {
              newRow[mappedKey] = String(row[key] ?? '');
            }
          }
          return newRow;
        });

        resolve(normalizedData);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

export function matchColaboradorRows(roteiro: RoteiroEntry[], colaboradorNome: string): RoteiroEntry[] {
  const colabName = normalizeName(colaboradorNome);
  return roteiro.filter(r => {
    const n1 = normalizeName(r.nome || '');
    const n2 = normalizeName(r.nom_pessoa_completo || '');
    return n1 === colabName || n2 === colabName;
  });
}

export function buildSupervisorUfIndex(roteiro: RoteiroEntry[]): Map<string, { supervisor: string; uf: string }> {
  const index = new Map<string, { supervisor: string; uf: string }>();
  roteiro.forEach(r => {
    const n1 = normalizeName(r.nome || '');
    const n2 = normalizeName(r.nom_pessoa_completo || '');
    const entry = { supervisor: r.supervisor || '', uf: r.uf || '' };
    if (n1 && !index.has(n1)) index.set(n1, entry);
    if (n2 && !index.has(n2)) index.set(n2, entry);
  });
  return index;
}
