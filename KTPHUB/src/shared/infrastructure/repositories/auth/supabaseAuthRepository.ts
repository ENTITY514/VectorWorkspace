import { cacheDelete, cacheGet, cacheSet } from "../../cache/localCache";
import { cacheKeys } from "../../cache/keys";
import { getSupabaseClient } from "../../supabase/client";
import {
  AuthRepository,
  AuthSession,
  UserProfile,
  UserRole,
} from "../types";

interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  role: UserRole;
}

function toSession(
  userId: string,
  email: string | null | undefined,
  accessToken: string
): AuthSession {
  return { userId, email: email ?? null, accessToken };
}

export function createSupabaseAuthRepository(): AuthRepository {
  const supabase = getSupabaseClient();

  async function getSession(): Promise<AuthSession | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session?.user) return null;
    return toSession(session.user.id, session.user.email, session.access_token);
  }

  async function getProfile(userId: string): Promise<UserProfile | null> {
    const cached = await cacheGet<UserProfile>(cacheKeys.profile(userId));
    if (cached?.value) return cached.value;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, display_name, role")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as ProfileRow;
    const profile: UserProfile = {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
    };
    await cacheSet(cacheKeys.profile(userId), profile);
    return profile;
  }

  async function signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session?.user) throw new Error("Сессия не создана");
    await cacheDelete(cacheKeys.profile(data.session.user.id));
    return toSession(
      data.session.user.id,
      data.session.user.email,
      data.session.access_token
    );
  }

  async function signUp(
    email: string,
    password: string,
    displayName?: string
  ): Promise<AuthSession> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName ?? "" },
      },
    });
    if (error) throw error;
    if (!data.session?.user) {
      throw new Error(
        "Регистрация принята. Проверьте почту для подтверждения (или отключите Confirm email в Supabase)."
      );
    }
    return toSession(
      data.session.user.id,
      data.session.user.email,
      data.session.access_token
    );
  }

  async function signOut(): Promise<void> {
    const session = await getSession();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    if (session) await cacheDelete(cacheKeys.profile(session.userId));
  }

  function onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        callback(null);
        return;
      }
      callback(toSession(session.user.id, session.user.email, session.access_token));
    });
    return () => data.subscription.unsubscribe();
  }

  return {
    getSession,
    getProfile,
    signIn,
    signUp,
    signOut,
    onAuthStateChange,
  };
}
