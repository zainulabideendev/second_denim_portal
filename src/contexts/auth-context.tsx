"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { getClientAuth, isFirebaseClientConfigured } from "@/lib/firebase-client";
import type { AppUser } from "@/lib/types";

interface AuthContextValue {
  firebaseUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  setAppUser: (user: AppUser | null) => void;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
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
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(initialUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseClientConfigured()) {
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(getClientAuth(), (user) => {
      setFirebaseUser(user);
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, loading, setAppUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
