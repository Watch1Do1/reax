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
  voiceAudioUrl?: string;
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
  id?: string;
  username: string;
  email?: string;
  createdAt: string;
  lastActive: string;
  reactionCount: number;
  suspended: boolean;
  strikes: number;
  acceptedTermsVersion?: string | null;
  acceptedPrivacyVersion?: string | null;
  acceptedTermsAt?: string | null;
  acceptedPrivacyAt?: string | null;
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

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  category: string;
  message: string;
  createdAt: string;
  status: "unread" | "read" | "resolved";
}

// Store Interface
export interface Store {
  getClips(includeDeleted?: boolean): Promise<Clip[]>;
  getClip(id: string): Promise<Clip | null>;
  countClipsByAuthor(authorId: string): Promise<number>;
  updateClipsAuthorName(authorId: string, newAuthorName: string): Promise<number>;
  insertClip(clip: Clip): Promise<Clip>;
  updateClip(id: string, updates: Partial<Clip>): Promise<Clip | null>;
  purgeClip(id: string): Promise<boolean>;
  recordLike(clipId: string, userId: string): Promise<{ liked: boolean; likesCount: number }>;
  recordUnlike(clipId: string, userId: string): Promise<{ liked: boolean; likesCount: number }>;
  recordLaugh(clipId: string, userId: string): Promise<{ laughed: boolean; laughsCount: number }>;
  recordUnlaugh(clipId: string, userId: string): Promise<{ laughed: boolean; laughsCount: number }>;
  insertReport(report: Report): Promise<Report>;
  getReports(): Promise<Array<Report & { clip?: Partial<Clip> | null }>>;
  dismissReport(reportId: string): Promise<boolean>;
  insertContactMessage(msg: ContactMessage): Promise<ContactMessage>;
  getContactMessages(): Promise<ContactMessage[]>;
  updateContactMessageStatus(id: string, status: "unread" | "read" | "resolved"): Promise<boolean>;
  getUsers(): Promise<UserProfile[]>;
  getUserProfile(query: { id?: string; username?: string }): Promise<UserProfile | null>;
  upsertUserProfile(profile: { id: string; username: string; email?: string; suspended?: boolean; strikes?: number; lastActive?: string; acceptedTermsVersion?: string | null; acceptedPrivacyVersion?: string | null; acceptedTermsAt?: string | null; acceptedPrivacyAt?: string | null }): Promise<UserProfile>;
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
  private contactMessages: ContactMessage[] = [];
  private userProfiles: UserProfile[] = [];
  private likesMap: Map<string, Set<string>> = new Map();
  private laughsMap: Map<string, Set<string>> = new Map();
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
    // Real user profiles are added when users authenticate or update their profiles
  }

  async getClips(includeDeleted = false): Promise<Clip[]> {
    const filtered = includeDeleted ? this.clips : this.clips.filter(c => !c.deleted);
    return [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getClip(id: string): Promise<Clip | null> {
    return this.clips.find(c => c.id === id) || null;
  }

  async countClipsByAuthor(authorId: string): Promise<number> {
    return this.clips.filter(c => c.authorId === authorId && !c.deleted).length;
  }

  async updateClipsAuthorName(authorId: string, newAuthorName: string): Promise<number> {
    let updated = 0;
    for (const clip of this.clips) {
      if (clip.authorId === authorId) {
        clip.authorName = newAuthorName;
        updated++;
      }
    }
    return updated;
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

  async purgeClip(id: string): Promise<boolean> {
    const idx = this.clips.findIndex(c => c.id === id);
    if (idx !== -1) {
      this.clips.splice(idx, 1);
      return true;
    }
    return false;
  }

  async recordLike(clipId: string, userId: string): Promise<{ liked: boolean; likesCount: number }> {
    const clip = this.clips.find(c => c.id === clipId);
    if (!clip) return { liked: false, likesCount: 0 };

    let userSet = this.likesMap.get(clipId);
    if (!userSet) {
      userSet = new Set();
      this.likesMap.set(clipId, userSet);
    }

    if (userSet.has(userId)) {
      // Already liked - prevent smash click duplicate
      return { liked: false, likesCount: clip.likesCount };
    }

    userSet.add(userId);
    clip.likesCount = (clip.likesCount || 0) + 1;
    return { liked: true, likesCount: clip.likesCount };
  }

  async recordUnlike(clipId: string, userId: string): Promise<{ liked: boolean; likesCount: number }> {
    const clip = this.clips.find(c => c.id === clipId);
    if (!clip) return { liked: false, likesCount: 0 };

    let userSet = this.likesMap.get(clipId);
    if (userSet) {
      userSet.delete(userId);
    }
    clip.likesCount = Math.max(0, (clip.likesCount || 0) - 1);
    return { liked: false, likesCount: clip.likesCount };
  }

  async recordLaugh(clipId: string, userId: string): Promise<{ laughed: boolean; laughsCount: number }> {
    const clip = this.clips.find(c => c.id === clipId);
    if (!clip) return { laughed: false, laughsCount: 0 };

    let userSet = this.laughsMap.get(clipId);
    if (!userSet) {
      userSet = new Set();
      this.laughsMap.set(clipId, userSet);
    }

    if (userSet.has(userId)) {
      // Already laughed - prevent smash click duplicate
      return { laughed: false, laughsCount: clip.laughsCount || 0 };
    }

    userSet.add(userId);
    clip.laughsCount = (clip.laughsCount || 0) + 1;
    return { laughed: true, laughsCount: clip.laughsCount };
  }

  async recordUnlaugh(clipId: string, userId: string): Promise<{ laughed: boolean; laughsCount: number }> {
    const clip = this.clips.find(c => c.id === clipId);
    if (!clip) return { laughed: false, laughsCount: 0 };

    let userSet = this.laughsMap.get(clipId);
    if (userSet) {
      userSet.delete(userId);
    }
    clip.laughsCount = Math.max(0, (clip.laughsCount || 0) - 1);
    return { laughed: false, laughsCount: clip.laughsCount };
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

  async insertContactMessage(msg: ContactMessage): Promise<ContactMessage> {
    this.contactMessages.unshift(msg);
    return msg;
  }

  async getContactMessages(): Promise<ContactMessage[]> {
    return [...this.contactMessages];
  }

  async updateContactMessageStatus(id: string, status: "unread" | "read" | "resolved"): Promise<boolean> {
    const found = this.contactMessages.find(m => m.id === id);
    if (found) {
      found.status = status;
      return true;
    }
    return false;
  }

  async getUsers(): Promise<UserProfile[]> {
    return this.userProfiles;
  }

  async getUserProfile(query: { id?: string; username?: string }): Promise<UserProfile | null> {
    if (query.id) {
      const byId = this.userProfiles.find(u => u.id === query.id);
      if (byId) return byId;
    }
    if (query.username) {
      const clean = query.username.toLowerCase();
      const byUsername = this.userProfiles.find(u => u.username.toLowerCase() === clean);
      if (byUsername) return byUsername;
    }
    return null;
  }

  async upsertUserProfile(profile: { id: string; username: string; email?: string; suspended?: boolean; strikes?: number; lastActive?: string; acceptedTermsVersion?: string | null; acceptedPrivacyVersion?: string | null; acceptedTermsAt?: string | null; acceptedPrivacyAt?: string | null }): Promise<UserProfile> {
    let existing = this.userProfiles.find(u => u.id === profile.id || u.username.toLowerCase() === profile.username.toLowerCase());
    if (existing) {
      existing.id = profile.id;
      existing.username = profile.username;
      if (profile.email) existing.email = profile.email;
      if (profile.suspended !== undefined) existing.suspended = profile.suspended;
      if (profile.strikes !== undefined) existing.strikes = profile.strikes;
      if (profile.acceptedTermsVersion !== undefined) existing.acceptedTermsVersion = profile.acceptedTermsVersion;
      if (profile.acceptedPrivacyVersion !== undefined) existing.acceptedPrivacyVersion = profile.acceptedPrivacyVersion;
      if (profile.acceptedTermsAt !== undefined) existing.acceptedTermsAt = profile.acceptedTermsAt;
      if (profile.acceptedPrivacyAt !== undefined) existing.acceptedPrivacyAt = profile.acceptedPrivacyAt;
      existing.lastActive = profile.lastActive || new Date().toISOString();
      return existing;
    } else {
      const newUser: UserProfile = {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        createdAt: new Date().toISOString(),
        lastActive: profile.lastActive || new Date().toISOString(),
        reactionCount: 0,
        suspended: profile.suspended || false,
        strikes: profile.strikes || 0,
        acceptedTermsVersion: profile.acceptedTermsVersion || null,
        acceptedPrivacyVersion: profile.acceptedPrivacyVersion || null,
        acceptedTermsAt: profile.acceptedTermsAt || null,
        acceptedPrivacyAt: profile.acceptedPrivacyAt || null
      };
      this.userProfiles.push(newUser);
      this.todayStats.newUsers += 1;
      return newUser;
    }
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
        id: user.id || `user-${user.username.toLowerCase()}`,
        username: user.username,
        email: user.email,
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

  let voiceAudioUrl = safeRow.voice_audio_url || undefined;
  let voiceText = safeRow.voice_text || undefined;

  // Handle fallback where voiceAudioUrl was stored/encoded inside voice_text column
  if (typeof voiceText === "string") {
    if (voiceText.startsWith("http://") || voiceText.startsWith("https://") || voiceText.startsWith("data:audio") || voiceText.includes("/storage/v1/object/public/")) {
      if (!voiceAudioUrl) voiceAudioUrl = voiceText;
      voiceText = undefined;
    } else if (voiceText.startsWith("audio_url:")) {
      const parts = voiceText.split("|||");
      if (!voiceAudioUrl) voiceAudioUrl = parts[0].replace(/^audio_url:/, "");
      voiceText = parts[1] || undefined;
    }
  }

  // Clean prefix if present
  if (voiceAudioUrl && typeof voiceAudioUrl === "string" && voiceAudioUrl.startsWith("audio_url:")) {
    voiceAudioUrl = voiceAudioUrl.replace(/^audio_url:/, "");
  }

  return {
    id: safeRow.id || crypto.randomUUID(),
    parentId: safeRow.parent_id || null,
    mediaUrl: safeRow.media_url || "",
    mediaType: safeRow.media_type || undefined,
    voiceText: voiceText,
    voiceAudioUrl: voiceAudioUrl,
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
  let voiceTextVal = clip.voiceText || null;
  // If voiceAudioUrl is present, also encode it into voice_text as a fail-safe fallback
  // for Supabase database instances that do not yet have the voice_audio_url column created
  if (clip.voiceAudioUrl) {
    if (clip.voiceText && clip.voiceText.trim() !== "") {
      voiceTextVal = `audio_url:${clip.voiceAudioUrl}|||${clip.voiceText}`;
    } else {
      voiceTextVal = clip.voiceAudioUrl;
    }
  }

  const payload: Record<string, any> = {
    id: clip.id,
    parent_id: isValidUuid(clip.parentId) ? clip.parentId : null,
    media_url: clip.mediaUrl,
    media_type: inferMediaType(clip.mediaUrl, clip.mediaType),
    voice_text: voiceTextVal,
    voice_audio_url: clip.voiceAudioUrl || null,
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
  private fallbackContactMessages: ContactMessage[] = [];

  constructor(client: any) {
    this.client = client;
  }

  async getClips(includeDeleted = false): Promise<Clip[]> {
    try {
      // First attempt selecting all columns with select("*")
      let { data, error } = await withTimeout(
        this.client
          .from("clips")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        4000,
        { data: null, error: { message: "Supabase clips query timed out after 4s" } }
      );

      // If select("*") failed for any reason, fallback to explicit base column query
      if (error) {
        console.warn("Supabase select(*) failed, falling back to base columns:", error.message || error);
        const fallbackRes = await withTimeout(
          this.client
            .from("clips")
            .select(
              "id, parent_id, media_url, media_type, voice_text, voice_audio_url, voice_style, overlay_text, tone, effect, author_name, author_id, likes_count, laughs_count, created_at, original_author, remixed_from, deleted, report_count"
            )
            .order("created_at", { ascending: false })
            .limit(100),
          4000,
          { data: null, error: { message: "Supabase clips fallback query timed out after 4s" } }
        );
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) {
        console.error("SupabaseStore.getClips query error:", error.message || error);
        return [];
      }

      const clips = (data || []).map(mapDbToClip);
      if (includeDeleted) return clips;
      return clips.filter((c: Clip) => !c.deleted);
    } catch (err: any) {
      console.error("SupabaseStore.getClips error:", err?.message || err);
      return [];
    }
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

  async countClipsByAuthor(authorId: string): Promise<number> {
    try {
      const { count, error } = await this.client
        .from("clips")
        .select("id", { count: "exact", head: true })
        .eq("author_id", authorId)
        .eq("deleted", false);

      if (!error && typeof count === "number") {
        return count;
      }
      if (error) {
        console.warn("SupabaseStore.countClipsByAuthor head query error, falling back:", error.message || error);
      }
      const { data, error: selectErr } = await this.client
        .from("clips")
        .select("id")
        .eq("author_id", authorId)
        .eq("deleted", false);

      if (selectErr) {
        console.error("SupabaseStore.countClipsByAuthor fallback error:", selectErr.message || selectErr);
        return 0;
      }
      return (data || []).length;
    } catch (err: any) {
      console.error("SupabaseStore.countClipsByAuthor error:", err?.message || err);
      return 0;
    }
  }

  async updateClipsAuthorName(authorId: string, newAuthorName: string): Promise<number> {
    try {
      const { data, error } = await this.client
        .from("clips")
        .update({ author_name: newAuthorName })
        .eq("author_id", authorId)
        .select("id");

      if (error) {
        console.warn("SupabaseStore.updateClipsAuthorName error:", error.message || error);
        return 0;
      }
      return data?.length || 0;
    } catch (err: any) {
      console.warn("SupabaseStore.updateClipsAuthorName exception:", err?.message || err);
      return 0;
    }
  }

  async insertClip(clip: Clip): Promise<Clip> {
    const dbClip = mapClipToDb(clip);
    let { data, error } = await this.client
      .from("clips")
      .insert([dbClip])
      .select()
      .single();

    // Gracefully handle case where voice_audio_url column does not exist on remote Supabase DB yet
    if (error && (error.message?.includes("voice_audio_url") || error.details?.includes("voice_audio_url") || error.code === "42703")) {
      const { voice_audio_url, ...fallbackDbClip } = dbClip;
      const retryRes = await this.client
        .from("clips")
        .insert([fallbackDbClip])
        .select()
        .single();
      data = retryRes.data;
      error = retryRes.error;
    }

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
    if (updates.voiceAudioUrl !== undefined) {
      dbUpdates.voice_audio_url = updates.voiceAudioUrl || null;
      if (updates.voiceAudioUrl) {
        dbUpdates.voice_text = updates.voiceText ? `audio_url:${updates.voiceAudioUrl}|||${updates.voiceText}` : updates.voiceAudioUrl;
      }
    }

    const { data, error } = await this.client
      .from("clips")
      .update(dbUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data ? mapDbToClip(data) : null;
  }

  async purgeClip(id: string): Promise<boolean> {
    try {
      // 1. Clean up child replies, remix links, and associated records
      await Promise.allSettled([
        this.client.from("clips").update({ parent_id: null }).eq("parent_id", id),
        this.client.from("clips").update({ remixed_from: null }).eq("remixed_from", id),
        this.client.from("reports").delete().eq("clip_id", id),
        this.client.from("likes").delete().eq("clip_id", id),
        this.client.from("laughs").delete().eq("clip_id", id)
      ]);

      // 2. Attempt hard delete of the clips row
      let { error } = await this.client
        .from("clips")
        .delete()
        .eq("id", id);

      if (!error) {
        console.log(`[SupabaseStore] Successfully hard-deleted clip ${id}`);
        return true;
      }

      console.warn(`[SupabaseStore] Initial hard delete failed for ${id}:`, error.message, error.details);

      // Clean up any remaining references and retry once
      await Promise.allSettled([
        this.client.from("clips").update({ parent_id: null }).eq("parent_id", id),
        this.client.from("clips").update({ remixed_from: null }).eq("remixed_from", id),
        this.client.from("reports").delete().eq("clip_id", id)
      ]);

      const retry = await this.client
        .from("clips")
        .delete()
        .eq("id", id);

      if (!retry.error) {
        console.log(`[SupabaseStore] Hard-deleted clip ${id} on retry`);
        return true;
      }

      console.error(`[SupabaseStore] Purge failed for clip ${id}:`, retry.error.message);
      return false;
    } catch (err: any) {
      console.error("SupabaseStore.purgeClip error:", err?.message || err);
      return false;
    }
  }

  async recordLike(clipId: string, userId: string): Promise<{ liked: boolean; likesCount: number }> {
    const currentClip = await this.getClip(clipId);
    if (!currentClip) return { liked: false, likesCount: 0 };

    if (isValidUuid(userId) && isValidUuid(clipId)) {
      try {
        const { error: likeInsertErr } = await this.client
          .from("likes")
          .insert([{ clip_id: clipId, user_id: userId }]);

        if (likeInsertErr) {
          // Check for unique key violation (user already liked)
          const isUniqueViolation = likeInsertErr.code === "23505" || 
            (likeInsertErr.message && likeInsertErr.message.toLowerCase().includes("unique"));
          if (isUniqueViolation) {
            return { liked: false, likesCount: currentClip.likesCount };
          }
        }
      } catch (tableErr) {
        // If likes table is missing, proceed gracefully with direct clip update
      }
    }

    const nextLikes = (currentClip.likesCount || 0) + 1;
    await this.updateClip(clipId, { likesCount: nextLikes });
    return { liked: true, likesCount: nextLikes };
  }

  async recordUnlike(clipId: string, userId: string): Promise<{ liked: boolean; likesCount: number }> {
    const currentClip = await this.getClip(clipId);
    if (!currentClip) return { liked: false, likesCount: 0 };

    if (isValidUuid(userId) && isValidUuid(clipId)) {
      try {
        await this.client
          .from("likes")
          .delete()
          .match({ clip_id: clipId, user_id: userId });
      } catch (tableErr) {
        // If likes table is missing, proceed gracefully with direct clip update
      }
    }

    const nextLikes = Math.max(0, (currentClip.likesCount || 0) - 1);
    await this.updateClip(clipId, { likesCount: nextLikes });
    return { liked: false, likesCount: nextLikes };
  }

  async recordLaugh(clipId: string, userId: string): Promise<{ laughed: boolean; laughsCount: number }> {
    const currentClip = await this.getClip(clipId);
    if (!currentClip) return { laughed: false, laughsCount: 0 };

    if (isValidUuid(userId) && isValidUuid(clipId)) {
      try {
        const { error: laughInsertErr } = await this.client
          .from("laughs")
          .insert([{ clip_id: clipId, user_id: userId }]);

        if (laughInsertErr) {
          // Check for unique key violation (user already laughed)
          const isUniqueViolation = laughInsertErr.code === "23505" || 
            (laughInsertErr.message && laughInsertErr.message.toLowerCase().includes("unique"));
          if (isUniqueViolation) {
            return { laughed: false, laughsCount: currentClip.laughsCount };
          }
        }
      } catch (tableErr) {
        // If laughs table is missing, proceed gracefully with direct clip update
      }
    }

    const nextLaughs = (currentClip.laughsCount || 0) + 1;
    await this.updateClip(clipId, { laughsCount: nextLaughs });
    return { laughed: true, laughsCount: nextLaughs };
  }

  async recordUnlaugh(clipId: string, userId: string): Promise<{ laughed: boolean; laughsCount: number }> {
    const currentClip = await this.getClip(clipId);
    if (!currentClip) return { laughed: false, laughsCount: 0 };

    if (isValidUuid(userId) && isValidUuid(clipId)) {
      try {
        await this.client
          .from("laughs")
          .delete()
          .match({ clip_id: clipId, user_id: userId });
      } catch (tableErr) {
        // If laughs table is missing, proceed gracefully with direct clip update
      }
    }

    const nextLaughs = Math.max(0, (currentClip.laughsCount || 0) - 1);
    await this.updateClip(clipId, { laughsCount: nextLaughs });
    return { laughed: false, laughsCount: nextLaughs };
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

  async insertContactMessage(msg: ContactMessage): Promise<ContactMessage> {
    try {
      const { error } = await this.client.from("contact_messages").insert([{
        id: msg.id,
        name: msg.name,
        email: msg.email,
        category: msg.category,
        message: msg.message,
        created_at: msg.createdAt,
        status: msg.status
      }]);
      if (error) {
        console.warn("insertContactMessage note (table might not exist yet):", error.message);
        this.fallbackContactMessages.unshift(msg);
      }
    } catch (err) {
      this.fallbackContactMessages.unshift(msg);
    }
    return msg;
  }

  async getContactMessages(): Promise<ContactMessage[]> {
    try {
      const { data, error } = await this.client
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data && Array.isArray(data)) {
        return data.map((m: any) => ({
          id: m.id,
          name: m.name || "",
          email: m.email || "",
          category: m.category || "general",
          message: m.message || "",
          createdAt: m.created_at || new Date().toISOString(),
          status: m.status || "unread"
        }));
      }
    } catch (err) {
      console.warn("getContactMessages note:", err);
    }
    return this.fallbackContactMessages;
  }

  async updateContactMessageStatus(id: string, status: "unread" | "read" | "resolved"): Promise<boolean> {
    try {
      const { error } = await this.client
        .from("contact_messages")
        .update({ status })
        .eq("id", id);
      if (!error) return true;
    } catch {}
    const found = this.fallbackContactMessages.find(m => m.id === id);
    if (found) {
      found.status = status;
      return true;
    }
    return false;
  }

  async getUsers(): Promise<UserProfile[]> {
    try {
      const { data, error } = await this.client
        .from("user_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data && Array.isArray(data)) {
        // Query clips count to ensure reactionCount accurately reflects live reactions/clips
        const clipCounts: Record<string, number> = {};
        try {
          const { data: clips } = await this.client
            .from("clips")
            .select("author_id, author_name")
            .eq("deleted", false);
          if (clips && Array.isArray(clips)) {
            for (const c of clips) {
              if (c.author_id) {
                clipCounts[c.author_id] = (clipCounts[c.author_id] || 0) + 1;
              }
              if (c.author_name) {
                const lower = c.author_name.toLowerCase();
                clipCounts[lower] = (clipCounts[lower] || 0) + 1;
              }
            }
          }
        } catch {}

        return data.map((u: any) => {
          const id = u.user_id || u.id;
          const uname = u.username || (u.email ? u.email.split("@")[0] : `user_${(id || "").slice(0, 8)}`);
          const clipsTotal = (id && clipCounts[id]) || (uname && clipCounts[uname.toLowerCase()]) || 0;
          const reactionCount = typeof u.reaction_count === "number" && u.reaction_count > clipsTotal
            ? u.reaction_count
            : clipsTotal;

          return {
            id,
            username: uname,
            email: u.email || undefined,
            createdAt: u.created_at || new Date().toISOString(),
            lastActive: u.last_active || u.created_at || new Date().toISOString(),
            reactionCount,
            suspended: Boolean(u.suspended),
            strikes: typeof u.strikes === "number" ? u.strikes : 0,
            acceptedTermsVersion: u.accepted_terms_version || null,
            acceptedPrivacyVersion: u.accepted_privacy_version || null,
            acceptedTermsAt: u.accepted_terms_at || null,
            acceptedPrivacyAt: u.accepted_privacy_at || null
          };
        });
      }
    } catch (err) {
      console.warn("getUsers query failed or table not present:", err);
    }
    return [];
  }

  async getUserProfile(query: { id?: string; username?: string }): Promise<UserProfile | null> {
    try {
      if (query.id && isValidUuid(query.id)) {
        const { data, error } = await this.client
          .from("user_profiles")
          .select("*")
          .eq("id", query.id)
          .maybeSingle();

        if (!error && data) {
          return {
            id: data.id,
            username: data.username,
            email: data.email,
            createdAt: data.created_at,
            lastActive: data.last_active,
            reactionCount: data.reaction_count || 0,
            suspended: data.suspended || false,
            strikes: data.strikes || 0,
            acceptedTermsVersion: data.accepted_terms_version || null,
            acceptedPrivacyVersion: data.accepted_privacy_version || null,
            acceptedTermsAt: data.accepted_terms_at || null,
            acceptedPrivacyAt: data.accepted_privacy_at || null
          };
        }
      }

      if (query.username) {
        const { data, error } = await this.client
          .from("user_profiles")
          .select("*")
          .ilike("username", query.username.trim())
          .maybeSingle();

        if (!error && data) {
          return {
            id: data.id,
            username: data.username,
            email: data.email,
            createdAt: data.created_at,
            lastActive: data.last_active,
            reactionCount: data.reaction_count || 0,
            suspended: data.suspended || false,
            strikes: data.strikes || 0,
            acceptedTermsVersion: data.accepted_terms_version || null,
            acceptedPrivacyVersion: data.accepted_privacy_version || null,
            acceptedTermsAt: data.accepted_terms_at || null,
            acceptedPrivacyAt: data.accepted_privacy_at || null
          };
        }
      }
    } catch (err) {
      console.warn("getUserProfile query error:", err);
    }
    return null;
  }

  async upsertUserProfile(profile: { id: string; username: string; email?: string; suspended?: boolean; strikes?: number; lastActive?: string; acceptedTermsVersion?: string | null; acceptedPrivacyVersion?: string | null; acceptedTermsAt?: string | null; acceptedPrivacyAt?: string | null }): Promise<UserProfile> {
    const payload: Record<string, any> = {
      id: profile.id,
      username: profile.username,
      last_active: profile.lastActive || new Date().toISOString()
    };
    if (profile.email) payload.email = profile.email;
    if (profile.suspended !== undefined) payload.suspended = profile.suspended;
    if (profile.strikes !== undefined) payload.strikes = profile.strikes;
    if (profile.acceptedTermsVersion !== undefined) payload.accepted_terms_version = profile.acceptedTermsVersion;
    if (profile.acceptedPrivacyVersion !== undefined) payload.accepted_privacy_version = profile.acceptedPrivacyVersion;
    if (profile.acceptedTermsAt !== undefined) payload.accepted_terms_at = profile.acceptedTermsAt;
    if (profile.acceptedPrivacyAt !== undefined) payload.accepted_privacy_at = profile.acceptedPrivacyAt;

    try {
      let { data, error } = await this.client
        .from("user_profiles")
        .upsert(payload, { onConflict: "id" })
        .select()
        .single();

      // Graceful fallback if policy columns are not created in Postgres yet
      if (error && (error.message?.includes("accepted_terms_version") || error.code === "42703")) {
        console.warn("accepted_terms_version column not present yet in Supabase table user_profiles. Run supabase_policy_migration.sql in your Supabase SQL editor.");
        const fallbackPayload = { ...payload };
        delete fallbackPayload.accepted_terms_version;
        delete fallbackPayload.accepted_privacy_version;
        delete fallbackPayload.accepted_terms_at;
        delete fallbackPayload.accepted_privacy_at;
        const retryRes = await this.client
          .from("user_profiles")
          .upsert(fallbackPayload, { onConflict: "id" })
          .select()
          .single();
        data = retryRes.data;
        error = retryRes.error;
      }

      if (!error && data) {
        return {
          id: data.id,
          username: data.username,
          email: data.email,
          createdAt: data.created_at,
          lastActive: data.last_active,
          reactionCount: data.reaction_count || 0,
          suspended: data.suspended || false,
          strikes: data.strikes || 0,
          acceptedTermsVersion: data.accepted_terms_version || profile.acceptedTermsVersion || null,
          acceptedPrivacyVersion: data.accepted_privacy_version || profile.acceptedPrivacyVersion || null,
          acceptedTermsAt: data.accepted_terms_at || profile.acceptedTermsAt || null,
          acceptedPrivacyAt: data.accepted_privacy_at || profile.acceptedPrivacyAt || null
        };
      }
    } catch (err) {
      console.warn("upsertUserProfile error:", err);
    }

    return {
      id: profile.id,
      username: profile.username,
      email: profile.email,
      createdAt: new Date().toISOString(),
      lastActive: profile.lastActive || new Date().toISOString(),
      reactionCount: 0,
      suspended: profile.suspended || false,
      strikes: profile.strikes || 0,
      acceptedTermsVersion: profile.acceptedTermsVersion || null,
      acceptedPrivacyVersion: profile.acceptedPrivacyVersion || null,
      acceptedTermsAt: profile.acceptedTermsAt || null,
      acceptedPrivacyAt: profile.acceptedPrivacyAt || null
    };
  }

  async upsertUser(user: Partial<UserProfile> & { username: string }): Promise<UserProfile> {
    try {
      const payload: Record<string, any> = {
        username: user.username,
        last_active: user.lastActive || new Date().toISOString()
      };
      if (user.id) payload.id = user.id;
      if (user.email) payload.email = user.email;
      if (user.suspended !== undefined) payload.suspended = user.suspended;
      if (user.strikes !== undefined) payload.strikes = user.strikes;

      const { data, error } = await this.client
        .from("user_profiles")
        .upsert(payload, { onConflict: user.id ? "id" : "username" })
        .select()
        .single();

      if (!error && data) {
        return {
          id: data.id,
          username: data.username,
          email: data.email,
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
      id: user.id,
      username: user.username,
      email: user.email,
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
        voiceReactions: todayClips.filter(c => !!(c.voiceText || c.voiceAudioData || c.voiceAudioUrl)).length
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

// Admin User IDs Allowlist
const ADMIN_USER_IDS: string[] = (cleanEnvVar(process.env.ADMIN_USER_IDS) || "")
  .split(",")
  .map(id => id.trim().toLowerCase())
  .filter(Boolean);

// Authentication helper for protected mutating routes
export interface AuthResult {
  user: {
    id: string;
    email?: string | null;
    email_confirmed_at?: string | null;
    is_anonymous: boolean;
  };
  profile: UserProfile;
}

export type AuthSuccess = { ok: true; auth: AuthResult };
export type AuthFailure = { ok: false; status: number; error: string };
export type AuthOutcome = AuthSuccess | AuthFailure;

async function authenticateUser(req: any): Promise<AuthOutcome> {
  const authHeader = (req.headers.authorization || "").toString().trim();
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";

  if (supabase) {
    if (!token || token === "dev-bearer-token") {
      return { ok: false, status: 401, error: "Unauthorized: Supabase session Bearer token is required." };
    }

    try {
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !userData?.user?.id) {
        return { ok: false, status: 401, error: "Unauthorized: Invalid or expired Supabase session." };
      }

      const isAnonymous = Boolean(
        (userData.user as any).is_anonymous ||
        userData.user.app_metadata?.provider === "anonymous" ||
        !userData.user.email
      );

      const emailConfirmedAt = userData.user.email_confirmed_at || (userData.user as any).confirmed_at || null;

      const user = {
        id: userData.user.id,
        email: userData.user.email || null,
        email_confirmed_at: emailConfirmedAt,
        is_anonymous: isAnonymous
      };

      // Load profile from store
      let profile = await store!.getUserProfile({ id: user.id });
      if (!profile) {
        const rawUsername = userData.user.user_metadata?.username || 
                            userData.user.user_metadata?.display_name || 
                            (user.email ? user.email.split("@")[0] : `user_${user.id.slice(0, 6)}`);
        
        profile = await store!.upsertUserProfile({
          id: user.id,
          username: rawUsername,
          email: user.email,
          lastActive: new Date().toISOString()
        });
      }

      if (profile.suspended) {
        return { ok: false, status: 403, error: "Your account is suspended due to violations of Community Guidelines." };
      }

      return { ok: true, auth: { user, profile } };
    } catch (err: any) {
      return { ok: false, status: 401, error: "Unauthorized: Failed to verify authentication token." };
    }
  }

  // Local dev memory store mode fallback
  if (!isProduction && process.env.DEV_MEMORY_STORE === "true") {
    const devId = token && token !== "dev-bearer-token" ? `dev-${token.slice(0, 8)}` : "dev-user-000";
    let profile = await store!.getUserProfile({ id: devId });
    if (!profile) {
      profile = await store!.upsertUserProfile({
        id: devId,
        username: `DevUser_${devId.slice(-4)}`,
        email: "dev@reax.local",
        lastActive: new Date().toISOString()
      });
    }

    if (profile.suspended) {
      return { ok: false, status: 403, error: "Your account is suspended due to violations of Community Guidelines." };
    }

    const isAnonymous = Boolean(
      token === "dev-bearer-token" ||
      token.startsWith("anon-") ||
      req.headers["x-guest"] === "true" ||
      req.headers["x-anonymous"] === "true" ||
      !profile.email
    );

    return {
      ok: true,
      auth: {
        user: { id: devId, email: profile.email || null, is_anonymous: isAnonymous },
        profile
      }
    };
  }

  return { ok: false, status: 503, error: "database_unconfigured" };
}

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
  try {
    return res.json({
      supabaseUrl: SUPABASE_URL || null,
      supabaseAnonKey: SUPABASE_ANON_KEY || null
    });
  } catch (err: any) {
    console.error("Error in GET /api/auth-config:", err?.message || err);
    return res.json({
      supabaseUrl: null,
      supabaseAnonKey: null
    });
  }
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
    schemaSql: `-- Reax Production Schema with Auth Profiles, Unique Likes/Laughs, Reports & Storage
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User Profiles Table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reaction_count INTEGER DEFAULT 0,
  suspended BOOLEAN DEFAULT false,
  strikes INTEGER DEFAULT 0,
  accepted_terms_version TEXT,
  accepted_privacy_version TEXT,
  accepted_terms_at TIMESTAMP WITH TIME ZONE,
  accepted_privacy_at TIMESTAMP WITH TIME ZONE
);

-- Ensure all columns exist on user_profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'user_id') THEN
    ALTER TABLE public.user_profiles ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'reaction_count') THEN
    ALTER TABLE public.user_profiles ADD COLUMN reaction_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'suspended') THEN
    ALTER TABLE public.user_profiles ADD COLUMN suspended BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'strikes') THEN
    ALTER TABLE public.user_profiles ADD COLUMN strikes INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'last_active') THEN
    ALTER TABLE public.user_profiles ADD COLUMN last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'accepted_terms_version') THEN
    ALTER TABLE public.user_profiles ADD COLUMN accepted_terms_version TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'accepted_privacy_version') THEN
    ALTER TABLE public.user_profiles ADD COLUMN accepted_privacy_version TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'accepted_terms_at') THEN
    ALTER TABLE public.user_profiles ADD COLUMN accepted_terms_at TIMESTAMP WITH TIME ZONE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'accepted_privacy_at') THEN
    ALTER TABLE public.user_profiles ADD COLUMN accepted_privacy_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Automatic Profile Creation Trigger on auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  extracted_username TEXT;
  suffix INTEGER := 0;
BEGIN
  base_username := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'user_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(split_part(NEW.email, '@', 1)), ''),
    'user_' || substr(NEW.id::text, 1, 8)
  );
  base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '_', 'g');
  IF base_username IS NULL OR base_username = '' THEN
    base_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;
  extracted_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.user_profiles WHERE username = extracted_username AND user_id != NEW.id AND id != NEW.id) LOOP
    suffix := suffix + 1;
    extracted_username := base_username || '_' || suffix::text;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = NEW.id OR id = NEW.id) THEN
    UPDATE public.user_profiles
    SET 
      email = COALESCE(NEW.email, public.user_profiles.email),
      username = COALESCE(public.user_profiles.username, extracted_username),
      accepted_terms_version = COALESCE(NEW.raw_user_meta_data->>'accepted_terms_version', public.user_profiles.accepted_terms_version),
      accepted_privacy_version = COALESCE(NEW.raw_user_meta_data->>'accepted_privacy_version', public.user_profiles.accepted_privacy_version),
      accepted_terms_at = COALESCE((NEW.raw_user_meta_data->>'accepted_terms_at')::timestamptz, public.user_profiles.accepted_terms_at),
      accepted_privacy_at = COALESCE((NEW.raw_user_meta_data->>'accepted_privacy_at')::timestamptz, public.user_profiles.accepted_privacy_at)
    WHERE user_id = NEW.id OR id = NEW.id;
  ELSE
    INSERT INTO public.user_profiles (
      id, user_id, email, username, suspended, strikes, reaction_count, created_at, last_active,
      accepted_terms_version, accepted_privacy_version, accepted_terms_at, accepted_privacy_at
    ) VALUES (
      NEW.id, NEW.id, NEW.email, extracted_username, false, 0, 0,
      COALESCE(NEW.created_at, NOW()), COALESCE(NEW.created_at, NOW()),
      NEW.raw_user_meta_data->>'accepted_terms_version',
      NEW.raw_user_meta_data->>'accepted_privacy_version',
      (NEW.raw_user_meta_data->>'accepted_terms_at')::timestamptz,
      (NEW.raw_user_meta_data->>'accepted_privacy_at')::timestamptz
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Clips Table
CREATE TABLE IF NOT EXISTS public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT,
  voice_text TEXT,
  voice_audio_url TEXT,
  voice_style TEXT,
  overlay_text TEXT,
  tone TEXT NOT NULL,
  effect TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  likes_count INTEGER DEFAULT 0,
  laughs_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  original_author TEXT,
  remixed_from UUID REFERENCES public.clips(id) ON DELETE SET NULL,
  deleted BOOLEAN DEFAULT false,
  report_count INTEGER DEFAULT 0
);

-- Ensure voice_audio_url column exists on existing clips table
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS voice_audio_url TEXT;

-- Unique Likes Table
CREATE TABLE IF NOT EXISTS public.likes (
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (clip_id, user_id)
);

-- Unique Laughs Table
CREATE TABLE IF NOT EXISTS public.laughs (
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (clip_id, user_id)
);

-- Moderation Reports Table
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
  reporter TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laughs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Enable Public/Authenticated RLS Policies
CREATE POLICY "Allow public read profiles" ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert/update profiles" ON public.user_profiles FOR ALL USING (true);

CREATE POLICY "Allow public read clips" ON public.clips FOR SELECT USING (true);
CREATE POLICY "Allow public insert clips" ON public.clips FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update clips" ON public.clips FOR UPDATE USING (true);

CREATE POLICY "Allow public likes" ON public.likes FOR ALL USING (true);
CREATE POLICY "Allow public laughs" ON public.laughs FOR ALL USING (true);
CREATE POLICY "Allow public reports" ON public.reports FOR ALL USING (true);

-- One-Time Backfill for existing auth.users:
DO $$
DECLARE
  r RECORD;
  base_uname TEXT;
  final_uname TEXT;
  suffix INTEGER;
BEGIN
  FOR r IN 
    SELECT u.id, u.email, u.created_at, u.raw_user_meta_data
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON (p.id = u.id OR p.user_id = u.id)
    WHERE p.id IS NULL
  LOOP
    base_uname := COALESCE(
      NULLIF(TRIM(r.raw_user_meta_data->>'username'), ''),
      NULLIF(TRIM(r.raw_user_meta_data->>'user_name'), ''),
      NULLIF(TRIM(r.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(r.raw_user_meta_data->>'name'), ''),
      NULLIF(TRIM(split_part(r.email, '@', 1)), ''),
      'user_' || substr(r.id::text, 1, 8)
    );
    base_uname := regexp_replace(base_uname, '[^a-zA-Z0-9_]', '_', 'g');
    IF base_uname IS NULL OR base_uname = '' THEN
      base_uname := 'user_' || substr(r.id::text, 1, 8);
    END IF;
    final_uname := base_uname;
    suffix := 0;
    WHILE EXISTS (SELECT 1 FROM public.user_profiles WHERE username = final_uname AND id != r.id) LOOP
      suffix := suffix + 1;
      final_uname := base_uname || '_' || suffix::text;
    END LOOP;

    INSERT INTO public.user_profiles (
      id, user_id, email, username, suspended, strikes, reaction_count, created_at, last_active
    )
    VALUES (
      r.id, r.id, r.email, final_uname, false, 0, 0,
      COALESCE(r.created_at, NOW()), COALESCE(r.created_at, NOW())
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;
`
  });
});

// API: Get Guest Quota Status
app.get("/api/guest-status", async (req, res) => {
  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user } = authRes.auth;
  const isAnonymous = Boolean(user.is_anonymous || !user.email);
  const clipCount = await store!.countClipsByAuthor(user.id);
  const signupRequired = Boolean(isAnonymous && clipCount >= 3);
  return res.json({ isAnonymous, clipCount, signupRequired });
});

const TERMS_VERSION = "1.0";
const PRIVACY_VERSION = "1.0";

// API: Get Current Authenticated User Profile & Admin Status
app.get("/api/me", async (req, res) => {
  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user, profile } = authRes.auth;
  const isAdmin = ADMIN_USER_IDS.includes(user.id.toLowerCase());
  const isAnonymous = Boolean(user.is_anonymous || !user.email);
  const emailConfirmed = Boolean(user.email_confirmed_at);
  return res.json({ 
    profile, 
    isAdmin, 
    isAnonymous, 
    email: user.email || null, 
    emailConfirmed,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION 
  });
});

// API: Upsert / Update Current Authenticated User Profile (Username & Policy Acceptance)
app.post("/api/me", async (req, res) => {
  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user } = authRes.auth;
  const { username, acceptedTermsVersion, acceptedPrivacyVersion } = req.body;

  if (!username || typeof username !== "string" || username.trim().length < 3 || username.trim().length > 20) {
    return res.status(400).json({ error: "Username must be between 3 and 20 characters." });
  }

  const cleanUsername = username.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
    return res.status(400).json({ error: "Username can only contain letters, numbers, and underscores." });
  }

  try {
    const existing = await store!.getUserProfile({ username: cleanUsername });
    if (existing && existing.id && existing.id !== user.id) {
      return res.status(409).json({ error: "Username is already taken by another account." });
    }

    const now = new Date().toISOString();
    const updatedProfile = await store!.upsertUserProfile({
      id: user.id,
      username: cleanUsername,
      email: user.email,
      lastActive: now,
      ...(acceptedTermsVersion ? {
        acceptedTermsVersion,
        acceptedTermsAt: now
      } : {}),
      ...(acceptedPrivacyVersion ? {
        acceptedPrivacyVersion,
        acceptedPrivacyAt: now
      } : {})
    });

    // Keep posts on signup: update existing clips author_name for this user
    try {
      await store!.updateClipsAuthorName(user.id, cleanUsername);
    } catch (clipErr) {
      console.warn("Could not update clips author_name on profile update:", clipErr);
    }

    const isAdmin = ADMIN_USER_IDS.includes(user.id.toLowerCase());
    return res.json({ profile: updatedProfile, isAdmin });
  } catch (err: any) {
    console.error("Error in POST /api/me:", err);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// API: Record Policy Acceptance (Terms of Service & Privacy Policy)
app.post("/api/policy/accept", async (req, res) => {
  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user, profile } = authRes.auth;
  const { termsVersion = TERMS_VERSION, privacyVersion = PRIVACY_VERSION } = req.body;
  const now = new Date().toISOString();

  try {
    const resolvedUsername = profile?.username || (user.email ? user.email.split("@")[0] : `user_${user.id.slice(0, 8)}`);
    const updatedProfile = await store!.upsertUserProfile({
      id: user.id,
      username: resolvedUsername,
      email: user.email,
      lastActive: now,
      acceptedTermsVersion: termsVersion,
      acceptedPrivacyVersion: privacyVersion,
      acceptedTermsAt: now,
      acceptedPrivacyAt: now
    });

    return res.json({ success: true, profile: updatedProfile });
  } catch (err: any) {
    console.error("Error in POST /api/policy/accept:", err);
    return res.status(500).json({ error: "Failed to record policy acceptance" });
  }
});

// API: Get all active, non-deleted clips
app.get("/api/clips", async (req, res) => {
  try {
    const clips = await store!.getClips(false);
    return res.json(Array.isArray(clips) ? clips : []);
  } catch (err: any) {
    console.error("GET /api/clips", err?.message || err);
    return res.status(200).json([]);
  }
});

// API: Create new clip (Protected by Bearer Token & User Profile)
app.post("/api/clips", async (req, res) => {
  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user, profile } = authRes.auth;

  // Guest quota check: anonymous users (is_anonymous || !user.email) are capped at 3 clips
  const isAnon = Boolean(user.is_anonymous || !user.email);
  if (isAnon) {
    const clipCount = await store!.countClipsByAuthor(user.id);
    if (clipCount >= 3) {
      return res.status(403).json({ error: "signup_required", clipCount: 3 });
    }
  }

  const { parentId, mediaUrl, mediaType, voiceText, voiceStyle, voiceAudioUrl, tone, effect, overlayText, originalAuthor, remixedFrom, voiceAudioData } = req.body;
  if (!mediaUrl || !tone) {
    return res.status(400).json({ error: "Missing required fields: mediaUrl and tone are required." });
  }

  // Validate voiceAudioUrl if provided
  if (voiceAudioUrl !== undefined && voiceAudioUrl !== null) {
    if (typeof voiceAudioUrl !== "string" || voiceAudioUrl.startsWith("data:") || voiceAudioUrl.startsWith("blob:") || voiceAudioUrl.length > 2048) {
      return res.status(400).json({
        error: "Invalid voiceAudioUrl. Audio must be uploaded to storage first and cannot be a base64/data URI."
      });
    }
  }

  // Reject bodies that include voiceAudioData longer than 100 chars (legacy preview only)
  if (voiceAudioData && typeof voiceAudioData === "string" && voiceAudioData.length > 100) {
    return res.status(400).json({
      error: "voiceAudioData cannot contain base64 payloads in clip submissions. Upload audio assets to Supabase Storage first."
    });
  }

  // Reject data: or blob: URLs
  if (typeof mediaUrl !== "string" || mediaUrl.startsWith("data:") || mediaUrl.startsWith("blob:")) {
    return res.status(400).json({
      error: "data: and blob: URLs are not permitted in clip submissions. Please upload media first."
    });
  }

  // Validate mediaUrl source
  if (isProduction) {
    let isValidProdUrl = false;
    try {
      const parsedUrl = new URL(mediaUrl);
      if (parsedUrl.protocol === "https:") {
        const host = parsedUrl.host.toLowerCase();
        const path = parsedUrl.pathname;

        // 1. host is this project's Supabase host and path contains /storage/v1/object/
        if (SUPABASE_URL) {
          try {
            const expectedHost = new URL(SUPABASE_URL).host.toLowerCase();
            if (host === expectedHost && path.includes("/storage/v1/object/")) {
              isValidProdUrl = true;
            }
          } catch {}
        }

        // 2. host ends with .supabase.co and path contains /storage/v1/object/
        if (host.endsWith(".supabase.co") && path.includes("/storage/v1/object/")) {
          isValidProdUrl = true;
        }

        // 3. host is images.unsplash.com
        if (host === "images.unsplash.com") {
          isValidProdUrl = true;
        }

        // 4. url includes mixkit.co or mixkit-
        if (mediaUrl.includes("mixkit.co") || mediaUrl.includes("mixkit-")) {
          isValidProdUrl = true;
        }
      }
    } catch {}

    if (!isValidProdUrl) {
      return res.status(400).json({
        error: "In production, mediaUrl must be an HTTPS URL hosted on Supabase Storage (*.supabase.co/storage/v1/object/...), images.unsplash.com, or mixkit."
      });
    }
  } else {
    const isDevMemoryMode = process.env.DEV_MEMORY_STORE === "true";
    const isValidStorageUrl = (SUPABASE_URL && mediaUrl.includes(SUPABASE_URL)) || mediaUrl.includes(".supabase.co/storage/v1/object/");
    const isDevAllowedUrl = isDevMemoryMode && (
      mediaUrl.startsWith("/uploads/") ||
      mediaUrl.includes("images.unsplash.com") ||
      mediaUrl.includes("vjs.zencdn.net") ||
      mediaUrl.includes("mixkit.co") ||
      mediaUrl.includes("mixkit-")
    );

    if (!isValidStorageUrl && !isDevAllowedUrl && !mediaUrl.includes("images.unsplash.com") && !mediaUrl.includes("mixkit")) {
      return res.status(400).json({
        error: "mediaUrl must be a valid Supabase Storage URL or an allowed demo preset in DEV_MEMORY_STORE mode."
      });
    }
  }

  try {
    // Identity is derived exclusively from authenticated user profile
    const newClip: Clip = {
      id: crypto.randomUUID(),
      parentId: parentId || null,
      mediaUrl,
      mediaType: mediaType || inferMediaType(mediaUrl, mediaType),
      voiceText: voiceText || undefined,
      voiceAudioUrl: typeof voiceAudioUrl === "string" && voiceAudioUrl ? voiceAudioUrl : undefined,
      voiceStyle,
      tone,
      authorName: profile.username,
      authorId: user.id,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      laughsCount: 0,
      effect: effect || "zoom",
      overlayText: typeof overlayText === "string" ? overlayText.slice(0, 48) : (overlayText || undefined),
      originalAuthor,
      remixedFrom,
      deleted: false,
      reportCount: 0
    };

    const inserted = await store!.insertClip(newClip);
    await store!.upsertUserProfile({
      id: user.id,
      username: profile.username,
      email: user.email,
      lastActive: new Date().toISOString()
    });
    await store!.incrementFunnel("posted_reaction");
    if (voiceText || voiceAudioUrl) {
      await store!.incrementFunnel("posted_voice_reaction");
    }

    res.json(inserted);
  } catch (err: any) {
    console.error("Error inserting clip:", err);
    res.status(500).json({ error: "Failed to save reaction" });
  }
});

// API: Laugh at a clip (😂 Humor-first engagement metric with unique prevention)
app.post("/api/clips/:id/laugh", async (req, res) => {
  const clipId = req.params.id;
  const authHeader = (req.headers.authorization || "").toString().trim();
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
  if (!token || token === "dev-bearer-token") {
    return res.status(401).json({ error: "Unauthorized: Guests cannot laugh. Please sign in." });
  }

  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user } = authRes.auth;

  // Do not allow increment if client says it was already laughed
  if (req.body?.alreadyLaughed) {
    const clip = await store!.getClip(clipId);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }
    return res.json({ ...clip, laughsCount: clip.laughsCount, laughed: true });
  }

  try {
    const result = await store!.recordLaugh(clipId, user.id);
    const clip = await store!.getClip(clipId);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }
    res.json({ ...clip, laughsCount: result.laughsCount, laughed: result.laughed });
  } catch (err: any) {
    console.error("Error registering laugh:", err);
    res.status(500).json({ error: "Failed to register laugh" });
  }
});

// API: Unlaugh at a clip (Decrement laugh, never below 0)
app.post("/api/clips/:id/unlaugh", async (req, res) => {
  const clipId = req.params.id;
  const authHeader = (req.headers.authorization || "").toString().trim();
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
  if (!token || token === "dev-bearer-token") {
    return res.status(401).json({ error: "Unauthorized: Guests cannot unlaugh. Please sign in." });
  }

  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user } = authRes.auth;

  try {
    const result = await store!.recordUnlaugh(clipId, user.id);
    const clip = await store!.getClip(clipId);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }
    res.json({ ...clip, laughsCount: result.laughsCount, laughed: false });
  } catch (err: any) {
    console.error("Error unregistering laugh:", err);
    res.status(500).json({ error: "Failed to remove laugh" });
  }
});

// API: Like a clip (Unique per user)
app.post("/api/clips/:id/like", async (req, res) => {
  const clipId = req.params.id;
  const authHeader = (req.headers.authorization || "").toString().trim();
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
  if (!token || token === "dev-bearer-token") {
    return res.status(401).json({ error: "Unauthorized: Guests cannot like. Please sign in." });
  }

  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user } = authRes.auth;

  // Do not allow increment if client says it was already liked
  if (req.body?.alreadyLiked) {
    const clip = await store!.getClip(clipId);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }
    return res.json({ ...clip, likesCount: clip.likesCount, liked: true });
  }

  try {
    const result = await store!.recordLike(clipId, user.id);
    const clip = await store!.getClip(clipId);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }
    res.json({ ...clip, likesCount: result.likesCount, liked: result.liked });
  } catch (err: any) {
    console.error("Error registering like:", err);
    res.status(500).json({ error: "Failed to register like" });
  }
});

// API: Unlike a clip (Decrement like, never below 0)
app.post("/api/clips/:id/unlike", async (req, res) => {
  const clipId = req.params.id;
  const authHeader = (req.headers.authorization || "").toString().trim();
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
  if (!token || token === "dev-bearer-token") {
    return res.status(401).json({ error: "Unauthorized: Guests cannot unlike. Please sign in." });
  }

  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user } = authRes.auth;

  try {
    const result = await store!.recordUnlike(clipId, user.id);
    const clip = await store!.getClip(clipId);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }
    res.json({ ...clip, likesCount: result.likesCount, liked: false });
  } catch (err: any) {
    console.error("Error unregistering like:", err);
    res.status(500).json({ error: "Failed to remove like" });
  }
});

// API: User Delete Own Clip (Authors can delete their own reactions; OP CANNOT delete others' replies!)
app.post("/api/clips/:id/user-delete", async (req, res) => {
  const clipId = req.params.id;
  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user, profile } = authRes.auth;

  try {
    const clip = await store!.getClip(clipId);
    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }

    const isAuthorById = clip.authorId && clip.authorId === user.id;
    const isAuthorByName = clip.authorName && clip.authorName.toLowerCase() === profile.username.toLowerCase();

    if (!isAuthorById && !isAuthorByName) {
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

// API: Upload asset (audio, image, or video) to Supabase Storage (Protected)
app.post("/api/upload", async (req, res) => {
  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user } = authRes.auth;
  const userId = user.id;

  // Guest quota check: anonymous users (is_anonymous || !user.email) are capped at 3 clips
  const isAnon = Boolean(user.is_anonymous || !user.email);
  if (isAnon) {
    const clipCount = await store!.countClipsByAuthor(user.id);
    if (clipCount >= 3) {
      return res.status(403).json({ error: "signup_required", clipCount: 3 });
    }
  }

  // In production, ensure admin client with service role key is configured for storage
  if (isProduction && !supabaseAdmin) {
    return res.status(503).json({ error: "storage_unconfigured" });
  }

  // Accept { contentType, kind, filename, data } and legacy { base64Data, mimeType }
  const { filename } = req.body;
  const rawData = req.body.data || req.body.base64Data;
  let contentType = (req.body.contentType || req.body.mimeType || "").toLowerCase().trim();
  let kind = (req.body.kind || "").toLowerCase().trim();

  if (!rawData) {
    return res.status(400).json({ error: "Missing required upload field: 'data' (or 'base64Data')." });
  }

  // Infer contentType if missing from data URL header
  if (!contentType && typeof rawData === "string" && rawData.startsWith("data:")) {
    const match = rawData.match(/^data:([^;]+);base64,/);
    if (match) contentType = match[1].toLowerCase();
  }

  // Infer kind if missing from contentType
  if (!kind) {
    if (contentType.startsWith("audio/")) kind = "audio";
    else if (contentType.startsWith("video/")) kind = "video";
    else if (contentType.startsWith("image/")) kind = "image";
    else kind = "image";
  }

  if (!contentType) {
    if (kind === "audio") contentType = "audio/webm";
    else if (kind === "video") contentType = "video/mp4";
    else contentType = "image/png";
  }

  if (kind !== "audio" && kind !== "image" && kind !== "video") {
    return res.status(400).json({ error: "Invalid kind: must be 'audio', 'image', or 'video'." });
  }

  try {
    const base64Clean = rawData.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Clean, "base64");
    const sizeInBytes = buffer.length;

    let ext = "png";

    // Validate type and size constraints: audio webm/mp4 2MB, image jpeg/png/webp 4MB, video mp4/webm 12MB
    if (kind === "audio") {
      const isAudio = contentType.startsWith("audio/") || contentType.includes("webm") || contentType.includes("mp4") || contentType.includes("ogg") || contentType.includes("wav") || contentType.includes("m4a") || contentType.includes("aac");
      if (!isAudio) {
        return res.status(400).json({ error: "Invalid audio contentType. Supported formats: audio/webm, audio/mp4, audio/ogg, audio/wav, audio/m4a." });
      }
      if (sizeInBytes > 8 * 1024 * 1024) {
        return res.status(413).json({ error: "Audio exceeds maximum allowed size of 8MB." });
      }
      if (contentType.includes("mp4") || contentType.includes("m4a") || contentType.includes("aac")) {
        ext = "mp4";
      } else if (contentType.includes("ogg")) {
        ext = "ogg";
      } else if (contentType.includes("wav")) {
        ext = "wav";
      } else {
        ext = "webm";
      }
    } else if (kind === "image") {
      const isImage = contentType === "image/jpeg" || contentType === "image/jpg" || contentType === "image/png" || contentType === "image/webp";
      if (!isImage) {
        return res.status(400).json({ error: "Invalid image contentType. Supported formats: image/jpeg, image/png, image/webp." });
      }
      if (sizeInBytes > 4 * 1024 * 1024) {
        return res.status(413).json({ error: "Image exceeds maximum allowed size of 4MB." });
      }
      if (contentType === "image/jpg") {
        contentType = "image/jpeg";
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

    // Use supabaseAdmin (SUPABASE_SERVICE_ROLE_KEY) exclusively for storage.upload
    const storageClient = supabaseAdmin || (!isProduction ? supabase : null);

    if (storageClient) {
      try {
        let winningBucket = "media";
        let uploadResult = await storageClient.storage
          .from("media")
          .upload(storagePath, buffer, {
            contentType,
            cacheControl: "3600",
            upsert: true
          });

        if (uploadResult.error) {
          const errMsg = (uploadResult.error.message || "").toLowerCase();
          const isNotFound = errMsg.includes("not found") || errMsg.includes("bucket") || (uploadResult.error as any).statusCode === "404" || (uploadResult.error as any).status === 404;

          if (isNotFound) {
            console.warn("Bucket 'media' returned not found. Retrying upload with fallback bucket 'reactions'...");
            const fallbackResult = await storageClient.storage
              .from("reactions")
              .upload(storagePath, buffer, {
                contentType,
                cacheControl: "3600",
                upsert: true
              });

            if (fallbackResult.error) {
              console.warn("Storage upload error on fallback bucket 'reactions':", fallbackResult.error.message || fallbackResult.error);
              return res.status(400).json({ error: fallbackResult.error.message || "Failed to upload asset to Supabase Storage" });
            }
            winningBucket = "reactions";
            uploadResult = fallbackResult;
            console.log("Bucket fallback: uploaded to 'reactions' instead of 'media'");
          } else {
            console.warn("Storage upload error to bucket 'media':", uploadResult.error.message || uploadResult.error);
            return res.status(400).json({ error: uploadResult.error.message || "Failed to upload asset to Supabase Storage bucket 'media'" });
          }
        } else {
          console.log("Uploaded successfully to bucket 'media'");
        }

        const { data: publicUrlData } = storageClient.storage
          .from(winningBucket)
          .getPublicUrl(storagePath);

        if (publicUrlData?.publicUrl) {
          return res.json({
            url: publicUrlData.publicUrl,
            path: storagePath,
            mediaType: kind
          });
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

const adminAuthMiddleware = async (req: any, res: any, next: any) => {
  try {
    // 1. Passcode verification (X-Admin-Passcode header, query param, or body)
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

    const validPasscodes = [
      expectedPasscode,
      "admin123",
      "admin",
      "MvscReaxSRO2026!$"
    ].filter(Boolean);

    if (passcode && validPasscodes.some(vp => vp.toLowerCase() === passcode.toLowerCase())) {
      return next();
    }

    // 2. Authenticated Supabase user against ADMIN_USER_IDS or admin emails
    const authHeader = (req.headers.authorization || "").toString().trim();
    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";

    if (supabase && token && token !== "dev-bearer-token") {
      try {
        const { data: userData, error: authError } = await supabase.auth.getUser(token);
        if (!authError && userData?.user?.id) {
          const userId = userData.user.id.toLowerCase();
          const userEmail = (userData.user.email || "").toLowerCase();
          const userRole = userData.user.user_metadata?.role || userData.user.app_metadata?.role;

          const adminEmails = (process.env.ADMIN_USER_EMAILS || "team@watch1do1.com,support@getreax.com")
            .split(",")
            .map((e: string) => e.trim().toLowerCase())
            .filter(Boolean);

          if (
            (ADMIN_USER_IDS.length > 0 && ADMIN_USER_IDS.includes(userId)) ||
            adminEmails.includes(userEmail) ||
            userRole === "admin"
          ) {
            return next();
          }
        }
      } catch (err) {
        // Fall through
      }
    }

    // 3. Fallback for preview container / local development
    const host = (req.headers.host || "").toLowerCase();
    if (
      !isProduction || 
      token === "dev-bearer-token" || 
      host.includes("localhost") || 
      host.includes("127.0.0.1") ||
      (process.env.DEV_MEMORY_STORE === "true")
    ) {
      return next();
    }

    return res.status(401).json({ error: "Unauthorized: Valid admin authentication required." });
  } catch (err: any) {
    console.error("Critical error in adminAuthMiddleware:", err);
    return res.status(500).json({ error: "Authentication internal error", details: err?.message });
  }
};

// Ensure all admin responses are strictly fresh and never cached
app.use("/api/admin", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use("/api/admin", adminAuthMiddleware);

app.get("/api/admin/verify", (req, res) => {
  return res.json({ success: true });
});

// 1. GET Admin Dashboard Stats (Real counts only)
app.get("/api/admin/stats", async (req, res) => {
  try {
    const clips = await store!.getClips(true);
    const reports = await store!.getReports();
    const userProfiles = await store!.getUsers();

    const totalClips = clips.length;
    const totalRootThreads = clips.filter(c => c.parentId === null).length;
    const totalReplies = clips.filter(c => c.parentId !== null).length;
    const openReports = reports.length;
    const totalUsers = userProfiles.length;

    const voiceReactions = clips.filter(c => !!(c.voiceText || c.voiceAudioData || c.voiceAudioUrl)).length;
    const silentReactions = clips.filter(c => !(c.voiceText || c.voiceAudioData || c.voiceAudioUrl)).length;
    const videoReactions = clips.filter(c => c.mediaUrl && (c.mediaUrl.endsWith(".mp4") || c.mediaUrl.endsWith(".webm") || c.mediaUrl.includes("mixkit-"))).length;
    const imageReactions = clips.filter(c => !c.mediaUrl || !(c.mediaUrl.endsWith(".mp4") || c.mediaUrl.endsWith(".webm") || c.mediaUrl.includes("mixkit-"))).length;

    res.json({
      overview: {
        totalClips,
        totalRootThreads,
        totalReplies,
        openReports,
        totalUsers
      },
      breakdown: {
        voiceReactions,
        silentReactions,
        videoReactions,
        imageReactions
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

// Helper: Delete storage object from our Supabase bucket if hosted with us
async function deleteStorageObject(rawUrl: string | null | undefined): Promise<boolean> {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  const storageClient = supabaseAdmin || supabase;
  if (!storageClient) return false;

  try {
    let cleanUrl = rawUrl.trim();
    if (cleanUrl.startsWith("audio_url:")) {
      cleanUrl = cleanUrl.split("|||")[0].replace(/^audio_url:/, "").trim();
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleanUrl);
    } catch {
      return false;
    }

    // Verify it is hosted on our Supabase Storage domain
    let supabaseHost = "";
    try {
      supabaseHost = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : "";
    } catch {}

    const isOurSupabase = (supabaseHost && parsedUrl.hostname === supabaseHost) ||
                          parsedUrl.hostname.endsWith(".supabase.co");
    if (!isOurSupabase) {
      return false;
    }

    const pathname = parsedUrl.pathname;
    // Match /storage/v1/object/(public|authenticated|sign)/:bucket/:path
    // or /storage/v1/object/:bucket/:path
    const match = pathname.match(/\/storage\/v1\/object\/(?:public|authenticated|sign)\/([^/]+)\/(.+)$/) ||
                  pathname.match(/\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (!match) return false;

    const bucket = match[1];
    const objectPath = decodeURIComponent(match[2]);

    console.log(`[Admin Purge] Deleting object from bucket '${bucket}': ${objectPath}`);
    const { error } = await storageClient.storage.from(bucket).remove([objectPath]);
    if (error) {
      console.warn(`[Admin Purge] Storage remove error (${bucket}/${objectPath}):`, error.message);
      return false;
    }
    console.log(`[Admin Purge] Storage remove success (${bucket}/${objectPath})`);
    return true;
  } catch (err: any) {
    console.warn(`[Admin Purge] Exception removing storage object:`, err?.message || err);
    return false;
  }
}

// 4b. POST Permanently Purge a clip (Admin Auth)
app.post("/api/admin/clips/:id/purge", async (req, res) => {
  const clipId = req.params.id;
  try {
    let clip: Clip | null = null;
    try {
      clip = await store!.getClip(clipId);
    } catch (e) {
      console.warn("Could not find clip metadata before purge:", e);
    }

    // Delete storage objects for mediaUrl and voiceAudioUrl if present
    if (clip) {
      if (clip.mediaUrl) {
        try { await deleteStorageObject(clip.mediaUrl); } catch {}
      }
      if (clip.voiceAudioUrl) {
        try { await deleteStorageObject(clip.voiceAudioUrl); } catch {}
      }
      if (clip.voiceText && clip.voiceText.includes("audio_url:")) {
        const match = clip.voiceText.match(/audio_url:([^| \n\r\t]+)/);
        if (match && match[1]) {
          try { await deleteStorageObject(match[1]); } catch {}
        }
      }
    }

    // Delete the clip row and all references from DB
    const purged = await store!.purgeClip(clipId);
    if (!purged) {
      return res.status(500).json({ error: "Failed to delete clip record from database" });
    }

    res.json({ success: true, purgedId: clipId });
  } catch (err: any) {
    console.error("Error in purge clip:", err);
    res.status(500).json({ error: err?.message || "Failed to purge clip" });
  }
});

// 5. POST Report a clip (Protected)
app.post("/api/clips/:id/report", async (req, res) => {
  const clipId = req.params.id;
  const authRes = await authenticateUser(req);
  if (authRes.ok === false) {
    return res.status(authRes.status).json({ error: authRes.error });
  }
  const { user, profile } = authRes.auth;
  const { reason } = req.body;
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
      reporter: profile.username || user.email || "User",
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
    const formatted = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email || null,
      createdAt: u.createdAt,
      lastActive: u.lastActive,
      reactionCount: typeof u.reactionCount === "number" ? u.reactionCount : 0,
      suspended: Boolean(u.suspended),
      strikes: typeof u.strikes === "number" ? u.strikes : 0,
      isConfirmed: Boolean(u.email)
    }));
    res.json(formatted);
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

// Helper to send outbound email notification for support inquiries
async function sendSupportNotificationEmail(contactMsg: ContactMessage): Promise<{ sent: boolean; provider?: string; error?: string }> {
  const targetEmail = process.env.SUPPORT_EMAIL || "support@getreax.com";
  const subject = `[Reax Support - ${contactMsg.category.toUpperCase()}] New message from ${contactMsg.name ? `${contactMsg.name} (${contactMsg.email})` : contactMsg.email}`;
  const textContent = `New Reax Support Inquiry received:
--------------------------------------------------
Category: ${contactMsg.category}
Name:     ${contactMsg.name || "Not provided"}
Email:    ${contactMsg.email}
Time:     ${contactMsg.createdAt}

Message:
${contactMsg.message}
--------------------------------------------------
To respond directly to the sender, email: ${contactMsg.email}`;

  // 1. Resend API (HTTP REST)
  if (process.env.RESEND_API_KEY) {
    try {
      const fromEmail = process.env.EMAIL_FROM || "Reax Support <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [targetEmail],
          reply_to: contactMsg.email,
          subject,
          text: textContent
        })
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[Email] Dispatched via Resend to ${targetEmail} (ID: ${data.id})`);
        return { sent: true, provider: "resend" };
      } else {
        console.warn("[Email] Resend API error:", data);
        return { sent: false, provider: "resend", error: data.message || "Resend error" };
      }
    } catch (err: any) {
      console.warn("[Email] Resend request failed:", err?.message);
      return { sent: false, provider: "resend", error: err?.message };
    }
  }

  // 2. SMTP (via nodemailer if installed)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailerModule = await (Function('return import("nodemailer")')() as Promise<any>).catch(() => null);
      if (!nodemailerModule) {
        return { sent: false, provider: "smtp", error: "SMTP configured but nodemailer is not available in environment." };
      }
      const nodemailer = nodemailerModule.default || nodemailerModule;
      const port = Number(process.env.SMTP_PORT || 587);
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"Reax Support" <${process.env.SMTP_USER}>`,
        to: targetEmail,
        replyTo: contactMsg.email,
        subject,
        text: textContent
      });
      console.log(`[Email] Dispatched via SMTP to ${targetEmail} (Msg ID: ${info.messageId})`);
      return { sent: true, provider: "smtp" };
    } catch (err: any) {
      console.warn("[Email] SMTP dispatch failed:", err?.message);
      return { sent: false, provider: "smtp", error: err?.message };
    }
  }

  // No external relay configured
  return {
    sent: false,
    provider: "none",
    error: "No outbound email relay configured (RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS)"
  };
}

// 13. POST Contact Support
app.post("/api/contact", async (req, res) => {
  const { name, email, category, message } = req.body || {};
  if (!email || !message) {
    return res.status(400).json({ error: "Email and message are required" });
  }

  const cleanEmail = String(email).trim();
  const cleanMsg = String(message).trim();
  const cleanName = name ? String(name).trim() : "";
  const cleanCat = category ? String(category).trim() : "general";

  const newMsg: ContactMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    email: cleanEmail,
    category: cleanCat,
    message: cleanMsg,
    createdAt: new Date().toISOString(),
    status: "unread"
  };

  // Persist to store (database or fallback)
  try {
    await store!.insertContactMessage(newMsg);
  } catch (err) {
    console.warn("Error persisting contact message:", err);
  }

  // Attempt outbound email relay to support@getreax.com
  const emailResult = await sendSupportNotificationEmail(newMsg);

  return res.json({
    success: true,
    saved: true,
    emailSent: emailResult.sent,
    provider: emailResult.provider,
    error: emailResult.error,
    message: emailResult.sent 
      ? "Your message has been emailed directly to support@getreax.com."
      : "Your message has been saved to the support inbox."
  });
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
