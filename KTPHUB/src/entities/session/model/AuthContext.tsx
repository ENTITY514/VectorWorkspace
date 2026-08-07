import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AuthSession,
  UserProfile,
  getAuthRepository,
} from "../../../shared/infrastructure/repositories";

interface AuthContextValue {
  session: AuthSession | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authRepo = useMemo(() => getAuthRepository(), []);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(
    async (userId: string) => {
      const next = await authRepo.getProfile(userId);
      setProfile(next);
    },
    [authRepo]
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const current = await authRepo.getSession();
        if (!mounted) return;
        setSession(current);
        if (current) await loadProfile(current.userId);
      } catch (error) {
        console.error(error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    const unsubscribe = authRepo.onAuthStateChange(async (next: AuthSession | null) => {
      setSession(next);
      if (next) {
        try {
          await loadProfile(next.userId);
        } catch (error) {
          console.error(error);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [authRepo, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    await loadProfile(session.userId);
  }, [loadProfile, session]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const next = await authRepo.signIn(email, password);
      setSession(next);
      await loadProfile(next.userId);
    },
    [authRepo, loadProfile]
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const next = await authRepo.signUp(email, password, displayName);
      setSession(next);
      await loadProfile(next.userId);
    },
    [authRepo, loadProfile]
  );

  const signOut = useCallback(async () => {
    await authRepo.signOut();
    setSession(null);
    setProfile(null);
  }, [authRepo]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      isLoading,
      isAdmin: profile?.role === "admin",
      isAuthenticated: Boolean(session),
      refreshProfile,
      signIn,
      signUp,
      signOut,
    }),
    [session, profile, isLoading, refreshProfile, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
