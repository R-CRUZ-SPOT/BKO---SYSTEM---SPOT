import type {Metadata} from 'next';
import './globals.css';
import { Plus_Jakarta_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from '@/components/ui/sonner';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Gestão de Ativos',
  description: 'Sistema de gestão de ativos e inventário corporativo.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR" className={cn("font-sans", plusJakartaSans.variable)}>
      <body suppressHydrationWarning className="antialiased selection:bg-emerald-100 selection:text-emerald-900">
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
