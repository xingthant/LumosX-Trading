import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getStoredUser, setStoredUser, setToken, clearToken, getToken } from './api';

interface User {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, referralCode?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) setUser(await getStoredUser<User>());
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
    await setToken(res.token);
    await setStoredUser(res.user);
    setUser(res.user);
  }

  async function register(email: string, password: string, referralCode?: string) {
    const res = await api.post<{ token: string; user: User }>('/api/auth/register', {
      email,
      password,
      referralCode: referralCode || undefined,
    });
    await setToken(res.token);
    await setStoredUser(res.user);
    setUser(res.user);
  }

  async function logout() {
    await clearToken();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
