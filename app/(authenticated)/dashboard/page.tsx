'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Smartphone, Phone, ArrowUpRight, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { dataCache } from '@/lib/data-cache';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    colaboradores: 0,
    aparelhos: 0,
    linhas: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const cached = dataCache.get<any>('dashboard_stats');
      if (cached) {
        setStats(cached);
        setLoading(false);
      }

      try {
        const [{ count: colCount }, { count: apCount }, { count: linCount }] = await Promise.all([
          supabase.from('colaboradores').select('*', { count: 'exact', head: true }),
          supabase.from('aparelhos').select('*', { count: 'exact', head: true }),
          supabase.from('linhas').select('*', { count: 'exact', head: true }),
        ]);

        const newStats = {
          colaboradores: colCount || 0,
          aparelhos: apCount || 0,
          linhas: linCount || 0,
        };
        
        setStats(newStats);
        dataCache.set('dashboard_stats', newStats);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
          <TrendingUp className="w-4 h-4" />
          <span className="uppercase tracking-wider">Dashboard de Ativos</span>
        </div>
        <h1 className="text-3xl font-bold text-zinc-900">Visão Geral do Sistema</h1>
        <p className="text-zinc-500 text-sm">
          Resumo em tempo real do seu inventário de ativos corporativos em {format(new Date(), "dd 'de' MMMM", { locale: ptBR })}.
        </p>
      </div>
      
      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <motion.div variants={item}>
          <Card className="relative overflow-hidden border-none shadow-sm bg-white hover:shadow-md transition-shadow duration-300">
            <div className="absolute top-0 right-0 p-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-400">Pessoas Ativas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-zinc-900">{loading ? '...' : stats.colaboradores}</span>
                <span className="text-xs font-medium text-emerald-600 flex items-center gap-0.5">
                  <ArrowUpRight className="w-3 h-3" />
                  Total
                </span>
              </div>
              <div className="mt-4 h-1 w-full bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '70%' }} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="relative overflow-hidden border-none shadow-sm bg-white hover:shadow-md transition-shadow duration-300">
            <div className="absolute top-0 right-0 p-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-400">Inventário de Celulares</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-zinc-900">{loading ? '...' : stats.aparelhos}</span>
                <span className="text-xs font-medium text-emerald-600 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  Unidades
                </span>
              </div>
              <div className="mt-4 h-1 w-full bg-purple-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: '55%' }} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="relative overflow-hidden border-none shadow-sm bg-white hover:shadow-md transition-shadow duration-300">
            <div className="absolute top-0 right-0 p-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Phone className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-400">Linhas Telefônicas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-zinc-900">{loading ? '...' : stats.linhas}</span>
                <span className="text-xs font-medium text-emerald-600 flex items-center gap-0.5">
                  <ArrowUpRight className="w-3 h-3" />
                  Ativas
                </span>
              </div>
              <div className="mt-4 h-1 w-full bg-emerald-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '85%' }} />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Placeholder for more content to look more "modern"/complete */}
      <motion.div variants={item} initial="hidden" animate="show" transition={{ delay: 0.4 }}>
        <Card className="border-none shadow-sm bg-zinc-900 text-white overflow-hidden">
          <div className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-4">
              <h3 className="text-2xl font-bold leading-tight">Mantenha seu inventário organizado.</h3>
              <p className="text-zinc-400 max-w-md">
                Vincule aparelhos e linhas a colaboradores em segundos. Gere relatórios detalhados para sua gestão com apenas um clique.
              </p>
              <div className="flex gap-3 pt-2">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Ultima Atualização</span>
                  <span className="text-sm font-medium">Agora mesmo</span>
                </div>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20" />
                <Smartphone className="w-32 h-32 text-emerald-500 relative animate-bounce" style={{ animationDuration: '3s' }} />
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
