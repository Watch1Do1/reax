import { createRequire } from "node:module";

// Ensure @vercel/nft traces these packages into the serverless function bundle
import "express";
import "@supabase/supabase-js";
import "@google/genai";
import "dotenv";

const require = createRequire(import.meta.url);

let app: any = null;
let loadError: any = null;

try {
  const loaded = require("../dist/server.cjs");
  app = loaded.default || loaded;
} catch (err: any) {
  loadError = err;
  console.error("Critical: Failed to load server bundle in api/index.ts:", err);
}

export default function handler(req: any, res: any) {
  if (app) {
    return app(req, res);
  }
  console.error("Handler invoked but server bundle failed to load:", loadError);
  return res.status(500).json({
    error: "Server initialization failure",
    message: loadError?.message || String(loadError)
  });
}
