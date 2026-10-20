'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAcertosPendentes } from '@/hooks/use-acertos-pendentes';

const abas = [
  { nome: 'Cálculo do Mês', href: '/ajuda-de-custo' },
  { nome: 'Dashboard', href: '/ajuda-de-custo/dashboard' },
  { nome: 'Valores por Dia', href: '/ajuda-de-custo/valores' },
  { nome: 'Ocorrências', href: '/ajuda-de-custo/ocorrencias' },
  { nome: 'Acertos', href: '/ajuda-de-custo/complementos' },
  { nome: 'Feriados', href: '/ajuda-de-custo/feriados' },
  { nome: 'Praças', href: '/ajuda-de-custo/pracas' },
  { nome: 'Histórico', href: '/ajuda-de-custo/historico' },
];

export default function AjudaDeCustoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const acertosPendentes = useAcertosPendentes();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
          <Wallet className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tight leading-none">Ajuda de Custo</h1>
          <p className="text-xs text-zinc-500 mt-1">Transporte dos promotores: valores, ocorrências e lançamento mensal</p>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 print:hidden">
        {abas.map((aba) => {
          const ativa = aba.href === '/ajuda-de-custo' ? pathname === aba.href : pathname.startsWith(aba.href);
          return (
            <Link
              key={aba.href}
              href={aba.href}
              className={cn(
                'px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap border-b-2 -mb-px transition-colors',
                ativa ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-zinc-500 hover:text-zinc-900'
              )}
            >
              {aba.nome}
              {aba.href.endsWith('/complementos') && acertosPendentes > 0 && (
                <span
                  title={`${acertosPendentes} promotor(es) com diferença de valor a acertar`}
                  className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow-lg shadow-rose-500/20 align-middle"
                >
                  {acertosPendentes}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
