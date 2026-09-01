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
 * Retrieves a valid Supabase access token, attempting anonymous sign-in
 * if no active session exists yet.
 */
export async function getAuthToken(): Promise<string> {
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        return sessionData.session.access_token;
      }

      // Try signing in anonymously if enabled
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

  // Check production environment
  const metaEnv = (import.meta as any).env || {};
  const isProd =
    metaEnv.PROD ||
    metaEnv.MODE === "production" ||
    (typeof window !== "undefined" && window.location.hostname.includes("vercel.app"));

  if (isProd) {
    throw new Error("Sign-in required to perform action. Please sign in via magic link or enable Anonymous auth in Supabase.");
  }

  // Fallback strictly for local dev mode
  return "dev-bearer-token";
}

/**
 * Request an email magic link for passwordless Supabase authentication
 */
export async function sendMagicLink(email: string, username?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { success: false, error: "Supabase client unconfigured" };
    }

    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        data: username ? { username, display_name: username } : undefined
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to send magic link" };
  }
}

/**
 * Verify an emailed OTP token (for 6-digit email codes)
 */
export async function verifyEmailOtp(email: string, token: string): Promise<{ success: boolean; session?: Session | null; error?: string }> {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { success: false, error: "Supabase client unconfigured" };
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email"
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, session: data.session };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to verify OTP code" };
  }
}

/**
 * Sign out of current Supabase session
 */
export async function signOutSupabase(): Promise<void> {
  try {
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
  const res = await fetch("/api/me", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ username })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Profile sync failed with HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.profile;
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
