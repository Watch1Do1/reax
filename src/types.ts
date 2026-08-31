export type Clip = {
  id: string;
  parentId: string | null;
  mediaUrl: string;
  mediaType?: "video" | "image" | "audio" | string;
  voiceText?: string;
  voiceAudioData?: string; // Client-side recording preview if present; not stored in DB
  voiceStyle?: "casual" | "sarcastic" | "dramatic" | "announcer" | "oldschool";
  tone: "funny" | "dramatic" | "sarcastic" | "chill" | "chaotic";
  authorName: string;
  authorId?: string;
  createdAt: string;
  likesCount: number;
  laughsCount: number;
  effect: string; // e.g., 'zoom', 'shake', 'glitch', 'pulse', 'bounce', 'pan'
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

export interface SavedReaction {
  id: string;
  mediaUrl: string;
  voiceText?: string;
  voiceAudioData?: string;
  voiceStyle?: "casual" | "sarcastic" | "dramatic" | "announcer" | "oldschool";
  tone: "funny" | "dramatic" | "sarcastic" | "chill" | "chaotic";
  effect: string;
  overlayText?: string;
  authorName: string;
  originalAuthor?: string;
  remixedFrom?: string;
  savedAt: string;
}
