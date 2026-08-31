/**
 * Environment Variables:
 * - SUPABASE_URL: Supabase project API URL
 * - SUPABASE_ANON_KEY: Supabase public anonymous key
 * - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key (for administrative operations)
 * - GEMINI_API_KEY: Google Gemini API key for AI dialogue generation
 * - DEV_MEMORY_STORE: Set to 'true' to allow local dev in-memory store when Supabase is unset
 */

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
const SUPABASE_SERVICE_ROLE_KEY = cleanEnvVar(process.env.SUPABASE_SERVICE_ROLE_KEY);
const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1" || !!process.env.VERCEL;

// Initialize Supabase Client if env vars are present
let supabase: any = null;
let supabaseAdmin: any = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY && !isPlaceholder(SUPABASE_URL)) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase Client initialized safely.");
  } catch (err: any) {
    console.error("Failed to initialize Supabase Client:", err?.message || err);
  }
}

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && !isPlaceholder(SUPABASE_URL)) {
  try {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log("Supabase Admin (Service Role) Client initialized safely for storage operations.");
  } catch (err: any) {
    console.error("Failed to initialize Supabase Admin Client:", err?.message || err);
  }
}

// Data Types
export type Clip = {
  id: string;
  parentId: string | null;
  mediaUrl: string;
  mediaType?: "video" | "image" | "audio" | string;
  voiceText?: string;
  voiceAudioData?: string;
  voiceStyle?: "casual" | "sarcastic" | "dramatic" | "announcer" | "oldschool";
  tone: "funny" | "dramatic" | "sarcastic" | "chill" | "chaotic";
  authorName: string;
  authorId?: string;
  createdAt: string;
  likesCount: number;
  laughsCount: number;
  effect: string;
  overlayText?: string;
  originalAuthor?: string;
  remixedFrom?: string;
  deleted?: boolean;
  reportCount?: number;
};

export type Report = {
  id: string;
  clipId: string;
  reporter: string;
  reason: "Slurs / Hate Speech" | "Harassment / Bullying" | "Threats / Violence" | "Pornography" | "Spam" | "Copyright" | "Other";
  createdAt: string;
};

export type UserProfile = {
  username: string;
  createdAt: string;
  lastActive: string;
  reactionCount: number;
  suspended: boolean;
  strikes: number;
};

export type FunnelStats = {
  visitors: number;
  started_reaction: number;
  posted_reaction: number;
  posted_voice_reaction: number;
};

export type TodayStats = {
  newUsers: number;
  newThreads: number;
  newReactions: number;
  voiceReactions: number;
};

// Store Interface
export interface Store {
  getClips(includeDeleted?: boolean): Promise<Clip[]>;
  getClip(id: string): Promise<Clip | null>;
  insertClip(clip: Clip): Promise<Clip>;
  updateClip(id: string, updates: Partial<Clip>): Promise<Clip | null>;
  insertReport(report: Report): Promise<Report>;
  getReports(): Promise<Array<Report & { clip?: Partial<Clip> | null }>>;
  dismissReport(reportId: string): Promise<boolean>;
  getUsers(): Promise<UserProfile[]>;
  upsertUser(user: Partial<UserProfile> & { username: string }): Promise<UserProfile>;
  incrementFunnel(event: keyof FunnelStats): Promise<FunnelStats>;
  getFunnel(): Promise<FunnelStats>;
  getTodayStats(): Promise<TodayStats>;
}

// ----------------------------------------------------
// Memory Store Implementation (Local Dev Only)
// ----------------------------------------------------
class MemoryStore implements Store {
  private clips: Clip[] = [
    {
      id: "clip-1",
      parentId: null,
      mediaUrl: "https://assets.mixkit.co/videos/preview/mixkit-cat-walking-in-the-snow-animated-3532-large.mp4",
      voiceText: "Where is everyone going? I am freezing here!",
      tone: "funny",
      authorName: "SnowCat",
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      likesCount: 14,
      laughsCount: 48,
      effect: "bounce",
      overlayText: "BRRR WHERE IS COFFEE",
      deleted: false,
      reportCount: 0
    },
    {
      id: "clip-1-reply-1",
      parentId: "clip-1",
      mediaUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500",
      voiceText: "I am coming with the hot chocolate right now!",
      tone: "chill",
      authorName: "RescuePup",
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      likesCount: 9,
      laughsCount: 22,
      effect: "zoom",
      overlayText: "ON MY WAY!",
      deleted: false,
      reportCount: 0
    },
    {
      id: "clip-1-reply-2",
      parentId: "clip-1-reply-1",
      mediaUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500",
      voiceText: "Sure you are... at a speed of two miles per hour.",
      tone: "sarcastic",
      authorName: "SkepticalSteve",
      createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      likesCount: 5,
      laughsCount: 31,
      effect: "shake",
      overlayText: "SO SLOW...",
      deleted: false,
      reportCount: 0
    },
    {
      id: "clip-2",
      parentId: null,
      mediaUrl: "https://assets.mixkit.co/videos/preview/mixkit-waves-breaking-in-the-ocean-1527-large.mp4",
      voiceText: "The ocean is beautiful but wait for the giant storm!",
      tone: "dramatic",
      authorName: "SeaFarer",
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      likesCount: 28,
      laughsCount: 37,
      effect: "glitch",
      overlayText: "THE STORM COMETH",
      deleted: false,
      reportCount: 0
    },
    {
      id: "clip-2-reply-1",
      parentId: "clip-2",
      mediaUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500",
      voiceText: "Wait... did you say a giant storm?! Oh no!",
      tone: "chaotic",
      authorName: "PanickedPam",
      createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
      likesCount: 12,
      laughsCount: 45,
      effect: "shake",
      overlayText: "PANIC TIME!",
      deleted: false,
      reportCount: 0
    }
  ];

  private reports: Report[] = [];
  private userProfiles: UserProfile[] = [];
  private funnelStats: FunnelStats = {
    visitors: 0,
    started_reaction: 0,
    posted_reaction: 0,
    posted_voice_reaction: 0
  };
  private todayStats: TodayStats = {
    newUsers: 0,
    newThreads: 0,
    newReactions: 0,
    voiceReactions: 0
  };

  constructor() {
    this.syncProfiles();
  }

  private syncProfiles() {
    const usersMap = new Map<string, UserProfile>();
    this.clips.forEach(clip => {
      const existing = usersMap.get(clip.authorName.toLowerCase());
      if (existing) {
        existing.reactionCount += 1;
        if (new Date(clip.createdAt) > new Date(existing.lastActive)) {
          existing.lastActive = clip.createdAt;
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
    this.userProfiles = Array.from(usersMap.values());
  }

  async getClips(includeDeleted = false): Promise<Clip[]> {
    const filtered = includeDeleted ? this.clips : this.clips.filter(c => !c.deleted);
    return [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getClip(id: string): Promise<Clip | null> {
    return this.clips.find(c => c.id === id) || null;
  }

  async insertClip(clip: Clip): Promise<Clip> {
    this.clips.push(clip);
    if (!clip.parentId) {
      this.todayStats.newThreads += 1;
    } else {
      this.todayStats.newReactions += 1;
    }
    if (clip.voiceText || clip.voiceAudioData) {
      this.todayStats.voiceReactions += 1;
    }
    return clip;
  }

  async updateClip(id: string, updates: Partial<Clip>): Promise<Clip | null> {
    const clip = this.clips.find(c => c.id === id);
    if (!clip) return null;
    Object.assign(clip, updates);
    return clip;
  }

  async insertReport(report: Report): Promise<Report> {
    this.reports.push(report);
    return report;
  }

  async getReports(): Promise<Array<Report & { clip?: Partial<Clip> | null }>> {
    return this.reports.map(r => {
      const clip = this.clips.find(c => c.id === r.clipId);
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
  }

  async dismissReport(reportId: string): Promise<boolean> {
    const index = this.reports.findIndex(r => r.id === reportId);
    if (index === -1) return false;
    const report = this.reports[index];
    this.reports.splice(index, 1);
    const clip = this.clips.find(c => c.id === report.clipId);
    if (clip && clip.reportCount && clip.reportCount > 0) {
      clip.reportCount -= 1;
    }
    return true;
  }

  async getUsers(): Promise<UserProfile[]> {
    return this.userProfiles;
  }

  async upsertUser(user: Partial<UserProfile> & { username: string }): Promise<UserProfile> {
    let existing = this.userProfiles.find(u => u.username.toLowerCase() === user.username.toLowerCase());
    if (existing) {
      if (user.reactionCount !== undefined) existing.reactionCount = user.reactionCount;
      if (user.suspended !== undefined) existing.suspended = user.suspended;
      if (user.strikes !== undefined) existing.strikes = user.strikes;
      if (user.lastActive !== undefined) existing.lastActive = user.lastActive;
      return existing;
    } else {
      const newUser: UserProfile = {
        username: user.username,
        createdAt: user.createdAt || new Date().toISOString(),
        lastActive: user.lastActive || new Date().toISOString(),
        reactionCount: user.reactionCount || 1,
        suspended: user.suspended || false,
        strikes: user.strikes || 0
      };
      this.userProfiles.push(newUser);
      this.todayStats.newUsers += 1;
      return newUser;
    }
  }

  async incrementFunnel(event: keyof FunnelStats): Promise<FunnelStats> {
    this.funnelStats[event] = (this.funnelStats[event] || 0) + 1;
    return this.funnelStats;
  }

  async getFunnel(): Promise<FunnelStats> {
    return this.funnelStats;
  }

  async getTodayStats(): Promise<TodayStats> {
    return this.todayStats;
  }
}

// ----------------------------------------------------
// Supabase Store Implementation (Postgres)
// ----------------------------------------------------
function isValidUuid(id: string | null | undefined): boolean {
  if (!id) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

function inferMediaType(url: string, explicitType?: string): "video" | "image" | "audio" {
  if (explicitType === "video" || explicitType === "image" || explicitType === "audio") {
    return explicitType;
  }
  const lower = (url || "").toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov") || lower.includes("mixkit-")) {
    return "video";
  }
  if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".ogg") || lower.endsWith(".m4a")) {
    return "audio";
  }
  return "image";
}

function mapDbToClip(dbRow: any): Clip {
  const safeRow = dbRow || {};
  let dateStr = new Date().toISOString();
  if (safeRow.created_at) {
    try {
      const d = new Date(safeRow.created_at);
      if (!isNaN(d.getTime())) {
        dateStr = d.toISOString();
      }
    } catch (e) {
      // Keep fallback
    }
  }
  return {
    id: safeRow.id || crypto.randomUUID(),
    parentId: safeRow.parent_id || null,
    mediaUrl: safeRow.media_url || "",
    mediaType: safeRow.media_type || undefined,
    voiceText: safeRow.voice_text || undefined,
    voiceStyle: safeRow.voice_style || undefined,
    overlayText: safeRow.overlay_text || undefined,
    tone: safeRow.tone || "chill",
    effect: safeRow.effect || "zoom",
    authorName: safeRow.author_name || "Anonymous",
    authorId: safeRow.author_id || undefined,
    likesCount: safeRow.likes_count ?? 0,
    laughsCount: safeRow.laughs_count ?? 0,
    createdAt: dateStr,
    originalAuthor: safeRow.original_author || undefined,
    remixedFrom: safeRow.remixed_from || undefined,
    deleted: safeRow.deleted || false,
    reportCount: safeRow.report_count ?? 0,
  };
}

function mapClipToDb(clip: Clip) {
  const payload: Record<string, any> = {
    id: clip.id,
    parent_id: isValidUuid(clip.parentId) ? clip.parentId : null,
    media_url: clip.mediaUrl,
    media_type: inferMediaType(clip.mediaUrl, clip.mediaType),
    voice_text: clip.voiceText || null,
    voice_style: clip.voiceStyle || null,
    overlay_text: clip.overlayText || null,
    tone: clip.tone,
    effect: clip.effect || "zoom",
    author_name: clip.authorName,
    author_id: isValidUuid(clip.authorId) ? clip.authorId : null,
    likes_count: clip.likesCount ?? 0,
    laughs_count: clip.laughsCount ?? 0,
    original_author: clip.originalAuthor || null,
    remixed_from: isValidUuid(clip.remixedFrom) ? clip.remixedFrom : null,
    deleted: clip.deleted || false,
    report_count: clip.reportCount ?? 0,
  };

  const cleanPayload: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      cleanPayload[key] = value;
    }
  }
  return cleanPayload;
}

class SupabaseStore implements Store {
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  async getClips(includeDeleted = false): Promise<Clip[]> {
    let query = this.client
      .from("clips")
      .select("*")
      .order("created_at", { ascending: false });

    const { data, error } = await withTimeout(
      query,
      4000,
      { data: null, error: { message: "Supabase clips query timed out" } }
    );

    if (error) {
      throw error;
    }

    const clips = (data || []).map(mapDbToClip);
    if (includeDeleted) return clips;
    return clips.filter((c: Clip) => !c.deleted);
  }

  async getClip(id: string): Promise<Clip | null> {
    const { data, error } = await this.client
      .from("clips")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data ? mapDbToClip(data) : null;
  }

  async insertClip(clip: Clip): Promise<Clip> {
    const dbClip = mapClipToDb(clip);
    const { data, error } = await this.client
      .from("clips")
      .insert([dbClip])
      .select()
      .single();

    if (error) throw error;
    return mapDbToClip(data);
  }

  async updateClip(id: string, updates: Partial<Clip>): Promise<Clip | null> {
    const dbUpdates: any = {};
    if (updates.likesCount !== undefined) dbUpdates.likes_count = updates.likesCount;
    if (updates.laughsCount !== undefined) dbUpdates.laughs_count = updates.laughsCount;
    if (updates.deleted !== undefined) dbUpdates.deleted = updates.deleted;
    if (updates.reportCount !== undefined) dbUpdates.report_count = updates.reportCount;
    if (updates.overlayText !== undefined) dbUpdates.overlay_text = updates.overlayText;
    if (updates.voiceText !== undefined) dbUpdates.voice_text = updates.voiceText;

    const { data, error } = await this.client
      .from("clips")
      .update(dbUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data ? mapDbToClip(data) : null;
  }

  async insertReport(report: Report): Promise<Report> {
    try {
      await this.client.from("reports").insert([{
        id: report.id,
        clip_id: report.clipId,
        reporter: report.reporter,
        reason: report.reason,
        created_at: report.createdAt
      }]);
    } catch (err) {
      console.warn("insertReport note: reports table optional or error:", err);
    }
    return report;
  }

  async getReports(): Promise<Array<Report & { clip?: Partial<Clip> | null }>> {
    try {
      const { data, error } = await this.client
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data && Array.isArray(data)) {
        const clips = await this.getClips(true);
        return data.map((r: any) => {
          const clip = clips.find(c => c.id === r.clip_id);
          return {
            id: r.id,
            clipId: r.clip_id,
            reporter: r.reporter,
            reason: r.reason,
            createdAt: r.created_at,
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
      }
    } catch (err) {
      console.warn("getReports warning:", err);
    }
    return [];
  }

  async dismissReport(reportId: string): Promise<boolean> {
    try {
      const { error } = await this.client
        .from("reports")
        .delete()
        .eq("id", reportId);
      return !error;
    } catch (err) {
      return false;
    }
  }

  async getUsers(): Promise<UserProfile[]> {
    try {
      const { data, error } = await this.client
        .from("user_profiles")
        .select("*");

      if (!error && data && Array.isArray(data)) {
        return data.map((u: any) => ({
          username: u.username,
          createdAt: u.created_at,
          lastActive: u.last_active,
          reactionCount: u.reaction_count || 0,
          suspended: u.suspended || false,
          strikes: u.strikes || 0
        }));
      }
    } catch (err) {
      // Fallback: derive user profiles from clips table
    }

    const clips = await this.getClips(true);
    const usersMap = new Map<string, UserProfile>();
    clips.forEach(clip => {
      const name = clip.authorName || "Anonymous";
      const existing = usersMap.get(name.toLowerCase());
      if (existing) {
        existing.reactionCount += 1;
        if (new Date(clip.createdAt) > new Date(existing.lastActive)) {
          existing.lastActive = clip.createdAt;
        }
      } else {
        usersMap.set(name.toLowerCase(), {
          username: name,
          createdAt: clip.createdAt,
          lastActive: clip.createdAt,
          reactionCount: 1,
          suspended: false,
          strikes: 0
        });
      }
    });
    return Array.from(usersMap.values());
  }

  async upsertUser(user: Partial<UserProfile> & { username: string }): Promise<UserProfile> {
    try {
      const { data, error } = await this.client
        .from("user_profiles")
        .upsert({
          username: user.username,
          last_active: user.lastActive || new Date().toISOString(),
          suspended: user.suspended,
          strikes: user.strikes
        }, { onConflict: "username" })
        .select()
        .single();

      if (!error && data) {
        return {
          username: data.username,
          createdAt: data.created_at,
          lastActive: data.last_active,
          reactionCount: data.reaction_count || 0,
          suspended: data.suspended || false,
          strikes: data.strikes || 0
        };
      }
    } catch (err) {
      // Ignore if user_profiles table doesn't exist
    }

    return {
      username: user.username,
      createdAt: user.createdAt || new Date().toISOString(),
      lastActive: user.lastActive || new Date().toISOString(),
      reactionCount: user.reactionCount || 1,
      suspended: user.suspended || false,
      strikes: user.strikes || 0
    };
  }

  async incrementFunnel(event: keyof FunnelStats): Promise<FunnelStats> {
    // If no analytics table exists yet, return zero baseline
    return this.getFunnel();
  }

  async getFunnel(): Promise<FunnelStats> {
    // Return zeroes if no analytics table exists
    return {
      visitors: 0,
      started_reaction: 0,
      posted_reaction: 0,
      posted_voice_reaction: 0
    };
  }

  async getTodayStats(): Promise<TodayStats> {
    try {
      const clips = await this.getClips(true);
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const todayClips = clips.filter(c => (now - new Date(c.createdAt).getTime()) <= oneDayMs);
      return {
        newUsers: 0,
        newThreads: todayClips.filter(c => !c.parentId).length,
        newReactions: todayClips.filter(c => !!c.parentId).length,
        voiceReactions: todayClips.filter(c => !!(c.voiceText || c.voiceAudioData)).length
      };
    } catch (err) {
      return {
        newUsers: 0,
        newThreads: 0,
        newReactions: 0,
        voiceReactions: 0
      };
    }
  }
}

// ----------------------------------------------------
// Store Initialization & Fail-Closed Rules
// ----------------------------------------------------
let store: Store | null = null;

if (supabase) {
  store = new SupabaseStore(supabase);
  console.log("Persistence: SupabaseStore connected successfully.");
} else {
  if (isProduction) {
    console.error("FATAL: Supabase is unconfigured in production. Failing closed - all /api/* routes will return 503 database_unconfigured.");
    store = null;
  } else if (process.env.DEV_MEMORY_STORE === "true") {
    console.log("DEV_MEMORY_STORE=true: MemoryStore initialized for local development.");
    store = new MemoryStore();
  } else {
    console.error("Supabase unconfigured and DEV_MEMORY_STORE is not 'true'. Store unconfigured.");
    store = null;
  }
}

// Ensure the uploads directory exists for local fallback
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

// Restore original req.url on Vercel if /api prefix got stripped or if rewritten
app.use((req: any, res: any, next: any) => {
  const forwardedPath = req.headers["x-vercel-forwarded-path"] || 
                        req.headers["x-matched-path"] || 
                        req.headers["x-forwarded-uri"] || 
                        req.headers["x-original-url"];
  
  if (forwardedPath) {
    let cleanPath = Array.isArray(forwardedPath) ? String(forwardedPath[0]) : String(forwardedPath);
    if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
      try {
        cleanPath = new URL(cleanPath).pathname;
      } catch (e) {
        // Fallback
      }
    }
    
    // Preserve query parameters if they exist
    const urlStr = String(req.url || "");
    const queryIndex = urlStr.indexOf("?");
    const queryString = queryIndex !== -1 ? urlStr.substring(queryIndex) : "";
    req.url = cleanPath + queryString;
  } else if (process.env.VERCEL && req.url) {
    const urlStr = String(req.url);
    if (!urlStr.startsWith("/api") && !urlStr.startsWith("/uploads")) {
      req.url = "/api" + (urlStr.startsWith("/") ? urlStr : "/" + urlStr);
    }
  }
  next();
});

// Serve uploaded files statically
app.use("/uploads", express.static(UPLOADS_DIR));

// ----------------------------------------------------
// Global Fail-Closed Middleware for /api routes
// ----------------------------------------------------
app.use("/api", (req, res, next) => {
  // Always allow status and public auth configuration inspection
  if (req.path === "/db-status" || req.path === "/auth-config") {
    return next();
  }
  if (!store) {
    return res.status(503).json({ error: "database_unconfigured" });
  }
  next();
});

// API: Public Supabase configuration for client authentication
app.get("/api/auth-config", (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL || null,
    supabaseAnonKey: SUPABASE_ANON_KEY || null
  });
});

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
        
        // Column validation
        const { error: columnError } = await withTimeout(
          supabase.from("clips").select("id, deleted, report_count, laughs_count, media_url, author_name").limit(1),
          3000,
          { error: { message: "Column validation timed out after 3.0s" } }
        );
        if (columnError) {
          connectionError = "The 'clips' table exists, but may be missing one or more required columns (id, deleted, report_count, laughs_count, media_url, author_name). Please run the schema SQL to update.";
        }
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
    schemaSql: `-- Reax Phase 2 Schema with Laughs, Moderation & Storage References
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT,
  voice_text TEXT,
  voice_style TEXT,
  overlay_text TEXT,
  tone TEXT NOT NULL,
  effect TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_id UUID,
  likes_count INTEGER DEFAULT 0,
  laughs_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  original_author TEXT,
  remixed_from UUID REFERENCES public.clips(id) ON DELETE SET NULL,
  deleted BOOLEAN DEFAULT false,
  report_count INTEGER DEFAULT 0
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;

-- Enable public RLS policies
CREATE POLICY "Allow public read" ON public.clips FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.clips FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.clips FOR UPDATE USING (true);
`
  });
});

// API: Get all active, non-deleted clips
app.get("/api/clips", async (req, res) => {
  try {
    const clips = await store!.getClips(false);
    res.json(clips);
  } catch (err: any) {
    console.error("Error fetching clips:", err);
    res.status(500).json({ error: "Failed to fetch clips" });
  }
});

// API: Create new clip
app.post("/api/clips", async (req, res) => {
  const { parentId, mediaUrl, mediaType, voiceText, voiceStyle, tone, authorName, authorId, effect, overlayText, originalAuthor, remixedFrom, voiceAudioData } = req.body;
  if (!mediaUrl || !tone || !authorName) {
    return res.status(400).json({ error: "Missing required fields: mediaUrl, tone, and authorName are required." });
  }

  // Reject bodies that include voiceAudioData longer than 100 chars (legacy preview only)
  if (voiceAudioData && typeof voiceAudioData === "string" && voiceAudioData.length > 100) {
    return res.status(400).json({
      error: "voiceAudioData cannot contain base64 payloads in clip submissions. Upload audio assets to Supabase Storage first."
    });
  }

  // Validate mediaUrl source
  const isDevMemoryMode = !isProduction && process.env.DEV_MEMORY_STORE === "true";
  const isValidStorageUrl = SUPABASE_URL && (
    mediaUrl.startsWith(`${SUPABASE_URL}/storage/v1/object/`) ||
    mediaUrl.startsWith(`${SUPABASE_URL}/storage/v1/render/image/`) ||
    mediaUrl.includes(".supabase.co/storage/v1/object/") ||
    mediaUrl.includes("/storage/v1/object/public/media/") ||
    mediaUrl.includes("/storage/v1/object/sign/media/")
  );

  const isDevAllowedUrl = isDevMemoryMode && (
    mediaUrl.startsWith("/uploads/") ||
    mediaUrl.includes("images.unsplash.com") ||
    mediaUrl.includes("vjs.zencdn.net") ||
    mediaUrl.includes("mixkit-")
  );

  if (!isValidStorageUrl && !isDevAllowedUrl) {
    return res.status(400).json({
      error: "mediaUrl must be a valid public or signed URL from Supabase Storage bucket 'media'."
    });
  }

  try {
    // Check suspension status
    const users = await store!.getUsers();
    const userProfile = users.find(u => u.username.toLowerCase() === authorName.toLowerCase());
    if (userProfile && userProfile.suspended) {
      return res.status(403).json({ error: "Your account is suspended due to violations of Community Guidelines." });
    }

    // Resolve author identity from Supabase Auth token if present
    let resolvedAuthorId = isValidUuid(authorId) ? authorId : undefined;
    let resolvedAuthorName = authorName;
    if (supabase) {
      const authHeader = (req.headers.authorization || "").toString().trim();
      const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
      if (token && token !== "dev-bearer-token") {
        try {
          const { data: userData } = await supabase.auth.getUser(token);
          if (userData?.user?.id) {
            resolvedAuthorId = userData.user.id;
            if (userData.user.user_metadata?.username || userData.user.user_metadata?.display_name) {
              resolvedAuthorName = userData.user.user_metadata.username || userData.user.user_metadata.display_name;
            }
          }
        } catch (e) {
          // Token verification fallback
        }
      }
    }

    // voiceAudioData is stripped and never persisted into DB; persist media_url + media_type only
    const newClip: Clip = {
      id: crypto.randomUUID(),
      parentId: parentId || null,
      mediaUrl,
      mediaType: mediaType || inferMediaType(mediaUrl, mediaType),
      voiceText,
      voiceStyle,
      tone,
      authorName: resolvedAuthorName,
      authorId: resolvedAuthorId,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      laughsCount: 0,
      effect: effect || "zoom",
      overlayText,
      originalAuthor,
      remixedFrom,
      deleted: false,
      reportCount: 0
    };

    const inserted = await store!.insertClip(newClip);
    await store!.upsertUser({ username: resolvedAuthorName, lastActive: new Date().toISOString() });
    await store!.incrementFunnel("posted_reaction");
    if (voiceText) {
      await store!.incrementFunnel("posted_voice_reaction");
    }

    res.json(inserted);
  } catch (err: any) {
    console.error("Error inserting clip:", err);
    res.status(500).json({ error: "Failed to save reaction" });
  }
});

// API: Laugh at a clip (😂 Humor-first engagement metric)
app.post("/api/clips/:id/laugh", async (req, res) => {
  const clipId = req.params.id;
  try {
    const clip = await store!.getClip(clipId);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }
    const nextLaughs = (clip.laughsCount || 0) + 1;
    const updated = await store!.updateClip(clipId, { laughsCount: nextLaughs });
    res.json(updated || { ...clip, laughsCount: nextLaughs });
  } catch (err: any) {
    console.error("Error registering laugh:", err);
    res.status(500).json({ error: "Failed to register laugh" });
  }
});

// API: Like a clip
app.post("/api/clips/:id/like", async (req, res) => {
  const clipId = req.params.id;
  try {
    const clip = await store!.getClip(clipId);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }
    const nextLikes = (clip.likesCount || 0) + 1;
    const updated = await store!.updateClip(clipId, { likesCount: nextLikes });
    res.json(updated || { ...clip, likesCount: nextLikes });
  } catch (err: any) {
    console.error("Error registering like:", err);
    res.status(500).json({ error: "Failed to register like" });
  }
});

// API: User Delete Own Clip (Authors can delete their own reactions; OP CANNOT delete others' replies!)
app.post("/api/clips/:id/user-delete", async (req, res) => {
  const clipId = req.params.id;
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Username is required to verify ownership." });
  }

  try {
    const clip = await store!.getClip(clipId);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }

    const cleanAuthor = clip.authorName.toLowerCase().replace(/^~/, "");
    const cleanRequester = String(username).toLowerCase().replace(/^~/, "");

    if (cleanAuthor !== cleanRequester) {
      return res.status(403).json({
        error: "Permission Denied: Thread starters cannot delete or suppress other people's reactions. Only the reaction author or a platform moderator can remove content."
      });
    }

    await store!.updateClip(clipId, { deleted: true });
    res.json({ success: true, message: "Reaction removed by author." });
  } catch (err: any) {
    console.error("Error deleting clip:", err);
    res.status(500).json({ error: "Failed to delete clip" });
  }
});

// API: Upload asset (audio, image, or video) to Supabase Storage "media" bucket
app.post("/api/upload", async (req, res) => {
  const authHeader = (req.headers.authorization || "").toString().trim();
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";

  let userId = "anonymous";
  if (supabase) {
    if (!token || token === "dev-bearer-token") {
      return res.status(401).json({ error: "Unauthorized: Authorization Bearer token is required." });
    }
    try {
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !userData?.user?.id) {
        return res.status(401).json({
          error: "Unauthorized: Invalid or expired Supabase access token.",
          details: authError?.message
        });
      }
      userId = userData.user.id;
    } catch (err: any) {
      return res.status(401).json({ error: "Unauthorized: Failed to authenticate Supabase token.", details: err?.message });
    }
  } else if (!isProduction && process.env.DEV_MEMORY_STORE === "true") {
    // Local dev memory store mode
    userId = token && token !== "dev-bearer-token" ? `dev-${token.slice(0, 8)}` : "dev-user-000";
  } else {
    return res.status(503).json({ error: "database_unconfigured" });
  }

  const { contentType, kind, filename, data, base64Data } = req.body;
  const rawData = data || base64Data;
  if (!rawData || !contentType || !kind) {
    return res.status(400).json({ error: "Missing required upload fields: 'kind', 'contentType', and 'data' are required." });
  }

  if (kind !== "audio" && kind !== "image" && kind !== "video") {
    return res.status(400).json({ error: "Invalid kind: must be 'audio', 'image', or 'video'." });
  }

  try {
    const base64Clean = rawData.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Clean, "base64");
    const sizeInBytes = buffer.length;

    let ext = "png";

    // Validate type and size constraints
    if (kind === "audio") {
      const isAudio = contentType.includes("webm") || contentType.includes("mp4") || contentType.startsWith("audio/");
      if (!isAudio) {
        return res.status(400).json({ error: "Invalid audio contentType. Supported formats: audio/webm, audio/mp4." });
      }
      if (sizeInBytes > 2 * 1024 * 1024) {
        return res.status(413).json({ error: "Audio exceeds maximum allowed size of 2MB." });
      }
      ext = contentType.includes("mp4") ? "mp4" : "webm";
    } else if (kind === "image") {
      const isImage = contentType === "image/jpeg" || contentType === "image/jpg" || contentType === "image/png" || contentType === "image/webp";
      if (!isImage) {
        return res.status(400).json({ error: "Invalid image contentType. Supported formats: image/jpeg, image/png, image/webp." });
      }
      if (sizeInBytes > 4 * 1024 * 1024) {
        return res.status(413).json({ error: "Image exceeds maximum allowed size of 4MB." });
      }
      ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    } else if (kind === "video") {
      const isVideo = contentType === "video/mp4" || contentType === "video/webm";
      if (!isVideo) {
        return res.status(400).json({ error: "Invalid video contentType. Supported formats: video/mp4, video/webm." });
      }
      if (sizeInBytes > 12 * 1024 * 1024) {
        return res.status(413).json({ error: "Video exceeds maximum allowed size of 12MB." });
      }
      ext = contentType.includes("webm") ? "webm" : "mp4";
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const fileUuid = crypto.randomUUID();
    const storagePath = `${userId}/${dateStr}/${fileUuid}.${ext}`;

    // Upload to Supabase Storage "media" bucket using SUPABASE_SERVICE_ROLE_KEY client if available
    const storageClient = supabaseAdmin || supabase;
    if (storageClient) {
      try {
        const { data: uploadData, error: uploadError } = await storageClient.storage
          .from("media")
          .upload(storagePath, buffer, {
            contentType,
            cacheControl: "3600",
            upsert: true
          });

        if (uploadError) {
          console.warn("Storage upload error to bucket 'media':", uploadError.message || uploadError);
          return res.status(400).json({ error: uploadError.message || "Failed to upload asset to Supabase Storage bucket 'media'" });
        }

        if (uploadData) {
          const { data: publicUrlData } = storageClient.storage
            .from("media")
            .getPublicUrl(storagePath);

          if (publicUrlData?.publicUrl) {
            return res.json({
              url: publicUrlData.publicUrl,
              path: storagePath,
              mediaType: kind
            });
          }
        }
        return res.status(500).json({ error: "Could not retrieve public URL for uploaded media asset" });
      } catch (storageErr: any) {
        console.warn("Storage upload exception:", storageErr?.message || storageErr);
        return res.status(500).json({ error: storageErr?.message || "Storage upload failed" });
      }
    }

    // Local dev file write fallback
    if (!isProduction && process.env.DEV_MEMORY_STORE === "true") {
      const localFileName = `${fileUuid}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, localFileName);
      fs.writeFileSync(filePath, buffer);
      return res.json({
        url: `/uploads/${localFileName}`,
        path: storagePath,
        mediaType: kind
      });
    }

    res.status(500).json({ error: "Failed to upload asset to storage" });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// ==========================================
// ADMINISTRATIVE & MODERATION API ENDPOINTS
// ==========================================

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

app.get("/api/admin/verify", (req, res) => {
  return res.json({ success: true });
});

// 1. GET Admin Dashboard Stats & Funnels
app.get("/api/admin/stats", async (req, res) => {
  try {
    const userProfiles = await store!.getUsers();
    const clips = await store!.getClips(true);
    const funnel = await store!.getFunnel();
    const today = await store!.getTodayStats();

    const totalUsers = userProfiles.length;
    const guestUsers = userProfiles.filter(u => u.username.startsWith("~")).length;
    const registeredUsers = userProfiles.filter(u => !u.username.startsWith("~")).length;
    const totalReactions = clips.filter(c => c.parentId !== null).length;
    const totalRootThreads = clips.filter(c => c.parentId === null).length;
    const totalReplies = clips.filter(c => c.parentId !== null).length;

    const voiceReactions = clips.filter(c => !!(c.voiceText || c.voiceAudioData)).length;
    const silentReactions = clips.filter(c => !(c.voiceText || c.voiceAudioData)).length;
    const videoReactions = clips.filter(c => c.mediaUrl && (c.mediaUrl.endsWith(".mp4") || c.mediaUrl.endsWith(".webm") || c.mediaUrl.includes("mixkit-"))).length;
    const imageReactions = clips.filter(c => !c.mediaUrl || !(c.mediaUrl.endsWith(".mp4") || c.mediaUrl.endsWith(".webm") || c.mediaUrl.includes("mixkit-"))).length;

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;

    const postsToday = clips.filter(c => (now - new Date(c.createdAt).getTime()) <= oneDayMs).length;
    const postsThisWeek = clips.filter(c => (now - new Date(c.createdAt).getTime()) <= sevenDaysMs).length;

    const videoClipsCount = clips.filter(c => c.mediaUrl && (c.mediaUrl.endsWith(".mp4") || c.mediaUrl.endsWith(".webm") || c.mediaUrl.includes("uploads/clip-"))).length;
    const imageClipsCount = clips.filter(c => !c.mediaUrl || !(c.mediaUrl.endsWith(".mp4") || c.mediaUrl.endsWith(".webm") || c.mediaUrl.includes("uploads/clip-"))).length;
    const voiceClipsCount = clips.filter(c => !!c.voiceAudioData).length;

    const storageUsedMB = parseFloat(((videoClipsCount * 1.5) + (imageClipsCount * 0.2) + (voiceClipsCount * 0.15)).toFixed(2));
    const storageLimitMB = 5000;

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
      today,
      funnel,
      founderMetrics: {
        postsToday,
        postsThisWeek,
        storageUsedMB,
        storageLimitMB,
        audioAdoptionPercent
      }
    });
  } catch (err: any) {
    console.error("Error in /api/admin/stats:", err);
    res.status(500).json({ error: "Failed to generate admin stats" });
  }
});

// 2. GET All Clips for Content Browser
app.get("/api/admin/clips", async (req, res) => {
  try {
    const clips = await store!.getClips(true);
    res.json(clips);
  } catch (err: any) {
    console.error("Error in /api/admin/clips:", err);
    res.status(500).json({ error: "Failed to fetch admin clips" });
  }
});

// 3. POST Soft Delete a clip
app.post("/api/admin/clips/:id/delete", async (req, res) => {
  const clipId = req.params.id;
  try {
    const updated = await store!.updateClip(clipId, { deleted: true });
    if (!updated) {
      return res.status(404).json({ error: "Clip not found" });
    }
    res.json({ success: true, clip: updated });
  } catch (err: any) {
    console.error("Error in delete clip:", err);
    res.status(500).json({ error: "Failed to delete clip" });
  }
});

// 4. POST Restore a soft-deleted clip
app.post("/api/admin/clips/:id/restore", async (req, res) => {
  const clipId = req.params.id;
  try {
    const updated = await store!.updateClip(clipId, { deleted: false });
    if (!updated) {
      return res.status(404).json({ error: "Clip not found" });
    }
    res.json({ success: true, clip: updated });
  } catch (err: any) {
    console.error("Error in restore clip:", err);
    res.status(500).json({ error: "Failed to restore clip" });
  }
});

// 5. POST Report a clip
app.post("/api/clips/:id/report", async (req, res) => {
  const clipId = req.params.id;
  const { reporter, reason } = req.body;
  if (!reason) {
    return res.status(400).json({ error: "Reason is required to submit a report" });
  }

  try {
    const clip = await store!.getClip(clipId);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }

    const nextReportCount = (clip.reportCount || 0) + 1;
    await store!.updateClip(clipId, { reportCount: nextReportCount });

    const newReport: Report = {
      id: crypto.randomUUID(),
      clipId,
      reporter: reporter || "Anonymous",
      reason,
      createdAt: new Date().toISOString()
    };

    await store!.insertReport(newReport);
    res.json({ success: true, report: newReport, reportCount: nextReportCount });
  } catch (err: any) {
    console.error("Error reporting clip:", err);
    res.status(500).json({ error: "Failed to report clip" });
  }
});

// 6. GET All Active Moderation Reports
app.get("/api/admin/reports", async (req, res) => {
  try {
    const reports = await store!.getReports();
    res.json(reports);
  } catch (err: any) {
    console.error("Error in /api/admin/reports:", err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

// 7. POST Dismiss report
app.post("/api/admin/reports/:id/dismiss", async (req, res) => {
  const reportId = req.params.id;
  try {
    const success = await store!.dismissReport(reportId);
    res.json({ success });
  } catch (err: any) {
    console.error("Error dismissing report:", err);
    res.status(500).json({ error: "Failed to dismiss report" });
  }
});

// 8. GET Users list
app.get("/api/admin/users", async (req, res) => {
  try {
    const users = await store!.getUsers();
    res.json(users);
  } catch (err: any) {
    console.error("Error in /api/admin/users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// 9. POST Suspend user
app.post("/api/admin/users/:username/suspend", async (req, res) => {
  const username = req.params.username;
  try {
    const user = await store!.upsertUser({ username, suspended: true });
    res.json({ success: true, user });
  } catch (err: any) {
    console.error("Error suspending user:", err);
    res.status(500).json({ error: "Failed to suspend user" });
  }
});

// 10. POST Unsuspend user
app.post("/api/admin/users/:username/unsuspend", async (req, res) => {
  const username = req.params.username;
  try {
    const user = await store!.upsertUser({ username, suspended: false });
    res.json({ success: true, user });
  } catch (err: any) {
    console.error("Error unsuspending user:", err);
    res.status(500).json({ error: "Failed to unsuspend user" });
  }
});

// 11. POST Add strike to user
app.post("/api/admin/users/:username/strike", async (req, res) => {
  const username = req.params.username;
  try {
    const users = await store!.getUsers();
    const existing = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    const strikes = (existing?.strikes || 0) + 1;
    const suspended = strikes >= 3 ? true : (existing?.suspended || false);
    const user = await store!.upsertUser({ username, strikes, suspended });
    res.json({ success: true, user });
  } catch (err: any) {
    console.error("Error adding strike:", err);
    res.status(500).json({ error: "Failed to add strike" });
  }
});

// 12. POST Track Funnel Events
app.post("/api/funnel/track", async (req, res) => {
  const { event } = req.body;
  if (!event || !["visitors", "started_reaction", "posted_reaction", "posted_voice_reaction"].includes(event)) {
    return res.status(400).json({ error: "Invalid funnel tracking event name" });
  }

  try {
    const funnel = await store!.incrementFunnel(event as keyof FunnelStats);
    res.json({ success: true, funnel });
  } catch (err: any) {
    console.error("Error tracking funnel event:", err);
    res.status(500).json({ error: "Failed to track funnel event" });
  }
});

// Helper for AI responses
function getDynamicFallback(tone: string, imageContext?: string) {
  let contextTopic = "this";
  if (imageContext && imageContext.trim().length > 0) {
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
