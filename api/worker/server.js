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
const WORKER_SECRET = process.env.WORKER_SECRET || "";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Helper: Download a remote URL to local temporary file
async function downloadToFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download source file: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}

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

// Helper: Execute FFmpeg trim
function trimVideo({ inputPath, outputPath, startSec, durationSec, stripAudio, hasAudio, voiceAudioPath }) {
  return new Promise((resolve, reject) => {
    const vf = "scale=trunc(iw/2)*2:trunc(ih/2)*2";

    const args = [
      "-y",
      "-ss", startSec.toFixed(3),
      "-i", inputPath
    ];

    let hasVoice = Boolean(voiceAudioPath && fs.existsSync(voiceAudioPath));
    if (hasVoice) {
      args.push("-i", voiceAudioPath);
    }

    args.push("-t", durationSec.toFixed(3));
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-vf", vf);

    if (stripAudio && !hasVoice) {
      args.push("-an");
    } else if (hasVoice && (!hasAudio || stripAudio)) {
      // Use voice audio only
      args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2", "-map", "0:v:0", "-map", "1:a:0");
    } else if (hasVoice && hasAudio) {
      // Mix video audio with voice over
      args.push(
        "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]",
        "-map", "0:v:0",
        "-map", "[aout]",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ac", "2"
      );
    } else if (hasAudio) {
      args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2");
    } else {
      args.push("-an");
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

// Trim Endpoint: Triggered by Vercel
app.post("/trim", async (req, res) => {
  // Optional worker secret check
  if (WORKER_SECRET) {
    const incomingSecret = req.headers["x-worker-secret"] || req.body.workerSecret;
    if (incomingSecret !== WORKER_SECRET) {
      return res.status(401).json({ error: "Unauthorized worker request" });
    }
  }

  const {
    jobId,
    rawUrl,
    trimStartMs = 0,
    trimDurationMs = 6000,
    stripAudio = false,
    userId,
    authorName,
    caption = "",
    tone = "funny",
    overlay = "",
    parentId = null,
    voiceAudioUrl = null,
    voiceStyle = "casual",
    effect = "zoom|classic|white|bottom",
    callbackUrl = null
  } = req.body;

  if (!rawUrl || !userId) {
    return res.status(400).json({ error: "Missing required parameters (rawUrl, userId)" });
  }

  const tempId = crypto.randomUUID();
  const inputPath = path.join("/tmp", `input-${tempId}.mp4`);
  const voicePath = path.join("/tmp", `voice-${tempId}.mp3`);
  const outputPath = path.join("/tmp", `output-${tempId}.mp4`);

  const cleanTempFiles = () => {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(voicePath)) fs.unlinkSync(voicePath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
  };

  try {
    console.log(`[Worker] Starting job ${jobId} for user ${userId}`);

    // 1. Download raw video from Supabase Storage
    await downloadToFile(rawUrl, inputPath);

    // If voiceOverUrl exists, download voice audio
    if (voiceAudioUrl) {
      try {
        await downloadToFile(voiceAudioUrl, voicePath);
      } catch (voiceErr) {
        console.warn(`[Worker] Failed to download voiceAudioUrl, continuing without voice mix:`, voiceErr);
      }
    }

    // 2. Probe duration with ffprobe
    const probe = await probeVideo(inputPath);
    const durationSec = probe.duration;

    // Validate: duration > 0, duration <= 60.5s
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

    // 3. Run ffmpeg trim
    console.log(`[Worker] Running ffmpeg: start=${startSec.toFixed(3)}s, duration=${windowSec.toFixed(3)}s, stripAudio=${stripAudio}`);
    await trimVideo({
      inputPath,
      outputPath,
      startSec,
      durationSec: windowSec,
      stripAudio,
      hasAudio: probe.hasAudio,
      voiceAudioPath: fs.existsSync(voicePath) ? voicePath : null
    });

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error("FFmpeg produced empty output file");
    }

    // 4. Upload trimmed file to Supabase Storage: clips/{userId}/{uuid}.mp4
    if (!supabase) {
      throw new Error("Supabase client is not configured on worker.");
    }

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

    // 5. Delete raw file from Supabase Storage
    try {
      // Extract storage path from rawUrl
      const rawMatch = rawUrl.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
      if (rawMatch) {
        const bucket = rawMatch[1];
        const rawObjectPath = decodeURIComponent(rawMatch[2]);
        console.log(`[Worker] Deleting raw file: ${bucket}/${rawObjectPath}`);
        await supabase.storage.from(bucket).remove([rawObjectPath]);
      }
    } catch (delErr) {
      console.warn("[Worker] Non-critical: Could not delete raw file from storage:", delErr);
    }

    // 6. Call Vercel to finalize the clip row
    let finalizedClip = null;
    if (callbackUrl) {
      try {
        console.log(`[Worker] Calling callback to finalize clip: ${callbackUrl}`);
        const finalizeRes = await fetch(callbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-worker-secret": WORKER_SECRET || "reax-worker-secret-internal"
          },
          body: JSON.stringify({
            jobId,
            trimmedUrl: trimmedPublicUrl,
            userId,
            authorName,
            caption,
            tone,
            overlay,
            parentId,
            voiceAudioUrl,
            voiceStyle,
            effect
          })
        });
        if (finalizeRes.ok) {
          const finalizeData = await finalizeRes.json();
          finalizedClip = finalizeData.clip || finalizeData;
        } else {
          console.warn(`[Worker] Callback returned HTTP ${finalizeRes.status}`);
        }
      } catch (cbErr) {
        console.warn(`[Worker] Callback execution failed:`, cbErr);
      }
    }

    cleanTempFiles();

    return res.json({
      status: "success",
      trimmedUrl: trimmedPublicUrl,
      jobId,
      clip: finalizedClip
    });
  } catch (error) {
    console.error(`[Worker] Error processing trim job ${jobId}:`, error);
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
