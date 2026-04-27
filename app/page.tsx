'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      toast.success('Acesso autorizado. Bem-vindo ao BKO SYSTEM.');
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Falha na autenticação');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
         <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center relative overflow-hidden px-4">
      {/* Decorative background */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[100px]" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8">
           <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-xl shadow-emerald-500/40 mb-6">
              <span className="text-white font-black text-2xl italic tracking-tighter">BKO</span>
           </div>
           <h2 className="text-center text-4xl font-black text-white italic tracking-tighter uppercase leading-none">
            BKO <span className="text-emerald-500">SYSTEM</span>
          </h2>
          <p className="mt-4 text-center text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">
            Backoffice Management • Logistics • Inventory
          </p>
        </div>

        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl rounded-[2.5rem] shadow-2xl p-2">
          <CardHeader className="pt-8 px-8">
            <CardTitle className="text-lg font-black uppercase tracking-tight text-white leading-none">Autenticação</CardTitle>
            <CardDescription className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">Portal de Acesso Restrito</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-6 px-8 pb-8">
              <div className="space-y-3">
                <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Identificação (E-mail)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@system.com"
                  className="h-14 bg-zinc-800/50 border-zinc-700 rounded-2xl text-white focus:ring-emerald-500/20 px-6 font-medium"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="password" title="password" className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Chave de Segurança</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="h-14 bg-zinc-800/50 border-zinc-700 rounded-2xl text-white focus:ring-emerald-500/20 px-6"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest shadow-xl shadow-emerald-600/20 transition-all active:scale-[0.98]" disabled={submitting}>
                {submitting ? 'PROCESSANDO...' : 'ACESSAR TERMINAL'}
              </Button>
            </CardContent>
          </form>
        </Card>
        
        <p className="mt-8 text-center text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
          © 2026 INTERNAL USE ONLY • SECURE ENVIRONMENT
        </p>
      </div>
    </div>
  );
}
