import app from "../server";

export default function handler(req: any, res: any) {
  try {
    return app(req, res);
  } catch (err: any) {
    console.error("api handler crash:", err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: "server_crash", details: String(err?.message || err) });
    }
  }
}


