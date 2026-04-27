'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { ShieldCheck, Mail, Calendar, UserPlus, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dataCache } from '@/lib/data-cache';

export default function UsuariosAdminPage() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role === 'ADMIN') {
      loadProfiles();
    }
  }, [profile?.role]);

  async function loadProfiles() {
    const cached = dataCache.get<any[]>('admin_profiles');
    if (cached) {
      setProfiles(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setProfiles(data || []);
      dataCache.set('admin_profiles', data || []);
    } catch (error) {
      toast.error('Erro ao carregar perfis');
    } finally {
      setLoading(false);
    }
  }

  if (profile?.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
        <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center">
          <ShieldCheck className="w-8 h-8 text-rose-500" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-zinc-900">Acesso Restrito</h2>
          <p className="text-zinc-500 max-w-xs mx-auto text-sm">Esta área é exclusiva para administradores do sistema. Se você acredita que deveria ter acesso, entre em contato com o gestor de TI.</p>
        </div>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => window.location.href = '/dashboard'}>
          Voltar ao Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Privilégios & Acessos</h1>
          <p className="text-sm text-zinc-500">Gerenciamento centralizado de usuários e permissões de sistema.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl border-zinc-200">
            <UserPlus className="w-4 h-4 mr-2 text-zinc-500" />
            Vincular Usuário
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white/50 backdrop-blur-sm">
        <CardHeader className="py-6 px-6 border-b border-zinc-100 bg-white/80 flex flex-row items-center gap-2">
          <Info className="w-4 h-4 text-emerald-600" />
          <p className="text-xs font-medium text-zinc-500 tracking-wide uppercase">
            Lista de usuários registrados na plataforma
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table
            containerClassName="max-h-[calc(100vh-320px)] overflow-auto custom-scrollbar"
            className="min-w-[800px] border-separate border-spacing-0 relative"
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">Usuário</TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">Perfil de Acesso</TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">Data de Registro</TableHead>
                <TableHead className="sticky top-0 z-50 bg-white py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-zinc-500 text-right border-b border-zinc-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-20">
                      <div className="flex flex-col items-center gap-3">
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                        <span className="text-xs font-medium text-zinc-400">Autenticando permissões...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : profiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-20 text-zinc-400 text-sm">
                      Nenhum usuário encontrado na base de dados.
                    </TableCell>
                  </TableRow>
                ) : (
                  profiles.map((p, idx) => (
                    <motion.tr 
                      key={p.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors"
                    >
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                            <Mail className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-zinc-900 text-sm group-hover:text-emerald-600 transition-colors uppercase">{p.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${
                          p.role === 'ADMIN' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}>
                          <span className={`w-1 h-1 rounded-full mr-1.5 ${p.role === 'ADMIN' ? 'bg-indigo-500' : 'bg-blue-500'}`} />
                          {p.role}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-zinc-500">
                          <Calendar className="w-3.5 h-3.5 opacity-50" />
                          {new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">ATIVO</span>
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
      </Card>
    </div>
  );
}
