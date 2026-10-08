import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Global crash handlers to guarantee error details appear in Cloud Run logs
process.on("uncaughtException", (err) => {
  console.error("[Worker Uncaught Exception]:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Worker Unhandled Rejection]:", reason);
});

const app = express();
app.use(express.json({ limit: "10mb" }));

// Cloud Run supplies PORT (typically 8080)
const PORT = parseInt(process.env.PORT || "8080", 10);
const WORKER_SECRET = (process.env.WORKER_SECRET || "").trim();

// Polyfill WebSocket for headless Node.js container environments where Realtime is unused
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class DummyWebSocket {};
}

let _supabaseClient = null;
function getSupabase() {
  if (_supabaseClient) return _supabaseClient;
  let url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  // Automatically strip accidental /rest/v1 or trailing slashes
  url = url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "").trim();
  if (!url || !key) {
    console.warn("[Worker Warning] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from environment variables.");
    return null;
  }
  try {
    _supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      realtime: {
        transport: null
      }
    });
    return _supabaseClient;
  } catch (err) {
    console.error("[Worker] Failed to create Supabase client:", err);
    return null;
  }
}

// Health check endpoint (Cloud Run startup and liveness probes)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    supabaseConfigured: Boolean(getSupabase()),
    secretConfigured: Boolean(WORKER_SECRET)
  });
});

app.get("/", (req, res) => {
  res.send("Reax FFmpeg Worker is running.");
});

// Helper: Run ffprobe to get video duration and stream info
function probeVideo(filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "stream=codec_type,codec_name,duration:format=duration",
        "-of", "json",
        filePath
      ],
      { timeout: 30000 },
      (err, stdout) => {
        if (err) {
          return reject(new Error("Could not read that video. Try an MP4."));
        }
        try {
          const data = JSON.parse(stdout);
          const streams = Array.isArray(data.streams) ? data.streams : [];
          const videoStream = streams.find((s) => s.codec_type === "video");
          const audioStream = streams.find((s) => s.codec_type === "audio");

          if (!videoStream) {
            return reject(new Error("Could not read that video."));
          }

          let duration = parseFloat(data.format?.duration || "0");
          if ((!duration || isNaN(duration) || duration <= 0) && videoStream.duration) {
            duration = parseFloat(videoStream.duration);
          }

          resolve({
            duration,
            hasVideo: true,
            hasAudio: Boolean(audioStream)
          });
        } catch (parseErr) {
          reject(new Error("Could not read that video."));
        }
      }
    );
  });
}

// Helper: Execute FFmpeg trim (clean: -an vs AAC, no amix overhead)
function trimVideo({ inputPath, outputPath, startSec, durationSec, stripAudio, hasAudio }) {
  return new Promise((resolve, reject) => {
    const vf = "scale=trunc(iw/2)*2:trunc(ih/2)*2";

    const args = [
      "-y",
      "-ss", startSec.toFixed(3),
      "-i", inputPath,
      "-t", durationSec.toFixed(3),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-vf", vf
    ];

    if (stripAudio || !hasAudio) {
      args.push("-an");
    } else {
      args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2");
    }

    args.push("-movflags", "+faststart", outputPath);

    execFile("ffmpeg", args, { timeout: 100000 }, (err) => {
      if (err) {
        return reject(new Error(`ffmpeg failure: ${err.message}`));
      }
      resolve();
    });
  });
}

// Trim Endpoint: Called by Vercel
app.post("/trim", async (req, res) => {
  // 1. Mandatory WORKER_SECRET check
  if (!WORKER_SECRET) {
    console.error("[Worker] WORKER_SECRET is not configured on this instance.");
    return res.status(500).json({ error: "Server misconfiguration: WORKER_SECRET is not configured." });
  }

  const incomingSecret = req.headers["x-worker-secret"] || req.body?.workerSecret;
  if (!incomingSecret || incomingSecret !== WORKER_SECRET) {
    console.warn("[Worker] Rejected unauthorized request: invalid or missing x-worker-secret.");
    return res.status(401).json({ error: "Unauthorized worker request" });
  }

  const {
    jobId,
    rawBucket = "media",
    rawPath,
    rawUrl,
    trimStartMs = 0,
    trimDurationMs = 6000,
    stripAudio = false,
    userId
  } = req.body;

  if (!userId || (!rawPath && !rawUrl)) {
    return res.status(400).json({ error: "Missing required parameters (userId, rawPath or rawUrl)" });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: "Supabase client is not configured on worker." });
  }

  const tempId = crypto.randomUUID();
  const inputPath = path.join("/tmp", `input-${tempId}.mp4`);
  const outputPath = path.join("/tmp", `output-${tempId}.mp4`);

  const cleanTempFiles = () => {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
  };

  try {
    console.log(`[Worker] Starting trim job ${jobId || tempId} for user ${userId}`);

    // 2. Download raw video from Supabase Storage
    if (rawPath) {
      console.log(`[Worker] Downloading ${rawBucket}/${rawPath}`);
      const { data: blobData, error: dlErr } = await supabase.storage
        .from(rawBucket)
        .download(rawPath);

      if (dlErr || !blobData) {
        throw new Error(`Failed to download raw video from Supabase: ${dlErr?.message || "Not found"}`);
      }
      const arrayBuf = await blobData.arrayBuffer();
      fs.writeFileSync(inputPath, Buffer.from(arrayBuf));
    } else if (rawUrl) {
      console.log(`[Worker] Downloading via URL: ${rawUrl}`);
      const dlRes = await fetch(rawUrl);
      if (!dlRes.ok) {
        throw new Error(`Failed to download raw video via URL: HTTP ${dlRes.status}`);
      }
      const arrayBuf = await dlRes.arrayBuffer();
      fs.writeFileSync(inputPath, Buffer.from(arrayBuf));
    }

    // 3. Probe duration with ffprobe
    const probe = await probeVideo(inputPath);
    const durationSec = probe.duration;

    if (!durationSec || isNaN(durationSec) || durationSec <= 0) {
      cleanTempFiles();
      return res.status(400).json({ error: "Could not read that video." });
    }
    if (durationSec > 60.5) {
      cleanTempFiles();
      return res.status(400).json({ error: "Video must be 60 seconds or less." });
    }

    const startSec = Math.max(0, trimStartMs / 1000);
    const windowSec = Math.min(6.0, Math.max(1.0, trimDurationMs / 1000));

    // Validate trim window bounds (allow 50ms margin)
    if (startSec + windowSec > durationSec + 0.05) {
      cleanTempFiles();
      return res.status(400).json({ error: "Requested trim window exceeds video duration." });
    }

    // 4. Run ffmpeg trim
    console.log(`[Worker] Running ffmpeg: start=${startSec.toFixed(3)}s, duration=${windowSec.toFixed(3)}s, stripAudio=${stripAudio}`);
    await trimVideo({
      inputPath,
      outputPath,
      startSec,
      durationSec: windowSec,
      stripAudio,
      hasAudio: probe.hasAudio
    });

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error("FFmpeg produced empty output file");
    }

    // 5. Upload trimmed file to Supabase Storage: clips/{userId}/{uuid}.mp4
    const trimmedFileUuid = crypto.randomUUID();
    const trimmedStoragePath = `clips/${userId}/${trimmedFileUuid}.mp4`;
    const trimmedBuffer = fs.readFileSync(outputPath);

    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(trimmedStoragePath, trimmedBuffer, {
        contentType: "video/mp4",
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Supabase upload failure: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("media")
      .getPublicUrl(trimmedStoragePath);

    const trimmedPublicUrl = publicUrlData?.publicUrl;
    if (!trimmedPublicUrl) {
      throw new Error("Failed to generate public URL for trimmed video");
    }

    console.log(`[Worker] Trimmed file uploaded successfully: ${trimmedPublicUrl}`);

    // 6. Delete raw file using exact bucket and path
    try {
      let bucketToDelete = rawBucket;
      let pathToDelete = rawPath;

      if (!pathToDelete && rawUrl) {
        const rawMatch = rawUrl.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
        if (rawMatch) {
          bucketToDelete = rawMatch[1];
          pathToDelete = decodeURIComponent(rawMatch[2]);
        }
      }

      if (pathToDelete) {
        console.log(`[Worker] Deleting raw file: ${bucketToDelete}/${pathToDelete}`);
        await supabase.storage.from(bucketToDelete).remove([pathToDelete]);
      }
    } catch (delErr) {
      console.warn("[Worker] Non-critical: Could not delete raw file from storage:", delErr);
    }

    cleanTempFiles();

    // 7. Return trimmed URL directly to caller (Vercel)
    return res.json({
      status: "success",
      trimmedUrl: trimmedPublicUrl,
      jobId
    });
  } catch (error) {
    console.error(`[Worker] Error processing trim job ${jobId || tempId}:`, error);
    cleanTempFiles();
    return res.status(500).json({
      error: "Processing failed. Try again.",
      message: error.message
    });
  }
});

// ---------- Watermarked video export ----------
function probeMedia(filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "stream=codec_type,width,height,duration:format=duration", "-of", "json", filePath],
      { timeout: 30000 },
      (err, stdout) => {
        if (err) return reject(new Error("Could not read media file."));
        try {
          const data = JSON.parse(stdout);
          const streams = Array.isArray(data.streams) ? data.streams : [];
          const v = streams.find((s) => s.codec_type === "video");
          const a = streams.find((s) => s.codec_type === "audio");
          let duration = parseFloat(data.format?.duration || "0");
          if ((!duration || isNaN(duration)) && v?.duration) duration = parseFloat(v.duration);
          resolve({ hasVideo: Boolean(v), hasAudio: Boolean(a), width: v?.width || 0, height: v?.height || 0, duration: duration || 0 });
        } catch {
          reject(new Error("Could not read media file."));
        }
      }
    );
  });
}

async function downloadToFile(url, filePath) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("Invalid media URL");
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`);
  fs.writeFileSync(filePath, Buffer.from(await r.arrayBuffer()));
}

function runFfmpeg(args, timeoutMs = 100000) {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) {
        const e = new Error(`ffmpeg failure: ${err.message}`);
        e.stderr = String(stderr || "");
        return reject(e);
      }
      resolve();
    });
  });
}

// Builds the export command. Input 0 = clip video, input 1 = transparent overlay PNG,
// input 2 = voice note (optional) OR anullsrc silence (when there is no audio at all).
function buildExportArgs({ inputPath, overlayPath, voicePath, outputPath, width, height, durationSec, hasAudio, hasVoice, useFpsMode = true }) {
  const scale = Math.min(1, 1920 / Math.max(width, height));          // cap long side at 1920
  const W = Math.max(2, Math.round((width * scale) / 2) * 2);          // even dimensions
  const H = Math.max(2, Math.round((height * scale) / 2) * 2);
  const dur = Math.max(0.5, Math.min(60, durationSec)).toFixed(3);

  const args = ["-y", "-i", inputPath, "-i", overlayPath];
  if (hasVoice) args.push("-i", voicePath);                             // index 2
  if (!hasAudio && !hasVoice) {
    args.push("-f", "lavfi", "-t", dur, "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"); // index 2
  }

  const fmt = "aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo";
  const filters = [
    `[0:v]fps=30,scale=${W}:${H},setsar=1[base]`,
    `[1:v]scale=${W}:${H},format=rgba[ov]`,
    `[base][ov]overlay=0:0:format=auto,format=yuv420p[v]`,
  ];
  if (hasAudio && hasVoice) {
    filters.push(`[0:a]${fmt}[a0]`, `[2:a]${fmt},apad[a1]`, `[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[a]`);
  } else if (hasAudio) {
    filters.push(`[0:a]${fmt},apad[a]`);
  } else if (hasVoice) {
    filters.push(`[2:a]${fmt},apad[a]`);                                // stripped clip + voice note
  } else {
    filters.push(`[2:a]${fmt}[a]`);                                     // silent track (stripAudio clip)
  }

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-profile:v", "high", "-level:v", "4.1", "-pix_fmt", "yuv420p",
    "-preset", "veryfast", "-crf", "20", "-r", "30",
    ...(useFpsMode ? ["-fps_mode", "cfr"] : ["-vsync", "cfr"]),
    "-g", "60",
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
    "-t", dur,
    "-movflags", "+faststart",
    outputPath
  );
  return args;
}

app.post("/export", async (req, res) => {
  // 1. Same mandatory WORKER_SECRET check as /trim
  if (!WORKER_SECRET) return res.status(500).json({ error: "Server misconfiguration: WORKER_SECRET is not configured." });
  const incomingSecret = req.headers["x-worker-secret"] || req.body?.workerSecret;
  if (!incomingSecret || incomingSecret !== WORKER_SECRET) return res.status(401).json({ error: "Unauthorized worker request" });

  const { clipId, mediaUrl, voiceAudioUrl, overlayPng, userId } = req.body || {};
  if (!clipId || !mediaUrl || !userId || typeof overlayPng !== "string" || !overlayPng.startsWith("data:image/png;base64,")) {
    return res.status(400).json({ error: "Missing required parameters (clipId, mediaUrl, userId, overlayPng)" });
  }
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: "Supabase client is not configured on worker." });

  const tempId = crypto.randomUUID();
  const inputPath = path.join("/tmp", `exp-in-${tempId}`);
  const overlayPath = path.join("/tmp", `exp-ov-${tempId}.png`);
  const voicePath = path.join("/tmp", `exp-voice-${tempId}`);
  const outputPath = path.join("/tmp", `exp-out-${tempId}.mp4`);
  const cleanup = () => { for (const p of [inputPath, overlayPath, voicePath, outputPath]) { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {} } };

  try {
    await downloadToFile(mediaUrl, inputPath);
    fs.writeFileSync(overlayPath, Buffer.from(overlayPng.replace(/^data:image\/png;base64,/, ""), "base64"));

    const probe = await probeMedia(inputPath);
    if (!probe.hasVideo || !probe.width || !probe.height || !probe.duration) {
      cleanup();
      return res.status(400).json({ error: "Could not read that video." });
    }

    // Voice note is optional; any failure here just means "no voice", never an error.
    let hasVoice = false;
    if (voiceAudioUrl) {
      try {
        await downloadToFile(voiceAudioUrl, voicePath);
        hasVoice = (await probeMedia(voicePath)).hasAudio;
      } catch (vErr) {
        console.warn("[Worker] Voice note unavailable, exporting without it:", vErr.message);
      }
    }

    // No audio (stripAudio) is normal: buildExportArgs adds an anullsrc silent track.
    const baseOpts = { inputPath, overlayPath, voicePath, outputPath, width: probe.width, height: probe.height, durationSec: probe.duration, hasAudio: probe.hasAudio, hasVoice };
    try {
      await runFfmpeg(buildExportArgs({ ...baseOpts, useFpsMode: true }));
    } catch (e) {
      if (/fps_mode|Unrecognized option/i.test(`${e.stderr || ""} ${e.message}`)) {
        await runFfmpeg(buildExportArgs({ ...baseOpts, useFpsMode: false }));  // older ffmpeg
      } else {
        throw e;
      }
    }
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) throw new Error("FFmpeg produced empty output file");

    const fileName = `reax-${String(clipId).slice(0, 8)}.mp4`;
    const storagePath = `exports/${userId}/${crypto.randomUUID()}.mp4`;
    const { error: uploadError } = await supabase.storage.from("media").upload(storagePath, fs.readFileSync(outputPath), { contentType: "video/mp4", upsert: true });
    if (uploadError) throw new Error(`Supabase upload failure: ${uploadError.message}`);

    const url = supabase.storage.from("media").getPublicUrl(storagePath).data?.publicUrl;
    const downloadUrl = supabase.storage.from("media").getPublicUrl(storagePath, { download: fileName }).data?.publicUrl;
    if (!url) throw new Error("Failed to generate public URL for export");

    cleanup();
    return res.json({ status: "success", url, downloadUrl, fileName });
  } catch (error) {
    console.error(`[Worker] Export failed for clip ${clipId}:`, error, error?.stderr || "");
    cleanup();
    return res.status(500).json({ error: "Couldn't create the video. Please try again.", message: error.message });
  }
});

// Start listening immediately
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Reax FFmpeg Worker running on port ${PORT}`);
});

server.on("error", (err) => {
  console.error(`[Worker Server Error]: Failed to bind to port ${PORT}:`, err);
});
