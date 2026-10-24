"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { AppUser } from "@/lib/types";

interface AuthContextValue {
  appUser: AppUser | null;
  loading: boolean;
  setAppUser: (user: AppUser | null) => void;
}

const AuthContext = createContext<AuthContextValue>({
  appUser: null,
  loading: true,
  setAppUser: () => {},
});

export function AuthProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser: AppUser | null;
}) {
  const [appUser, setAppUser] = useState<AppUser | null>(initialUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initialUser) setAppUser(initialUser);
  }, [initialUser]);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAppUser(null);
      }
      setLoading(false);
    });
    setLoading(false);
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ appUser, loading, setAppUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
