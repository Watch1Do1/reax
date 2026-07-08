import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// Helper to verify if URL is placeholder or invalid
const isPlaceholder = (url: string | undefined): boolean => {
  if (!url) return true;
  const l = url.toLowerCase();
  return l.includes("placeholder") || l.includes("your_") || l.startsWith("your-") || l.includes("example.com");
};

// Quote cleaning helper for environment variables on Vercel
const cleanEnvVar = (val: string | undefined): string | undefined => {
  if (!val) return undefined;
  let clean = val.trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  return clean;
};

// Generic timeout helper for promises to prevent serverless function hangs
const withTimeout = <T>(promise: Promise<T>, ms: number, timeoutErrorValue: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(timeoutErrorValue), ms))
  ]);
};

const SUPABASE_URL = cleanEnvVar(process.env.SUPABASE_URL);
const SUPABASE_ANON_KEY = cleanEnvVar(process.env.SUPABASE_ANON_KEY);

// Initialize Supabase Client synchronously if env vars are present
let supabase: any = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY && !isPlaceholder(SUPABASE_URL)) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase Client initialized safely. Background connection checks omitted to prevent serverless timeouts.");
  } catch (err: any) {
    console.log("Failed to initialize Supabase Client:", err?.message || err);
  }
} else {
  console.log("Supabase URL/Key not set or are placeholders. Active fallback: local in-memory store.");
}

// Ensure the uploads directory exists
const UPLOADS_DIR = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "uploads");
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (err) {
  console.log("Could not ensure uploads directory exists:", err);
}

const app = express();
const PORT = 3000;

// Increase limit to allow base64 image/video uploads
app.use(express.json({ limit: "50mb" }));

// Restore original req.url on Vercel if /api prefix got stripped or if rewritten (ignore static uploads)
app.use((req: any, res: any, next: any) => {
  const forwardedPath = req.headers["x-vercel-forwarded-path"] || 
                        req.headers["x-matched-path"] || 
                        req.headers["x-forwarded-uri"] || 
                        req.headers["x-original-url"];
  
  if (forwardedPath) {
    let cleanPath = forwardedPath;
    if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
      try {
        cleanPath = new URL(cleanPath).pathname;
      } catch (e) {
        // Fallback
      }
    }
    
    // Preserve query parameters if they exist
    const queryIndex = req.url.indexOf("?");
    const queryString = queryIndex !== -1 ? req.url.substring(queryIndex) : "";
    req.url = cleanPath + queryString;
  } else if (process.env.VERCEL && !req.url.startsWith("/api") && !req.url.startsWith("/uploads")) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }
  next();
});

// Serve uploaded files statically
app.use("/uploads", express.static(UPLOADS_DIR));

// In-memory data store for Clips
// Seeded with interesting visual conversations
type Clip = {
  id: string;
  parentId: string | null;
  mediaUrl: string;
  voiceText?: string;
  voiceAudioData?: string;
  voiceStyle?: "casual" | "sarcastic" | "dramatic" | "announcer" | "oldschool";
  tone: "funny" | "dramatic" | "sarcastic" | "chill" | "chaotic";
  authorName: string;
  createdAt: string;
  likesCount: number;
  effect: string; // custom visual effect
  overlayText?: string;
  originalAuthor?: string;
  remixedFrom?: string;
  deleted?: boolean;
  reportCount?: number;
};

// Administrative and Moderation Data Structures
type Report = {
  id: string;
  clipId: string;
  reporter: string;
  reason: "Pornography" | "Copyright" | "Harassment" | "Spam" | "Violence" | "Other";
  createdAt: string;
};

type UserProfile = {
  username: string;
  createdAt: string;
  lastActive: string;
  reactionCount: number;
  suspended: boolean;
  strikes: number;
};

type FunnelStats = {
  visitors: number;
  started_reaction: number;
  posted_reaction: number;
  posted_voice_reaction: number;
};

// Seeding default administrative records
let reports: Report[] = [
  {
    id: "report-1",
    clipId: "clip-1-reply-2",
    reporter: "SnowCat",
    reason: "Harassment",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
  }
];

let userProfiles: UserProfile[] = [];

let funnelStats: FunnelStats = {
  visitors: 320,
  started_reaction: 94,
  posted_reaction: 41,
  posted_voice_reaction: 29
};

let todayStats = {
  newUsers: 2,
  newThreads: 1,
  newReactions: 3,
  voiceReactions: 2
};

// Initial seeded data
let clips: Clip[] = [
  {
    id: "clip-1",
    parentId: null,
    mediaUrl: "https://assets.mixkit.co/videos/preview/mixkit-cat-walking-in-the-snow-animated-3532-large.mp4",
    voiceText: "Where is everyone going? I am freezing here!",
    tone: "funny",
    authorName: "SnowCat",
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    likesCount: 24,
    effect: "bounce",
    overlayText: "BRRR WHERE IS COFFEE"
  },
  {
    id: "clip-1-reply-1",
    parentId: "clip-1",
    mediaUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500",
    voiceText: "I am coming with the hot chocolate right now!",
    tone: "chill",
    authorName: "RescuePup",
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    likesCount: 15,
    effect: "zoom",
    overlayText: "ON MY WAY!"
  },
  {
    id: "clip-1-reply-2",
    parentId: "clip-1-reply-1",
    mediaUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500",
    voiceText: "Sure you are... at a speed of two miles per hour.",
    tone: "sarcastic",
    authorName: "SkepticalSteve",
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    likesCount: 8,
    effect: "shake",
    overlayText: "SO SLOW..."
  },
  {
    id: "clip-2",
    parentId: null,
    mediaUrl: "https://assets.mixkit.co/videos/preview/mixkit-waves-breaking-in-the-ocean-1527-large.mp4",
    voiceText: "The ocean is beautiful but wait for the giant storm!",
    tone: "dramatic",
    authorName: "SeaFarer",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    likesCount: 42,
    effect: "glitch",
    overlayText: "THE STORM COMETH"
  },
  {
    id: "clip-2-reply-1",
    parentId: "clip-2",
    mediaUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500",
    voiceText: "Wait... did you say a giant storm?! Oh no!",
    tone: "chaotic",
    authorName: "PanickedPam",
    createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    likesCount: 19,
    effect: "shake",
    overlayText: "PANIC TIME!"
  }
];

// Ensure all clips have defaults set and synchronize profiles
clips.forEach(clip => {
  clip.deleted = clip.deleted ?? false;
  clip.reportCount = clip.reportCount ?? 0;
});
const seedReportedClip = clips.find(c => c.id === "clip-1-reply-2");
if (seedReportedClip) {
  seedReportedClip.reportCount = 1;
}

function initUserProfiles() {
  const usersMap = new Map<string, UserProfile>();
  clips.forEach(clip => {
    const existing = usersMap.get(clip.authorName.toLowerCase());
    if (existing) {
      existing.reactionCount += 1;
      if (new Date(clip.createdAt) > new Date(existing.lastActive)) {
        existing.lastActive = clip.createdAt;
      }
      if (new Date(clip.createdAt) < new Date(existing.createdAt)) {
        existing.createdAt = clip.createdAt;
      }
    } else {
      usersMap.set(clip.authorName.toLowerCase(), {
        username: clip.authorName,
        createdAt: clip.createdAt,
        lastActive: clip.createdAt,
        reactionCount: 1,
        suspended: false,
        strikes: 0
      });
    }
  });
  userProfiles = Array.from(usersMap.values());
}
initUserProfiles();

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Helper functions to translate between camelCase (React Frontend) and snake_case (PostgreSQL Supabase)
function isValidUuid(id: string | null | undefined): boolean {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

function mapDbToClip(dbRow: any): Clip {
  let dateStr = new Date().toISOString();
  if (dbRow && dbRow.created_at) {
    try {
      const d = new Date(dbRow.created_at);
      if (!isNaN(d.getTime())) {
        dateStr = d.toISOString();
      }
    } catch (e) {
      // Keep fallback
    }
  }
  return {
    id: dbRow.id,
    parentId: dbRow.parent_id || null,
    mediaUrl: dbRow.media_url,
    voiceText: dbRow.voice_text || undefined,
    voiceAudioData: dbRow.voice_audio_data || undefined,
    voiceStyle: dbRow.voice_style || undefined,
    overlayText: dbRow.overlay_text || undefined,
    tone: dbRow.tone,
    effect: dbRow.effect,
    authorName: dbRow.author_name,
    likesCount: dbRow.likes_count ?? 0,
    createdAt: dateStr,
    originalAuthor: dbRow.original_author || undefined,
    remixedFrom: dbRow.remixed_from || undefined,
    deleted: dbRow.deleted || false,
    reportCount: dbRow.report_count ?? 0,
  };
}

function mapClipToDb(clip: any) {
  return {
    id: clip.id,
    parent_id: isValidUuid(clip.parentId) ? clip.parentId : null,
    media_url: clip.mediaUrl,
    voice_text: clip.voiceText || null,
    voice_audio_data: clip.voiceAudioData || null,
    voice_style: clip.voiceStyle || null,
    overlay_text: clip.overlayText || null,
    tone: clip.tone,
    effect: clip.effect || "zoom",
    author_name: clip.authorName,
    likes_count: clip.likesCount ?? 0,
    original_author: clip.originalAuthor || null,
    remixed_from: clip.remixedFrom || null,
    deleted: clip.deleted || false,
    report_count: clip.reportCount ?? 0,
  };
}

// API: Get DB configuration and connectivity status
app.get("/api/db-status", async (req, res) => {
  const url = cleanEnvVar(process.env.SUPABASE_URL);
  const key = cleanEnvVar(process.env.SUPABASE_ANON_KEY);
  const hasEnv = !!(url && key && !isPlaceholder(url));
  let tableExists = false;
  let connectionError = null;

  if (hasEnv && supabase) {
    try {
      const { error } = await withTimeout(
        supabase.from("clips").select("id").limit(1),
        3500,
        { error: { message: "Supabase connection timed out after 3.5s" } }
      );
      if (!error) {
        tableExists = true;
      } else {
        connectionError = error.message;
      }
    } catch (err: any) {
      connectionError = err.message || String(err);
    }
  } else if (hasEnv) {
    connectionError = "Supabase environment variables are set, but the client failed to initialize.";
  } else {
    connectionError = "Supabase URL or Key environment variables are missing, incomplete, or contain placeholder values.";
  }

  res.json({
    configured: hasEnv,
    supabaseUrl: url || null,
    tableExists,
    connectionError,
    schemaSql: `-- WARNING: If you already have an old "clips" table and want to reset and start fresh with the new, robust schema, uncomment and run the line below first:
-- DROP TABLE IF EXISTS public.clips CASCADE;

-- If you have an existing clips table, you can add the missing 'deleted' and 'report_count' columns by running:
-- ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;
-- ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  voice_text TEXT,
  voice_audio_data TEXT,
  voice_style TEXT,
  overlay_text TEXT,
  tone TEXT NOT NULL,
  effect TEXT NOT NULL,
  author_name TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  original_author TEXT,
  remixed_from TEXT,
  deleted BOOLEAN DEFAULT false,
  report_count INTEGER DEFAULT 0
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;

-- Enable public RLS policies for seamless anonymous interactions
CREATE POLICY "Allow public read" ON public.clips FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.clips FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.clips FOR UPDATE USING (true);
`
  });
});

// API: Get all active, non-deleted clips
app.get("/api/clips", async (req, res) => {
  try {
    if (supabase) {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from("clips")
            .select("*")
            .eq("deleted", false)
            .order("created_at", { ascending: false }),
          3500,
          { data: null, error: { message: "Supabase query timed out" } }
        );

        if (!error && data) {
          return res.json(data.map(mapDbToClip));
        }
        if (error) {
          console.warn("Supabase query error on /api/clips:", error.message);
          // Fallback query in case the table doesn't have a 'deleted' column yet
          const { data: dataAll, error: errorAll } = await withTimeout(
            supabase
              .from("clips")
              .select("*")
              .order("created_at", { ascending: false }),
            3500,
            { data: null, error: { message: "Supabase fallback query timed out" } }
          );
          if (!errorAll && dataAll) {
            return res.json(dataAll.map(mapDbToClip).filter(c => !c.deleted));
          }
          if (error.message && (error.message.includes("fetch") || error.message.includes("network") || error.message.includes("Failed to fetch") || error.message.includes("timed out"))) {
            supabase = null;
          }
        }
      } catch (err: any) {
        console.error("Supabase connection failed inside /api/clips query:", err);
        supabase = null;
      }
    }
  } catch (outerErr: any) {
    console.error("Critical error in /api/clips handler:", outerErr);
  }
  // Always fall back to in-memory store
  return res.json(clips.filter(c => !c.deleted));
});

// API: Create new clip
app.post("/api/clips", async (req, res) => {
  const { parentId, mediaUrl, voiceText, voiceAudioData, voiceStyle, tone, authorName, effect, overlayText, originalAuthor, remixedFrom } = req.body;
  if (!mediaUrl || !tone || !authorName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Security Check: Enforce user account suspensions
  const userProfile = userProfiles.find(u => u.username.toLowerCase() === authorName.toLowerCase());
  if (userProfile && userProfile.suspended) {
    return res.status(403).json({ error: "Your account is suspended due to violations of Community Guidelines." });
  }

  const newClip: Clip = {
    id: crypto.randomUUID(),
    parentId: parentId || null,
    mediaUrl,
    voiceText,
    voiceAudioData,
    voiceStyle,
    tone,
    authorName,
    createdAt: new Date().toISOString(),
    likesCount: 0,
    effect: effect || "zoom",
    overlayText,
    originalAuthor,
    remixedFrom,
    deleted: false,
    reportCount: 0
  };

  // Synchronize User Profiles
  const existingUser = userProfiles.find(u => u.username.toLowerCase() === authorName.toLowerCase());
  if (existingUser) {
    existingUser.reactionCount += 1;
    existingUser.lastActive = new Date().toISOString();
  } else {
    userProfiles.push({
      username: authorName,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      reactionCount: 1,
      suspended: false,
      strikes: 0
    });
    todayStats.newUsers += 1;
  }

  // Keep track of today's launch metrics
  if (!parentId) {
    todayStats.newThreads += 1;
  } else {
    todayStats.newReactions += 1;
  }
  if (voiceText || voiceAudioData) {
    todayStats.voiceReactions += 1;
  }

  // Log to funnel
  funnelStats.posted_reaction += 1;
  if (voiceText || voiceAudioData) {
    funnelStats.posted_voice_reaction += 1;
  }

  if (supabase) {
    try {
      const dbClip = mapClipToDb(newClip);
      const { data, error } = await supabase
        .from("clips")
        .insert([dbClip])
        .select();

      if (!error && data && data.length > 0) {
        return res.json(mapDbToClip(data[0]));
      }
      if (error) {
        if (error.message && (error.message.includes("fetch") || error.message.includes("network") || error.message.includes("Failed to fetch"))) {
          supabase = null;
        } else {
          console.log(`Supabase local mode backup active: ${error.message}`);
        }
      }
    } catch (err: any) {
      supabase = null;
    }
  }

  clips.push(newClip);
  res.json(newClip);
});

// API: Like a clip
app.post("/api/clips/:id/like", async (req, res) => {
  const clipId = req.params.id;

  if (supabase) {
    try {
      const { data: currentClip, error: fetchError } = await supabase
        .from("clips")
        .select("likes_count")
        .eq("id", clipId)
        .single();

      if (!fetchError && currentClip) {
        const nextLikes = (currentClip.likes_count || 0) + 1;
        const { data, error: updateError } = await supabase
          .from("clips")
          .update({ likes_count: nextLikes })
          .eq("id", clipId)
          .select();

        if (!updateError && data && data.length > 0) {
          return res.json(mapDbToClip(data[0]));
        } else if (updateError) {
          if (updateError.message && (updateError.message.includes("fetch") || updateError.message.includes("network") || updateError.message.includes("Failed to fetch"))) {
            supabase = null;
          }
        }
      } else if (fetchError) {
        if (fetchError.message && (fetchError.message.includes("fetch") || fetchError.message.includes("network") || fetchError.message.includes("Failed to fetch"))) {
          supabase = null;
        }
      }
    } catch (err: any) {
      supabase = null;
    }
  }

  const clip = clips.find(c => c.id === clipId);
  if (!clip) {
    return res.status(404).json({ error: "Clip not found" });
  }
  clip.likesCount += 1;
  res.json(clip);
});

// API: Upload asset (base64 image or video)
app.post("/api/upload", async (req, res) => {
  const { base64Data, mimeType } = req.body;
  if (!base64Data || !mimeType) {
    return res.status(400).json({ error: "Missing file data" });
  }

  try {
    // Strip data prefix if present
    const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Clean, "base64");
    
    // Determine extension
    let ext = "png";
    if (mimeType.includes("video/mp4")) ext = "mp4";
    else if (mimeType.includes("video/webm")) ext = "webm";
    else if (mimeType.includes("image/jpeg")) ext = "jpg";
    else if (mimeType.includes("image/gif")) ext = "gif";
    else if (mimeType.includes("image/webp")) ext = "webp";

    const fileName = `clip-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${ext}`;

    // If Supabase is configured, try uploading to Supabase Storage "reactions" bucket first
    if (supabase) {
      try {
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("reactions")
          .upload(fileName, buffer, {
            contentType: mimeType,
            cacheControl: "3600",
            upsert: true
          });

        if (uploadError) {
          console.log("Supabase Storage upload: falling back to local file system:", uploadError?.message || uploadError);
          if (uploadError.message && (uploadError.message.includes("fetch") || uploadError.message.includes("network") || uploadError.message.includes("Failed to fetch"))) {
            supabase = null;
          }
        } else if (uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from("reactions")
            .getPublicUrl(fileName);

          if (publicUrlData?.publicUrl) {
            console.log("Uploaded successfully to Supabase Storage:", publicUrlData.publicUrl);
            return res.json({ url: publicUrlData.publicUrl });
          }
        }
      } catch (storageErr: any) {
        console.log("Storage upload to Supabase: falling back to local storage:", storageErr?.message || storageErr);
        supabase = null;
      }
    }

    // Fallback: local file write
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    const fileUrl = `/uploads/${fileName}`;
    res.json({ url: fileUrl });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// ==========================================
// ADMINISTRATIVE & MODERATION API ENDPOINTS
// ==========================================

// Middleware to protect administrative routes
const adminAuthMiddleware = (req: any, res: any, next: any) => {
  try {
    let passcode = req.headers["x-admin-passcode"] || (req.query && req.query.passcode) || (req.body && req.body.passcode);
    if (typeof passcode === "string") {
      passcode = passcode.trim();
      if ((passcode.startsWith('"') && passcode.endsWith('"')) || (passcode.startsWith("'") && passcode.endsWith("'"))) {
        passcode = passcode.slice(1, -1).trim();
      }
    }

    let expectedPasscode = process.env.ADMIN_PASSCODE || "admin123";
    if (typeof expectedPasscode === "string") {
      expectedPasscode = expectedPasscode.trim();
      if ((expectedPasscode.startsWith('"') && expectedPasscode.endsWith('"')) || (expectedPasscode.startsWith("'") && expectedPasscode.endsWith("'"))) {
        expectedPasscode = expectedPasscode.slice(1, -1).trim();
      }
    }

    if (!passcode || passcode !== expectedPasscode) {
      console.warn("Admin Auth: Invalid passcode attempt:", passcode);
      return res.status(401).json({ error: "Unauthorized. Invalid admin passcode." });
    }
    next();
  } catch (err: any) {
    console.error("Critical error in adminAuthMiddleware:", err);
    return res.status(500).json({ error: "Authentication internal error", details: err?.message });
  }
};

app.use("/api/admin", adminAuthMiddleware);

// Endpoint to verify passcode
app.get("/api/admin/verify", (req, res) => {
  try {
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Critical error in /api/admin/verify route:", err);
    return res.status(500).json({ error: "Verification internal error", details: err?.message });
  }
});

// 1. GET Admin Dashboard Stats & Funnels
app.get("/api/admin/stats", (req, res) => {
  const totalUsers = userProfiles.length;
  const guestUsers = userProfiles.filter(u => u.username.startsWith("~")).length;
  const registeredUsers = userProfiles.filter(u => !u.username.startsWith("~")).length;
  const totalReactions = clips.filter(c => c.parentId !== null).length;
  const totalRootThreads = clips.filter(c => c.parentId === null).length;
  const totalReplies = clips.filter(c => c.parentId !== null).length;

  const voiceReactions = clips.filter(c => !!(c.voiceText || c.voiceAudioData)).length;
  const silentReactions = clips.filter(c => !(c.voiceText || c.voiceAudioData)).length;
  const videoReactions = clips.filter(c => c.mediaUrl.endsWith(".mp4") || c.mediaUrl.endsWith(".webm") || c.mediaUrl.includes("mixkit-")).length;
  const imageReactions = clips.filter(c => !(c.mediaUrl.endsWith(".mp4") || c.mediaUrl.endsWith(".webm") || c.mediaUrl.includes("mixkit-"))).length;

  // Founder Analytics calculations
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * oneDayMs;

  const postsToday = clips.filter(c => (now - new Date(c.createdAt).getTime()) <= oneDayMs).length;
  const postsThisWeek = clips.filter(c => (now - new Date(c.createdAt).getTime()) <= sevenDaysMs).length;

  const videoClipsCount = clips.filter(c => c.mediaUrl.endsWith(".mp4") || c.mediaUrl.endsWith(".webm") || c.mediaUrl.includes("uploads/clip-")).length;
  const imageClipsCount = clips.filter(c => !(c.mediaUrl.endsWith(".mp4") || c.mediaUrl.endsWith(".webm") || c.mediaUrl.includes("uploads/clip-"))).length;
  const voiceClipsCount = clips.filter(c => !!c.voiceAudioData).length;

  // Approximate storage calculation
  // Base assets + videos (~1.5 MB each) + images (~0.2 MB each) + voice tracks (~0.15 MB each)
  const storageUsedMB = parseFloat(((videoClipsCount * 1.5) + (imageClipsCount * 0.2) + (voiceClipsCount * 0.15) + 1300).toFixed(2));
  const storageLimitMB = 5000; // 5 GB default cap

  const audioAdoptionPercent = clips.length > 0 
    ? Math.round((voiceReactions / clips.length) * 100)
    : 0;

  res.json({
    overview: {
      totalUsers,
      guestUsers,
      registeredUsers,
      totalReactions,
      totalRootThreads,
      totalReplies
    },
    breakdown: {
      voiceReactions,
      silentReactions,
      videoReactions,
      imageReactions
    },
    today: todayStats,
    funnel: funnelStats,
    founderMetrics: {
      postsToday,
      postsThisWeek,
      storageUsedMB,
      storageLimitMB,
      audioAdoptionPercent
    }
  });
});

// 2. GET All Clips for Content Browser (includes deleted, with reportCount)
app.get("/api/admin/clips", (req, res) => {
  // Sort by newest posts
  const sortedClips = [...clips].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(sortedClips);
});

// 3. POST Soft Delete a clip
app.post("/api/admin/clips/:id/delete", async (req, res) => {
  const clipId = req.params.id;
  const clip = clips.find(c => c.id === clipId);
  if (!clip) {
    return res.status(404).json({ error: "Clip not found" });
  }
  
  clip.deleted = true;

  if (supabase) {
    try {
      await supabase
        .from("clips")
        .update({ deleted: true })
        .eq("id", clipId);
    } catch (err) {
      console.log("Supabase soft delete sync ignored or failed.");
    }
  }

  res.json({ success: true, clip });
});

// 4. POST Restore a soft-deleted clip
app.post("/api/admin/clips/:id/restore", async (req, res) => {
  const clipId = req.params.id;
  const clip = clips.find(c => c.id === clipId);
  if (!clip) {
    return res.status(404).json({ error: "Clip not found" });
  }

  clip.deleted = false;

  if (supabase) {
    try {
      await supabase
        .from("clips")
        .update({ deleted: false })
        .eq("id", clipId);
    } catch (err) {
      console.log("Supabase restore sync ignored or failed.");
    }
  }

  res.json({ success: true, clip });
});

// 5. POST Report a clip
app.post("/api/clips/:id/report", async (req, res) => {
  const clipId = req.params.id;
  const { reporter, reason } = req.body;
  if (!reason) {
    return res.status(400).json({ error: "Reason is required to submit a report" });
  }

  const clip = clips.find(c => c.id === clipId);
  if (!clip) {
    return res.status(404).json({ error: "Clip not found" });
  }

  // Increment report count
  clip.reportCount = (clip.reportCount || 0) + 1;

  // Add report record
  const newReport: Report = {
    id: crypto.randomUUID(),
    clipId,
    reporter: reporter || "Anonymous",
    reason: reason,
    createdAt: new Date().toISOString()
  };

  reports.push(newReport);

  if (supabase) {
    try {
      // Safely attempt to increment on Supabase
      await supabase
        .from("clips")
        .update({ report_count: clip.reportCount })
        .eq("id", clipId);
    } catch (err) {
      console.log("Supabase report increment ignored or failed.");
    }
  }

  res.json({ success: true, report: newReport, reportCount: clip.reportCount });
});

// 6. GET All Active Moderation Reports
app.get("/api/admin/reports", (req, res) => {
  const reportsWithClips = reports.map(r => {
    const clip = clips.find(c => c.id === r.clipId);
    return {
      ...r,
      clip: clip ? {
        id: clip.id,
        authorName: clip.authorName,
        mediaUrl: clip.mediaUrl,
        voiceText: clip.voiceText,
        overlayText: clip.overlayText,
        deleted: clip.deleted || false,
        reportCount: clip.reportCount || 0
      } : null
    };
  });
  res.json(reportsWithClips);
});

// 7. POST Dismiss report
app.post("/api/admin/reports/:id/dismiss", (req, res) => {
  const reportId = req.params.id;
  const index = reports.findIndex(r => r.id === reportId);
  if (index === -1) {
    return res.status(404).json({ error: "Report not found" });
  }

  const report = reports[index];
  reports.splice(index, 1);

  // Safely decrement associated clip report count
  const clip = clips.find(c => c.id === report.clipId);
  if (clip && clip.reportCount && clip.reportCount > 0) {
    clip.reportCount -= 1;
  }

  res.json({ success: true });
});

// 8. GET Users list
app.get("/api/admin/users", (req, res) => {
  res.json(userProfiles);
});

// 9. POST Suspend user
app.post("/api/admin/users/:username/suspend", (req, res) => {
  const username = req.params.username;
  const user = userProfiles.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User profile not found" });
  }

  user.suspended = true;
  res.json({ success: true, user });
});

// 10. POST Unsuspend user
app.post("/api/admin/users/:username/unsuspend", (req, res) => {
  const username = req.params.username;
  const user = userProfiles.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User profile not found" });
  }

  user.suspended = false;
  res.json({ success: true, user });
});

// 11. POST Add strike to user
app.post("/api/admin/users/:username/strike", (req, res) => {
  const username = req.params.username;
  const user = userProfiles.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User profile not found" });
  }

  user.strikes = (user.strikes || 0) + 1;
  if (user.strikes >= 3) {
    user.suspended = true;
  }

  res.json({ success: true, user });
});

// 12. POST Track Funnel Events
app.post("/api/funnel/track", (req, res) => {
  const { event } = req.body;
  if (!event || !["visitors", "started_reaction", "posted_reaction", "posted_voice_reaction"].includes(event)) {
    return res.status(400).json({ error: "Invalid funnel tracking event name" });
  }

  funnelStats[event as keyof FunnelStats] = (funnelStats[event as keyof FunnelStats] || 0) + 1;
  res.json({ success: true, funnel: funnelStats });
});

// Helper to get high-quality context-aware fallback response when Gemini experiences high demand
function getDynamicFallback(tone: string, imageContext?: string) {
  let contextTopic = "this";
  if (imageContext && imageContext.trim().length > 0) {
    // Extract a meaningful noun or keyword
    const words = imageContext.split(/\s+/).filter(w => w.length > 4 && !w.startsWith("http"));
    if (words.length > 0) {
      contextTopic = words[Math.floor(Math.random() * words.length)].replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    }
  }

  const variations: Record<string, Array<{ voiceLine: string; effect: string; overlayText: string }>> = {
    funny: [
      { voiceLine: `Oh outstanding! Truly a masterclass in comedy about ${contextTopic}.`, effect: "bounce", overlayText: "LOL NO WAY!" },
      { voiceLine: `I can't even process the level of hilarity here.`, effect: "bounce", overlayText: "LMAO STOP" },
      { voiceLine: `This is the funniest thing I've seen all day!`, effect: "bounce", overlayText: "CACKLING" }
    ],
    dramatic: [
      { voiceLine: `This changes absolutely everything... forever with ${contextTopic}.`, effect: "glitch", overlayText: "DUN DUN DUN" },
      { voiceLine: `The suspense is absolutely killing me right now.`, effect: "shake", overlayText: "OH MY GOD" },
      { voiceLine: `A twist of fate that nobody could have predicted!`, effect: "glitch", overlayText: "NO WAY..." }
    ],
    sarcastic: [
      { voiceLine: `Oh outstanding. Truly the pinnacle of achievement regarding ${contextTopic}.`, effect: "pulse", overlayText: "VERY COOL *NOT*" },
      { voiceLine: `Wow, I am completely shocked and amazed. Truly.`, effect: "pan", overlayText: "YAWN..." },
      { voiceLine: `Please, tell me more. I am on the edge of my seat.`, effect: "pulse", overlayText: "SURE JAN" }
    ],
    chill: [
      { voiceLine: `Just vibing here with ${contextTopic}. Absolutely no thoughts.`, effect: "zoom", overlayText: "EASY LIVING" },
      { voiceLine: `Mellow waves only. Let it wash over you.`, effect: "pan", overlayText: "CHILL VIBES" },
      { voiceLine: `No rush, no worries, just pure cozy relaxation.`, effect: "zoom", overlayText: "STAY COZY" }
    ],
    chaotic: [
      { voiceLine: `AAAHHH WHAT IS HAPPENING WITH ${contextTopic} SEND HELP!`, effect: "shake", overlayText: "CHAOS REIGNS" },
      { voiceLine: `Everything is on fire and I am totally fine with it!`, effect: "glitch", overlayText: "HELP ME" },
      { voiceLine: `Total absolute bedlam! We are going off the rails!`, effect: "shake", overlayText: "PANIC!" }
    ]
  };

  const options = variations[tone] || variations.chill;
  return options[Math.floor(Math.random() * options.length)];
}

// API: AI generate visual suggestion and voiceText
app.post("/api/ai/generate", async (req, res) => {
  const { tone, imageContext } = req.body;
  if (!tone) {
    return res.status(400).json({ error: "Tone is required" });
  }

  // To maintain 100% free tiers on Vercel/Supabase and completely avoid any Gemini API costs,
  // we always route generation requests through our fast, high-quality, local dynamic fallback generator.
  const fallbackResponse = getDynamicFallback(tone, imageContext);
  return res.json(fallbackResponse);
});

// Setup Vite development server or production static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
