import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

const DEMO_USER = { email: 'demo@redrob.ai', name: 'Demo', role: 'viewer' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('redrob_user');
      return saved ? JSON.parse(saved) : DEMO_USER;
    } catch {
      return DEMO_USER;
    }
  });

  const login = (email, password) => {
    if (!email || !password) return false;
    const userData = { email };
    setUser(userData);
    localStorage.setItem('redrob_user', JSON.stringify(userData));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('redrob_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
