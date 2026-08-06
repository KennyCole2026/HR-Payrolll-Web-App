import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/supabase-client';

interface CompanyMembership {
  company_id: string;
  company_name: string;
  role: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  isSuperAdmin: boolean;
  companies: CompanyMembership[];
  activeCompanyId: string | null;
  loading: boolean;
  setActiveCompanyId: (id: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [companies, setCompanies] = useState<CompanyMembership[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadUserData(s.user);
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      (async () => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          await loadUserData(s.user);
        } else {
          setIsSuperAdmin(false);
          setCompanies([]);
          setActiveCompanyId(null);
          setLoading(false);
        }
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadUserData(u: User) {
    setLoading(true);
    try {
      const { data: adminData } = await supabase
        .from('super_admins')
        .select('email')
        .eq('email', u.email ?? '')
        .maybeSingle();

      const admin = !!adminData;
      setIsSuperAdmin(admin);

      if (admin) {
        const { data: allCompanies } = await supabase
          .from('companies')
          .select('id, name')
          .order('name');

        const memberships: CompanyMembership[] = (allCompanies ?? []).map((c: { id: string; name: string }) => ({
          company_id: c.id,
          company_name: c.name,
          role: 'super_admin',
        }));
        setCompanies(memberships);
        setActiveCompanyId(memberships[0]?.company_id ?? null);
      } else {
        const { data: ucData } = await supabase
          .from('user_companies')
          .select('company_id, role, companies(name)')
          .eq('user_id', u.id);

        const memberships: CompanyMembership[] = (ucData ?? []).map((row: {
          company_id: string;
          role: string;
          companies: { name: string } | { name: string }[] | null;
        }) => {
          const companyName = Array.isArray(row.companies)
            ? row.companies[0]?.name ?? 'Unknown'
            : row.companies?.name ?? 'Unknown';
          return {
            company_id: row.company_id,
            company_name: companyName,
            role: row.role,
          };
        });
        setCompanies(memberships);
        setActiveCompanyId(memberships[0]?.company_id ?? null);
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setIsSuperAdmin(false);
    setCompanies([]);
    setActiveCompanyId(null);
  }

  return (
    <AuthContext.Provider
      value={{ session, user, isSuperAdmin, companies, activeCompanyId, loading, setActiveCompanyId, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
