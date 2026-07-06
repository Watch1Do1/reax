export type Clip = {
  id: string;
  parentId: string | null;
  mediaUrl: string;
  voiceText?: string;
  voiceAudioData?: string; // Base64 audio URI string for custom voice recording
  voiceStyle?: "casual" | "sarcastic" | "dramatic" | "announcer" | "oldschool";
  tone: "funny" | "dramatic" | "sarcastic" | "chill" | "chaotic";
  authorName: string;
  createdAt: string;
  likesCount: number;
  effect: string; // e.g., 'zoom', 'shake', 'glitch', 'pulse', 'bounce', 'pan'
  overlayText?: string;
  originalAuthor?: string;
  remixedFrom?: string;
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
