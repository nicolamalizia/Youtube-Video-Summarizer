import express from "express";
import { createServer as createViteServer } from "vite";
import { YoutubeTranscript, YoutubeTranscriptError } from "youtube-transcript";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/transcript", async (req, res) => {
    try {
      const { videoUrl } = req.body;
      if (!videoUrl) {
        return res.status(400).json({ error: "videoUrl is required" });
      }

      const transcript = await YoutubeTranscript.fetchTranscript(videoUrl);
      const text = transcript.map((t) => t.text).join(" ");

      res.json({ transcript: text });
    } catch (error: any) {
      if (error instanceof YoutubeTranscriptError) {
        console.log(
          `Transcript not available for ${req.body.videoUrl}: ${error.message}`,
        );
        return res.json({ transcript: null });
      }

      console.error("Error fetching transcript:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch transcript" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
