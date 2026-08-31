import { createClient, SupabaseClient } from "@supabase/supabase-js";

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

  // Remove fallback token in production
  const metaEnv = (import.meta as any).env || {};
  const isProd = metaEnv.PROD || metaEnv.MODE === "production";
  if (isProd) {
    return "";
  }

  // Fallback strictly for local dev mode
  return "dev-bearer-token";
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
