import { createClient, SupabaseClient, User, Session } from "@supabase/supabase-js";
import { UserProfile } from "../types";
import { TERMS_VERSION, PRIVACY_VERSION } from "../constants/policy";

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
      localStorage.removeItem("reax_is_logged_in");
      return { needsEmailConfirm: true, user: null, session: null };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const currentSession = sessionData?.session;
    const isAnon = Boolean(
      currentSession?.user && (
        (currentSession.user as any).is_anonymous ||
        currentSession.user.app_metadata?.provider === "anonymous" ||
        !currentSession.user.email
      )
    );

    let createdUser: User | null = null;

    const nowIso = new Date().toISOString();
    const policyMetadata = {
      username: cleanUsername,
      display_name: cleanUsername,
      accepted_terms_version: TERMS_VERSION,
      accepted_privacy_version: PRIVACY_VERSION,
      accepted_terms_at: nowIso,
      accepted_privacy_at: nowIso
    };

    if (isAnon) {
      // Link anonymous user to permanent email + password credentials
      const { data, error } = await supabase.auth.updateUser({
        email: cleanEmail,
        password: cleanPassword,
        data: policyMetadata
      });

      if (error) {
        return { needsEmailConfirm: false, error: error.message };
      }

      createdUser = data.user;
    } else {
      const origin = typeof window !== "undefined" && window.location.origin ? window.location.origin : "";
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          emailRedirectTo: origin || undefined,
          data: policyMetadata
        }
      });

      if (error) {
        return { needsEmailConfirm: false, error: error.message };
      }

      createdUser = data.user;
    }

    const { data: refreshedSessionData } = await supabase.auth.getSession();
    const session = refreshedSessionData?.session || null;
    const user = session?.user || createdUser;

    // Condition:
    // After updateUser or signUp, set reax_is_logged_in ONLY if
    // session.user.email exists AND user.email_confirmed_at is set AND is_anonymous is false.
    // Otherwise return needsEmailConfirm: true. Do not treat anon session as logged in.
    const sessionEmail = session?.user?.email;
    const emailConfirmedAt = user?.email_confirmed_at || (user as any)?.confirmed_at;
    const isAnonymous = Boolean(
      !user ||
      (user as any).is_anonymous ||
      user.app_metadata?.provider === "anonymous" ||
      !sessionEmail
    );

    const isConfirmedAndLoggedIn = Boolean(
      sessionEmail &&
      emailConfirmedAt &&
      !isAnonymous
    );

    if (isConfirmedAndLoggedIn) {
      localStorage.setItem("reax_is_logged_in", "true");
      return {
        needsEmailConfirm: false,
        user,
        session
      };
    } else {
      localStorage.removeItem("reax_is_logged_in");
      return {
        needsEmailConfirm: true,
        user,
        session
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

    const checkUser = data.user;
    const sessionUser = data.session?.user;
    const sessionEmail = sessionUser?.email;
    const emailConfirmedAt = checkUser?.email_confirmed_at || (checkUser as any)?.confirmed_at;
    const isAnon = Boolean(
      !checkUser ||
      (checkUser as any).is_anonymous ||
      checkUser.app_metadata?.provider === "anonymous" ||
      !sessionEmail
    );

    const isConfirmedAndLoggedIn = Boolean(
      sessionEmail &&
      emailConfirmedAt &&
      !isAnon
    );

    if (isConfirmedAndLoggedIn) {
      if (typeof window !== "undefined") {
        localStorage.setItem("reax_is_logged_in", "true");
      }
      return {
        success: true,
        user: data.user,
        session: data.session
      };
    } else {
      if (typeof window !== "undefined") {
        localStorage.removeItem("reax_is_logged_in");
      }
      return {
        success: false,
        error: "Please check your email to confirm your account before signing in."
      };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to sign in." };
  }
}

/**
 * Sends a password reset email using Supabase resetPasswordForEmail.
 * Redirects back to the current origin so the user can set a new password.
 */
export async function resetPasswordForEmail(email: string): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { success: false, error: "Please enter a valid email address." };
  }
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      return { success: true };
    }
    const origin = typeof window !== "undefined" && window.location.origin ? window.location.origin : "";
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: origin || undefined
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to send reset email. Please try again." };
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
  isRecovery?: boolean;
  session?: Session | null;
  user?: User | null;
  username?: string;
}> {
  if (typeof window === "undefined") return { success: false, isRecovery: false };

  const hash = window.location.hash || "";
  const search = window.location.search || "";
  const isRecovery = hash.includes("type=recovery") || search.includes("type=recovery");

  const hasTokens =
    hash.includes("access_token") ||
    hash.includes("refresh_token") ||
    hash.includes("type=signup") ||
    hash.includes("type=magiclink") ||
    hash.includes("type=recovery") ||
    search.includes("type=signup") ||
    search.includes("type=magiclink") ||
    search.includes("type=recovery") ||
    search.includes("code=");

  if (!hasTokens) return { success: false, isRecovery: false };

  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return { success: false, isRecovery };

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
      // Strip hash & auth search params from browser URL so they aren't repeated
      window.history.replaceState({}, document.title, window.location.pathname);

      if (isRecovery) {
        return { success: true, isRecovery: true, session, user };
      }

      // Check confirmed email status:
      // reax_is_logged_in true ONLY if session user has email AND email_confirmed_at is set AND is_anonymous is false
      const isAnon = Boolean((user as any)?.is_anonymous || !user.email || user.app_metadata?.provider === "anonymous");
      const isConfirmed = Boolean(user.email_confirmed_at || (user as any).confirmed_at);
      if (user.email && !isAnon && isConfirmed) {
        localStorage.setItem("reax_is_logged_in", "true");
      } else {
        localStorage.removeItem("reax_is_logged_in");
      }

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

      return { success: true, isRecovery: false, session, user, username };
    }
  } catch (err) {
    console.warn("Error processing URL auth tokens:", err);
  }

  return { success: false, isRecovery };
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
export async function syncUserProfile(
  username: string,
  policyData?: {
    acceptedTermsVersion?: string;
    acceptedPrivacyVersion?: string;
  }
): Promise<UserProfile> {
  const token = await getAuthToken();
  try {
    const res = await fetch("/api/me", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ 
        username,
        acceptedTermsVersion: policyData?.acceptedTermsVersion || TERMS_VERSION,
        acceptedPrivacyVersion: policyData?.acceptedPrivacyVersion || PRIVACY_VERSION
      })
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
    strikes: 0,
    acceptedTermsVersion: policyData?.acceptedTermsVersion || TERMS_VERSION,
    acceptedPrivacyVersion: policyData?.acceptedPrivacyVersion || PRIVACY_VERSION,
    acceptedTermsAt: new Date().toISOString(),
    acceptedPrivacyAt: new Date().toISOString()
  };
  return fallbackProfile;
}

/**
 * Explicitly record policy acceptance (Terms of Service & Privacy Policy)
 */
export async function acceptPolicies(
  termsVersion: string = TERMS_VERSION,
  privacyVersion: string = PRIVACY_VERSION
): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
  const token = await getAuthToken();
  const now = new Date().toISOString();

  // 1. Send to backend API
  try {
    const res = await fetch("/api/policy/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        termsVersion,
        privacyVersion
      })
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, profile: data.profile };
    }
  } catch (err) {
    console.warn("Backend acceptPolicy call failed, falling back to direct Supabase update:", err);
  }

  // 2. Direct Supabase update fallback if available
  try {
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (userId) {
        // Also update user metadata
        await supabase.auth.updateUser({
          data: {
            accepted_terms_version: termsVersion,
            accepted_privacy_version: privacyVersion,
            accepted_terms_at: now,
            accepted_privacy_at: now
          }
        }).catch(() => null);

        const { error } = await supabase
          .from("user_profiles")
          .update({
            accepted_terms_version: termsVersion,
            accepted_privacy_version: privacyVersion,
            accepted_terms_at: now,
            accepted_privacy_at: now,
            last_active: now
          })
          .eq("id", userId);

        if (!error) {
          return { success: true };
        }
      }
    }
  } catch (err) {
    console.warn("Direct supabase policy acceptance update failed:", err);
  }

  return { success: true };
}

/**
 * Fetch authenticated profile from backend (GET /api/me)
 */
export async function fetchMyProfile(): Promise<{
  profile: UserProfile | null;
  isAdmin: boolean;
  isAnonymous: boolean;
  hasEmail: boolean;
  emailConfirmed: boolean;
  email?: string | null;
}> {
  let isAnonymous = true;
  let hasEmail = false;
  let emailConfirmed = false;
  let email: string | null = null;

  try {
    const supabaseUser = await getCurrentSupabaseUser();
    if (supabaseUser) {
      email = supabaseUser.email || null;
      hasEmail = Boolean(supabaseUser.email && supabaseUser.email.trim().length > 0);
      isAnonymous = Boolean(
        (supabaseUser as any).is_anonymous ||
        supabaseUser.app_metadata?.provider === "anonymous" ||
        !supabaseUser.email
      );
      emailConfirmed = Boolean(
        supabaseUser.email_confirmed_at || (supabaseUser as any).confirmed_at
      );
    }
  } catch (err) {
    console.warn("Could not read current Supabase user:", err);
  }

  try {
    const token = await getAuthToken();
    const res = await fetch("/api/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.isAnonymous !== undefined) {
        isAnonymous = Boolean(data.isAnonymous);
      }
      if (data.email !== undefined) {
        email = data.email || null;
        hasEmail = Boolean(email && email.trim().length > 0);
      }
      if (data.emailConfirmed !== undefined) {
        emailConfirmed = Boolean(data.emailConfirmed);
      }

      // Logged-in means confirmed email account ONLY:
      // reax_is_logged_in true ONLY if session user has email AND emailConfirmed is true AND isAnonymous is false
      const isConfirmedEmailUser = Boolean(hasEmail && !isAnonymous && emailConfirmed);
      if (isConfirmedEmailUser) {
        localStorage.setItem("reax_is_logged_in", "true");
      } else {
        localStorage.removeItem("reax_is_logged_in");
      }

      return {
        profile: data.profile || null,
        isAdmin: Boolean(data.isAdmin),
        isAnonymous,
        hasEmail,
        emailConfirmed,
        email
      };
    }
  } catch (e) {
    console.warn("Could not fetch my profile:", e);
  }

  // Fallback: check session user_metadata
  try {
    const user = await getCurrentSupabaseUser();
    if (user) {
      const userHasEmail = Boolean(user.email && user.email.trim().length > 0);
      const isAnon = Boolean(!userHasEmail || (user as any).is_anonymous || user.app_metadata?.provider === "anonymous");
      const userEmailConfirmed = Boolean(user.email_confirmed_at || (user as any).confirmed_at);
      const isConfirmedEmailUser = Boolean(userHasEmail && !isAnon && userEmailConfirmed);
      if (isConfirmedEmailUser) {
        localStorage.setItem("reax_is_logged_in", "true");
      } else {
        localStorage.removeItem("reax_is_logged_in");
      }

      const metaName = user.user_metadata?.username || user.user_metadata?.display_name || user.email?.split("@")[0];
      if (metaName) {
        return {
          profile: {
            id: user.id,
            username: metaName,
            email: user.email || undefined,
            createdAt: user.created_at || new Date().toISOString(),
            lastActive: new Date().toISOString(),
            reactionCount: 0,
            suspended: false,
            strikes: 0,
            acceptedTermsVersion: user.user_metadata?.accepted_terms_version || null,
            acceptedPrivacyVersion: user.user_metadata?.accepted_privacy_version || null,
            acceptedTermsAt: user.user_metadata?.accepted_terms_at || null,
            acceptedPrivacyAt: user.user_metadata?.accepted_privacy_at || null
          },
          isAdmin: false,
          isAnonymous: isAnon,
          hasEmail: userHasEmail,
          emailConfirmed: userEmailConfirmed,
          email: user.email || null
        };
      }
    }
  } catch {}

  localStorage.removeItem("reax_is_logged_in");
  return { profile: null, isAdmin: false, isAnonymous: true, hasEmail: false, emailConfirmed: false, email: null };
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
    if (res.status === 403 && errData.error === "signup_required") {
      const err = new Error("signup_required");
      (err as any).signupRequired = true;
      (err as any).status = 403;
      (err as any).clipCount = errData.clipCount || 3;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("reax_upgrade_trigger", {
          detail: { reason: "post_limit", clipCount: errData.clipCount || 3 }
        }));
      }
      throw err;
    }
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

