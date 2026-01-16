
import { GoogleGenAI } from "@google/genai";

if (!process.env.API_KEY) {
    console.error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

export interface VideoSummaryChunk {
    text: string;
    usage?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
}

export async function* summarizeYouTubeVideo(videoUrl: string, language: string, model: string): AsyncGenerator<VideoSummaryChunk, void, unknown> {
    try {
        const systemInstruction = `You are an expert at summarizing YouTube videos.
        Based on the provided video, generate a comprehensive summary in ${language}.
        
        Format Requirements:
        - Use Markdown.
        - Use ## Headings for segments.
        - Use **bold** for key concepts.
        - Use bullet points for takeaways.
        
        The output must be clear, structured, and entirely in ${language}.`;

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

    } catch (error) {
        console.error("Error during video summarization:", error);
        if (error instanceof Error) {
            if (error.message.includes('API_KEY_INVALID')) {
                 throw new Error("Invalid API key.");
            }
            if (error.message.includes('400')) {
                 throw new Error(`The video URL might be invalid or unsupported.`);
            }
             throw new Error(`Summary failed: ${error.message}`);
        }
        throw new Error("An unknown error occurred.");
    }
}
