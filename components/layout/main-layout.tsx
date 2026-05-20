'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Users, Smartphone, Phone, LogOut, Settings, Menu, X, Cake, Ticket, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import { supabase } from '@/lib/supabase';

interface SidebarContentProps {
  navItems: { name: string; href: string; icon: any; badge?: number }[];
  user: any;
  profile: any;
  signOut: () => void;
  onItemClick?: () => void;
}

const SidebarContent = ({ navItems, user, profile, signOut, onItemClick }: SidebarContentProps) => (
  <div className="flex flex-col h-full bg-zinc-950 text-zinc-400">
    <div className="p-8">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Smartphone className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-xl font-black text-white tracking-tighter italic">BKO <span className="text-emerald-500">SYSTEM</span></h1>
      </div>
    </div>
    
    <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
      <div className="mb-4 px-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Menu Navigation</p>
      </div>
      {navItems.map((item) => (
        <Link 
          key={item.name} 
          href={item.href} 
          onClick={onItemClick}
          className="group flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all duration-200 hover:text-white hover:bg-zinc-900 active:scale-95 uppercase tracking-wider"
        >
          <div className="flex items-center gap-3">
            <item.icon className="w-5 h-5 transition-colors group-hover:text-emerald-500" />
            {item.name}
          </div>
          {item.badge && item.badge > 0 ? (
            <motion.span 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center w-5 h-5 bg-rose-500 text-white text-[10px] rounded-full shadow-lg shadow-rose-500/20"
            >
              {item.badge}
            </motion.span>
          ) : null}
        </Link>
      ))}
    </nav>

    <div className="p-4 mt-auto">
      <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white font-bold">
            {user.email?.[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user.email}</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">{profile?.role}</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2 h-10 border-zinc-700 hover:bg-zinc-800 hover:text-white text-zinc-400 rounded-xl"
          onClick={() => signOut()}
        >
          <LogOut className="w-4 h-4" />
          <span className="text-xs">Sair do Sistema</span>
        </Button>
      </div>
    </div>
  </div>
);

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [birthdayCount, setBirthdayCount] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
    
    if (user) {
      loadBirthdayCount();
    }
  }, [user, loading, router]);

  const loadBirthdayCount = async () => {
    try {
      const { data, error } = await supabase
        .from('colaboradores')
        .select('data_nascimento')
        .eq('status', 'ativo');

      if (error) throw error;

      if (data) {
        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayMD = `${month}-${day}`;

        const count = data.filter(c => {
          if (!c.data_nascimento) return false;
          // data_nascimento is YYYY-MM-DD
          return c.data_nascimento.endsWith(todayMD);
        }).length;

        setBirthdayCount(count);
      }
    } catch (err) {
      console.error('Error loading birthday count:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full" 
          />
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 animate-pulse">Iniciando BKO SYSTEM...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const navItems = [
    { name: 'Visão Geral', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Gestão de Pessoas', href: '/colaboradores', icon: Users },
    { name: 'Aniversariantes', href: '/aniversariantes', icon: Cake, badge: birthdayCount },
    { name: 'Inventário de Celulares', href: '/aparelhos', icon: Smartphone },
    { name: 'Controle de Linhas', href: '/linhas', icon: Phone },
    { name: 'Gestão de Vouchers', href: '/vouchers', icon: Ticket },
    { name: 'Cartas de Apresentação', href: '/cartas', icon: FileText },
    { name: 'Termos', href: '/termos', icon: FileText },
  ];

  if (profile?.role === 'ADMIN') {
    navItems.push({ name: 'Administração', href: '/admin/usuarios', icon: Settings });
  }

  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-900 antialiased overflow-hidden print:h-auto print:overflow-visible print:bg-white print:block">
      {/* Sidebar - Desktop */}
      <aside className="w-72 flex-shrink-0 hidden lg:flex print:hidden">
        <SidebarContent navItems={navItems} user={user} profile={profile} signOut={signOut} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 w-72 z-50 lg:hidden"
            >
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="absolute top-6 right-[-48px] text-white hover:bg-white/10"
              >
                <X className="w-6 h-6" />
              </Button>
              <SidebarContent 
                navItems={navItems} 
                user={user} 
                profile={profile} 
                signOut={signOut} 
                onItemClick={() => setIsMobileMenuOpen(false)} 
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 relative print:block print:w-full">
        {/* Header */}
        <header className="h-16 lg:h-20 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30 print:hidden">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden"
            >
              <Menu className="w-6 h-6" />
            </Button>
            <div className="hidden lg:block">
              <h2 className="text-sm font-black text-zinc-900 uppercase tracking-tight">Terminal Central</h2>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">BKO Admin v4.0.2</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex flex-col items-end px-3 py-1 border-r border-zinc-200">
              <span className="text-xs font-bold text-zinc-900">{user.email?.split('@')[0]}</span>
              <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-tighter">{profile?.role}</span>
            </div>
            <Button variant="ghost" size="icon" className="relative group">
              <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs group-hover:bg-emerald-100 transition-colors">
                {user.email?.[0].toUpperCase()}
              </div>
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8 custom-scrollbar relative print:overflow-visible print:p-0 print:m-0 print:block">
          {/* Subtle background element */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mr-48 -mt-48 print:hidden" />
          
          <div className="max-w-7xl mx-auto relative print:max-w-none print:w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
