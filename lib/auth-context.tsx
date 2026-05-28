'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Session } from '@supabase/supabase-js';

type UserProfile = {
  id: string;
  email: string;
  role: 'ADMIN' | 'BKO';
};

interface AuthContextProps {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

// Inactivity timeout configuration (30 minutes)
const INACTIVITY_LIMIT = 30 * 60 * 1000;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const updateActivity = () => {
      sessionStorage.setItem('ais_last_activity', Date.now().toString());
    };

    const checkInactivity = async () => {
      const lastActivity = sessionStorage.getItem('ais_last_activity');
      let currentSession = null;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Session error:", error.message);
          await supabase.auth.signOut();
          if (mounted) {
            setSession(null);
            setUser(null);
            setProfile(null);
            setLoading(false);
          }
          return true; // Consider expired if error
        }
        currentSession = data.session;
      } catch (e) {
        console.error("Session catch error:", e);
        await supabase.auth.signOut();
        if (mounted) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
        return true;
      }
      
      if (currentSession && lastActivity) {
        const inactiveTime = Date.now() - parseInt(lastActivity, 10);
        if (inactiveTime > INACTIVITY_LIMIT) {
          console.log('Sessão expirada por inatividade');
          await supabase.auth.signOut();
          sessionStorage.removeItem('ais_last_activity');
          if (mounted) {
            setSession(null);
            setUser(null);
            setProfile(null);
            setLoading(false);
          }
          return true;
        }
      }
      return false;
    };

    async function getInitialSession() {
      const isExpired = await checkInactivity();
      if (isExpired) return;

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (mounted) {
          setSession(data.session);
          setUser(data.session?.user ?? null);
          if (data.session?.user) {
            updateActivity();
            fetchProfile(data.session.user.id);
          } else {
            setLoading(false);
          }
        }
      } catch (error) {
         console.error("Failed to get initial session:", error);
         await supabase.auth.signOut();
         if (mounted) {
            setSession(null);
            setUser(null);
            setProfile(null);
            setLoading(false);
         }
      }
    }

    getInitialSession();

    // Event listeners to track activity
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
      window.addEventListener(event, updateActivity);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Auth event:", event);
        if (event === 'SIGNED_OUT') {
           sessionStorage.removeItem('ais_last_activity');
        }
        
        if (mounted) {
          if (event === 'SIGNED_OUT') {
            setSession(null);
            setUser(null);
            setProfile(null);
            setLoading(false);
          } else {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
              updateActivity();
              fetchProfile(session.user.id);
            } else {
              setProfile(null);
              setLoading(false);
            }
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
      activityEvents.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (!error && data) {
        setProfile(data as UserProfile);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    sessionStorage.removeItem('ais_last_activity');
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
