
import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

async function getApiKey(): Promise<string | undefined> {
    // 1. Try process.env (injected by Vite during build or dev)
    let key = process.env.API_KEY;
    
    // 2. Try fetching from the server (for runtime on Cloud Run) if not found in env
    if (!key) {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                key = config.GEMINI_API_KEY;
            }
            console.log("Fetch from /api/config");
        } catch (e) {
            console.warn("Failed to fetch API key from server config endpoint.");
        }
    }

    if (key) {
        const masked = key.substring(0, 4) + "****" + key.substring(key.length - 4);
        console.log(`[Debug] Gemini API Key loaded: ${masked}`);
    } else {
        console.warn("[Debug] Gemini API Key NOT found.");
    }

    return key;
}

export async function getAiInstance(): Promise<GoogleGenAI> {
    if (!aiInstance) {
        const apiKey = await getApiKey();
        if (!apiKey) {
            throw new Error("Gemini API key not found. Please set GEMINI_API_KEY in the environment.");
        }
        aiInstance = new GoogleGenAI({ apiKey });
    }
    return aiInstance;
}

export interface VideoSummaryChunk {
    text: string;
    status?: string;
    usage?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function* summarizeYouTubeVideo(videoUrl: string, language: string, model: string): AsyncGenerator<VideoSummaryChunk, void, unknown> {
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
            const ai = await getAiInstance();
            const responseStream = await ai.models.generateContentStream({
                model,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                fileData: {
                                    fileUri: videoUrl,
                                    mimeType: 'video/*',
                                }
                            },
                            {
                                text: `Please summarize this video in ${language}.`,
                            },
                        ],
                    },
                ],
                config: {
                    systemInstruction,
                }
            });

            for await (const chunk of responseStream) {
                yield {
                    text: chunk.text || "",
                    usage: chunk.usageMetadata as any
                };
            }
            
            // Successfully completed the stream
            return;

        } catch (error: any) {
            attempt++;
            const errorMessage = error.message || "";
            // Common transient errors: 504 (Timeout), 503 (Service Unavailable), 429 (Too Many Requests)
            const isTransient = errorMessage.includes('504') || errorMessage.includes('503') || errorMessage.includes('429') || errorMessage.includes('deadline exceeded');
            
            if (isTransient && attempt < maxAttempts) {
                const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
                yield { 
                    text: "", 
                    status: `Transient error detected (${errorMessage.includes('504') ? '504 Timeout' : 'API Busy'}). Retrying in ${delay/1000}s... (Attempt ${attempt}/${maxAttempts})` 
                };
                await sleep(delay);
                continue;
            }

            console.error("Error during video summarization:", error);
            if (error instanceof Error) {
                if (errorMessage.includes('API_KEY_INVALID')) {
                    throw new Error("Invalid API key.");
                }
                if (errorMessage.includes('400')) {
                    throw new Error(`The video URL might be invalid or unsupported.`);
                }
                throw new Error(`Summary failed: ${errorMessage}`);
            }
            throw new Error("An unknown error occurred.");
        }
    }
}
