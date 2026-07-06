import { SavedReaction } from "../types";

/**
 * Generates a cryptographically strong (or robustly simulated) UUID.
 */
export function generateUniqueId(prefix: string = ""): string {
  let uuid = "";
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    uuid = window.crypto.randomUUID();
  } else {
    // Robust fallback RFC4122 version 4 compliant UUID generator
    uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  return prefix ? `${prefix}-${uuid}` : uuid;
}

/**
 * Scans an array to detect duplicate IDs, logging warnings to the console if found.
 */
export function detectDuplicateIds<T>(
  array: T[],
  getId: (item: T) => string | undefined,
  contextName: string
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of array) {
    const id = getId(item);
    if (!id) {
      console.warn(`[${contextName}] Found item with missing/undefined ID`, item);
      continue;
    }
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }

  if (duplicates.size > 0) {
    console.error(
      `[${contextName}] CRITICAL: Detected ${duplicates.size} duplicate key(s):`,
      Array.from(duplicates),
      "in list of size",
      array.length
    );
  }

  return Array.from(duplicates);
}

/**
 * Returns a new array with duplicate IDs removed, keeping the first occurrence.
 */
export function deduplicateArray<T>(
  array: T[],
  getId: (item: T) => string | undefined,
  contextName?: string
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of array) {
    const id = getId(item);
    if (!id) {
      if (contextName) {
        console.warn(`[${contextName}] Discarded item due to missing ID`, item);
      }
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      result.push(item);
    } else if (contextName) {
      console.warn(`[${contextName}] Discarded duplicate item with ID: ${id}`);
    }
  }

  return result;
}

/**
 * Sanitizes and normalizes saved reactions loaded from localStorage.
 */
export function sanitizeSavedReactions(raw: any): SavedReaction[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seenIds = new Set<string>();
  const sanitized: SavedReaction[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;

    // Fix or generate ID
    let id = item.id;
    if (!id || typeof id !== "string" || seenIds.has(id)) {
      id = generateUniqueId("saved");
    }

    seenIds.add(id);

    // Normalize properties with sensible fallbacks
    const sanitizedItem: SavedReaction = {
      id,
      mediaUrl: item.mediaUrl || "",
      voiceText: item.voiceText || "",
      tone: ["funny", "dramatic", "sarcastic", "chill", "chaotic"].includes(item.tone)
        ? item.tone
        : "chill",
      effect: item.effect || "none",
      overlayText: item.overlayText || "",
      authorName: item.authorName || "Guest",
      originalAuthor: item.originalAuthor || "",
      remixedFrom: item.remixedFrom || "",
      savedAt: item.savedAt || new Date().toISOString(),
    };

    sanitized.push(sanitizedItem);
  }

  return sanitized;
}

/**
 * Loads, sanitizes, and deduplicates the saved reactions from localStorage.
 * Updates localStorage if changes/fixes were made during loading.
 */
export function loadAndSanitizeReactions(): SavedReaction[] {
  try {
    const rawString = localStorage.getItem("reax_saved_reactions") || "[]";
    const rawParsed = JSON.parse(rawString);
    const sanitized = sanitizeSavedReactions(rawParsed);
    
    // Save back if the length or content got fixed/changed (prevent warning loop)
    if (JSON.stringify(sanitized) !== JSON.stringify(rawParsed)) {
      localStorage.setItem("reax_saved_reactions", JSON.stringify(sanitized));
    }
    return sanitized;
  } catch (err) {
    console.error("Failed to parse and sanitize saved reactions:", err);
    return [];
  }
}
