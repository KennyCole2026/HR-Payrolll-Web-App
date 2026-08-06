import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/auth-context';
import AuthPage from '@/auth-page';
import Dashboard from '@/dashboard';
import { testSupabaseConnection } from '@/supabase-client';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { session, loading } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    testSupabaseConnection().then(setConnected);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!session) {
    return <AuthPage onAuthSuccess={() => {}} />;
  }

  return <Dashboard />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
