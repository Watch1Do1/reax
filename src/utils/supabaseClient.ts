import { createClient, SupabaseClient, User, Session } from "@supabase/supabase-js";
import { UserProfile } from "../types";

let clientInstance: SupabaseClient | null = null;
let initPromise: Promise<SupabaseClient | null> | null = null;

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (clientInstance) return clientInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const metaEnv = (import.meta as any).env || {};
      let url = metaEnv.VITE_SUPABASE_URL;
      let anonKey = metaEnv.VITE_SUPABASE_ANON_KEY;

      if (!url || !anonKey || url.includes("placeholder")) {
        // Fetch public config from server
        const res = await fetch("/api/auth-config").catch(() => null);
        if (res && res.ok) {
          const config = await res.json();
          url = config.supabaseUrl;
          anonKey = config.supabaseAnonKey;
        }
      }

      if (url && anonKey && !url.includes("placeholder")) {
        clientInstance = createClient(url, anonKey);
        return clientInstance;
      }
    } catch (err) {
      console.warn("Could not initialize Supabase browser client:", err);
    }
    return null;
  })();

  return initPromise;
}

/**
 * Retrieves a valid Supabase access token.
 * Prefers existing session (password or anonymous).
 * Only calls signInAnonymously if there is NO active session.
 */
export async function getAuthToken(): Promise<string> {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        return sessionData.session.access_token;
      }

      // Try signing in anonymously only if no session exists
      try {
        const { data: anonData } = await supabase.auth.signInAnonymously();
        if (anonData?.session?.access_token) {
          return anonData.session.access_token;
        }
      } catch (anonErr) {
        console.warn("Anonymous sign-in not available or failed:", anonErr);
      }
    }
  } catch (err) {
    console.warn("Error getting Supabase auth token:", err);
  }

  // Fallback token for unauthenticated / anonymous posting or local dev mode
  return "dev-bearer-token";
}

/**
 * Signs up a new account using Email + Password + Username.
 * - If current session is anonymous, calls updateUser so the same user ID is kept.
 * - Otherwise calls signUp with emailRedirectTo = window.location.origin.
 * - Enforces minimum 8 characters for passwords.
 */
export async function signUpWithEmail({
  email,
  password,
  username
}: {
  email: string;
  password: string;
  username: string;
}): Promise<{
  needsEmailConfirm: boolean;
  user?: User | null;
  session?: Session | null;
  error?: string;
}> {
  const cleanEmail = email.trim();
  const cleanPassword = password;
  const cleanUsername = username.trim();

  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { needsEmailConfirm: false, error: "Please enter a valid email address." };
  }
  if (!cleanPassword || cleanPassword.length < 8) {
    return { needsEmailConfirm: false, error: "Password must be at least 8 characters long." };
  }
  if (!cleanUsername) {
    return { needsEmailConfirm: false, error: "Please choose a username." };
  }

  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      // Local development fallback
      localStorage.setItem("reax_is_logged_in", "true");
      return { needsEmailConfirm: false, user: null, session: null };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const currentSession = sessionData?.session;
    const isAnon = currentSession?.user && (
      Boolean((currentSession.user as any).is_anonymous) ||
      currentSession.user.app_metadata?.provider === "anonymous"
    );

    if (isAnon) {
      // Link anonymous user to permanent email + password credentials
      const { data, error } = await supabase.auth.updateUser({
        email: cleanEmail,
        password: cleanPassword,
        data: {
          username: cleanUsername,
          display_name: cleanUsername
        }
      });

      if (error) {
        return { needsEmailConfirm: false, error: error.message };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const hasActiveSession = Boolean(sessionData?.session);
      if (hasActiveSession) {
        localStorage.setItem("reax_is_logged_in", "true");
      }
      return {
        needsEmailConfirm: !hasActiveSession,
        user: data.user,
        session: sessionData?.session || null
      };
    } else {
      const origin = typeof window !== "undefined" && window.location.origin ? window.location.origin : "";
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          emailRedirectTo: origin || undefined,
          data: {
            username: cleanUsername,
            display_name: cleanUsername
          }
        }
      });

      if (error) {
        return { needsEmailConfirm: false, error: error.message };
      }

      const needsConfirm = !data.session;
      if (data.session) {
        localStorage.setItem("reax_is_logged_in", "true");
      }
      return {
        needsEmailConfirm: needsConfirm,
        user: data.user,
        session: data.session
      };
    }
  } catch (err: any) {
    return { needsEmailConfirm: false, error: err?.message || "Sign up failed. Please try again." };
  }
}

/**
 * Signs in using Email + Password without sending any emails.
 */
export async function signInWithEmail({
  email,
  password
}: {
  email: string;
  password: string;
}): Promise<{
  success: boolean;
  user?: User | null;
  session?: Session | null;
  error?: string;
}> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { success: false, error: "Please enter a valid email address." };
  }
  if (!password) {
    return { success: false, error: "Please enter your password." };
  }

  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      // Local dev fallback
      localStorage.setItem("reax_is_logged_in", "true");
      return { success: true, user: null, session: null };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("reax_is_logged_in", "true");
    }

    return {
      success: true,
      user: data.user,
      session: data.session
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to sign in." };
  }
}

/**
 * Updates the user's password directly (current password not required).
 */
export async function updateUserPassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters long." };
  }
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { success: true };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update password." };
  }
}

/**
 * Checks for authentication tokens, magic links, or confirm-email codes in URL hash or query params.
 * Exchanges them for a session, syncs user profile, and strips the tokens from the browser URL.
 */
export async function handleUrlAuthTokens(): Promise<{
  success: boolean;
  session?: Session | null;
  user?: User | null;
  username?: string;
}> {
  if (typeof window === "undefined") return { success: false };

  const hash = window.location.hash || "";
  const search = window.location.search || "";
  const hasTokens =
    hash.includes("access_token") ||
    hash.includes("refresh_token") ||
    hash.includes("type=signup") ||
    hash.includes("type=magiclink") ||
    hash.includes("type=recovery") ||
    search.includes("type=signup") ||
    search.includes("type=magiclink") ||
    search.includes("code=");

  if (!hasTokens) return { success: false };

  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return { success: false };

    let session: Session | null = null;
    let user: User | null = null;

    // If PKCE authorization code is present in query parameters (?code=...)
    const searchParams = new URLSearchParams(search);
    const code = searchParams.get("code");
    if (code) {
      try {
        const { data: codeData } = await supabase.auth.exchangeCodeForSession(code);
        if (codeData?.session?.user) {
          session = codeData.session;
          user = codeData.session.user;
        }
      } catch (codeErr) {
        console.warn("Code exchange error:", codeErr);
      }
    }

    if (!session) {
      // Check if session was detected automatically by Supabase client
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        session = sessionData.session;
        user = sessionData.session.user;
      }
    }

    if (user) {
      // Strip hash & auth search params from browser URL
      window.history.replaceState({}, document.title, window.location.pathname);
      localStorage.setItem("reax_is_logged_in", "true");

      let username =
        user.user_metadata?.username ||
        user.user_metadata?.display_name;

      if (username) {
        try {
          const synced = await syncUserProfile(username);
          if (synced?.username) {
            username = synced.username;
          }
        } catch (e) {
          console.warn("Could not sync user profile from metadata:", e);
        }
      }

      return { success: true, session, user, username };
    }
  } catch (err) {
    console.warn("Error processing URL auth tokens:", err);
  }

  return { success: false };
}

/**
 * Sign out of current Supabase session
 */
export async function signOutSupabase(): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem("reax_is_logged_in");
    }
    const supabase = await getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
  } catch (err) {
    console.warn("Sign out error:", err);
  }
}

/**
 * Get current authenticated Supabase user
 */
export async function getCurrentSupabaseUser(): Promise<User | null> {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  } catch {
    return null;
  }
}

/**
 * Sync / upsert user profile on backend (POST /api/me)
 */
export async function syncUserProfile(username: string): Promise<UserProfile> {
  const token = await getAuthToken();
  try {
    const res = await fetch("/api/me", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ username })
    });

    if (res.ok) {
      const data = await res.json();
      return data.profile;
    }
  } catch (err) {
    console.warn("syncUserProfile endpoint failed, using local profile:", err);
  }

  // Graceful fallback if backend /api/me is 404 / unavailable
  const fallbackProfile: UserProfile = {
    id: "user-" + Date.now(),
    username,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    reactionCount: 0,
    suspended: false,
    strikes: 0
  };
  return fallbackProfile;
}

/**
 * Fetch authenticated profile from backend (GET /api/me)
 */
export async function fetchMyProfile(): Promise<{ profile: UserProfile | null; isAdmin: boolean }> {
  try {
    const token = await getAuthToken();
    const res = await fetch("/api/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      return {
        profile: data.profile || null,
        isAdmin: Boolean(data.isAdmin)
      };
    }
  } catch (e) {
    console.warn("Could not fetch my profile:", e);
  }

  // Fallback: check session user_metadata
  try {
    const user = await getCurrentSupabaseUser();
    if (user) {
      const metaName = user.user_metadata?.username || user.user_metadata?.display_name || user.email?.split("@")[0];
      if (metaName) {
        return {
          profile: {
            id: user.id,
            username: metaName,
            createdAt: user.created_at || new Date().toISOString(),
            lastActive: new Date().toISOString(),
            reactionCount: 0,
            suspended: false,
            strikes: 0
          },
          isAdmin: false
        };
      }
    }
  } catch {}

  return { profile: null, isAdmin: false };
}

export interface UploadResult {
  url: string;
  path: string;
  mediaType: "audio" | "image" | "video" | string;
}

/**
 * Uploads media (audio, image, or video) to /api/upload with Supabase Bearer Auth
 */
export async function uploadMediaAsset({
  data,
  kind,
  mimeType,
  filename
}: {
  data: string; // Base64 or Data URL
  kind: "audio" | "image" | "video";
  mimeType: string;
  filename?: string;
}): Promise<UploadResult> {
  const token = await getAuthToken();

  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      contentType: mimeType,
      kind,
      filename: filename || `upload-${Date.now()}`,
      data
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Upload failed with HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Backward compatibility helpers for magic link / OTP if referenced
 */
export async function sendMagicLink(email: string, username?: string): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}

export async function verifyEmailOtp(email: string, token: string): Promise<{ success: boolean; session?: Session | null; error?: string }> {
  return { success: true };
}

