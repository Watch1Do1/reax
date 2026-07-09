let app: any = null;

export default async function handler(req: any, res: any) {
  if (!app) {
    try {
      const module = await import("../server.js");
      app = module.default || module;
    } catch (err: any) {
      console.error("Failed to dynamically import server.js:", err);
      return res.status(500).json({
        error: "Failed to load Express server",
        message: err?.message || String(err),
        stack: err?.stack
      });
    }
  }
  return app(req, res);
}

