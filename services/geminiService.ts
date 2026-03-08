import { GoogleGenAI } from "@google/genai";

export interface VideoSummaryChunk {
  text: string;
  status?: string;
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function* summarizeYouTubeVideo(
  videoUrl: string,
  language: string,
  model: string,
): AsyncGenerator<VideoSummaryChunk, void, unknown> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const maxAttempts = 3;
  let attempt = 0;

  const systemInstruction = `You are an expert at summarizing YouTube videos.
    Based on the provided video, generate a comprehensive summary in ${language}.
    
    Format Requirements:
    - Use Markdown.
    - Use ## Headings for segments.
    - Use **bold** for key concepts.
    - Use bullet points for takeaways.
    
    The output must be clear, structured, and entirely in ${language}.`;

  while (attempt < maxAttempts) {
    try {
      const responseStream = await ai.models.generateContentStream({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: {
                  fileUri: videoUrl,
                  mimeType: "video/*",
                },
              },
              {
                text: `Please summarize this video in ${language}.`,
              },
            ],
          },
        ],
        config: {
          systemInstruction,
        },
      });

      for await (const chunk of responseStream) {
        yield {
          text: chunk.text || "",
          usage: chunk.usageMetadata as any,
        };
      }

      // Successfully completed the stream
      return;
    } catch (error: any) {
      attempt++;
      const errorMessage = error.message || "";
      // Common transient errors: 504 (Timeout), 503 (Service Unavailable), 429 (Too Many Requests)
      const isTransient =
        errorMessage.includes("504") ||
        errorMessage.includes("503") ||
        errorMessage.includes("429") ||
        errorMessage.includes("deadline exceeded");

      if (isTransient && attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
        yield {
          text: "",
          status: `Transient error detected (${errorMessage.includes("504") ? "504 Timeout" : "API Busy"}). Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxAttempts})`,
        };
        await sleep(delay);
        continue;
      }

      console.error("Error during video summarization:", error);
      if (error instanceof Error) {
        if (errorMessage.includes("API_KEY_INVALID")) {
          throw new Error("Invalid API key.");
        }
        if (errorMessage.includes("400")) {
          throw new Error(`The video URL might be invalid or unsupported.`);
        }
        throw new Error(`Summary failed: ${errorMessage}`);
      }
      throw new Error("An unknown error occurred.");
    }
  }
}
