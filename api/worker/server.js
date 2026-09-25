import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 8080;
const WORKER_SECRET = process.env.WORKER_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("[Worker Warning] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.");
}

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Reax FFmpeg Worker running on port ${PORT}`);
});
