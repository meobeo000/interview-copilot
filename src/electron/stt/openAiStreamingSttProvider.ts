import WebSocket from "ws";
import { process16kFloat32To24kPcm16Base64 } from "./audioEncoding24k";
import type { SttConfig, SttProviderCallbacks, StreamingSttProvider } from "./types";

export interface OpenAiSttConfig extends SttConfig {
  provider: "openai";
  apiKey: string;
  realtimeModel: string;
  transcribeModel: string;
  sourceSampleRate: 16000;
  targetSampleRate: 24000;
  transcriptionPrompt: string;
}

export type OpenAiWebSocketFactory = (url: string, options: WebSocket.ClientOptions) => WebSocket;

export const DEFAULT_OPENAI_TRANSCRIBE_PROMPT =
  "Cuộc hội thoại là một buổi phỏng vấn SEO iGaming bằng tiếng Việt. Giữ nguyên chính xác các thuật ngữ tiếng Anh như site, keyword, iGaming, GSC, GA4, Ahrefs, PBN, Guest Post, Core Update, referring domain, anchor text, expired domain, canonical, indexing, search intent, internal link, organic traffic, money site, negative SEO, disavow, Wayback, casino, betting, sports betting.";

export function readOpenAiSttConfig(env: NodeJS.ProcessEnv = process.env): OpenAiSttConfig {
  const apiKey = env.OPENAI_API_KEY?.trim() ?? "";
  const realtimeModel = env.OPENAI_REALTIME_MODEL?.trim() || "gpt-4o-mini-realtime-preview";
  const transcribeModel = env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe";

  return {
    provider: "openai",
    model: realtimeModel,
    language: "vi",
    sampleRate: 24000,
    channels: 1,
    encoding: "PCM16",
    isRealSttAvailable: Boolean(apiKey),
    mockMode: env.VITE_USE_MOCK_STT === "true",
    apiKey,
    realtimeModel,
    transcribeModel,
    sourceSampleRate: 16000,
    targetSampleRate: 24000,
    transcriptionPrompt: DEFAULT_OPENAI_TRANSCRIBE_PROMPT
  };
}

function defaultWebSocketFactory(url: string, options: WebSocket.ClientOptions): WebSocket {
  return new WebSocket(url, options);
}

function formatOpenAiErrorMessage(error: { message?: string; type?: string; code?: string } | string): string {
  const details = typeof error === "string" ? error : error.message || error.code || error.type || "Unknown error";
  const normalized = details.toLowerCase();

  if (normalized.includes("401") || normalized.includes("unauthorized") || normalized.includes("invalid_api_key") || normalized.includes("incorrect api key")) {
    return "OpenAI STT authentication failed: check OPENAI_API_KEY and API key permissions.";
  }
  if (normalized.includes("429") || normalized.includes("rate_limit") || normalized.includes("quota") || normalized.includes("insufficient_quota")) {
    return "OpenAI STT rate limit or quota exceeded: check OpenAI account billing and limits.";
  }
  if (normalized.includes("404") || normalized.includes("model_not_found")) {
    return "OpenAI STT model unavailable: check OPENAI_REALTIME_MODEL or OPENAI_TRANSCRIBE_MODEL parameter.";
  }

  return `OpenAI STT streaming error: ${details}`;
}

export class OpenAIStreamingSttProvider implements StreamingSttProvider {
  private readonly config: OpenAiSttConfig;
  private readonly createWebSocket: OpenAiWebSocketFactory;
  private ws: WebSocket | undefined;
  private active = false;
  private callbacks: SttProviderCallbacks | undefined;
  private accumulatedPartialText = "";

  constructor(
    config: OpenAiSttConfig = readOpenAiSttConfig(),
    createWebSocket: OpenAiWebSocketFactory = defaultWebSocketFactory
  ) {
    this.config = config;
    this.createWebSocket = createWebSocket;
  }

  getConfig(): SttConfig {
    return { ...this.config };
  }

  async startSession(callbacks: SttProviderCallbacks): Promise<void> {
    await this.stopSession();
    this.callbacks = callbacks;
    this.active = true;
    this.accumulatedPartialText = "";

    if (!this.config.apiKey) {
      throw new Error("OpenAI configuration error: OPENAI_API_KEY is missing.");
    }

    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.config.realtimeModel)}`;

    try {
      const ws = this.createWebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`
        }
      });
      this.ws = ws;

      ws.on("open", () => {
        console.log(`[STT] Connected to OpenAI Realtime STT (${this.config.realtimeModel} / ${this.config.transcribeModel}, ${this.config.language}).`);

        // Send session configuration payload for input audio transcription
        const sessionUpdatePayload = {
          type: "session.update",
          session: {
            type: "realtime",
            audio: {
              input: {
                format: {
                  type: "audio/pcm",
                  rate: this.config.targetSampleRate
                },
                transcription: {
                  model: this.config.transcribeModel,
                  language: this.config.language,
                  prompt: this.config.transcriptionPrompt
                },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500
                }
              }
            }
          }
        };

        ws.send(JSON.stringify(sessionUpdatePayload));
      });

      ws.on("message", (data: WebSocket.Data) => {
        if (!this.active) {
          return;
        }

        try {
          const response = JSON.parse(data.toString()) as {
            type?: string;
            delta?: string;
            transcript?: string;
            error?: { message?: string; code?: string; type?: string };
          };

          if (response.type === "error" && response.error) {
            this.callbacks?.onError(new Error(formatOpenAiErrorMessage(response.error)));
            return;
          }

          if (response.type === "conversation.item.input_audio_transcription.failed") {
            const errDetail = response.error?.message || response.error?.code || "Transcription failed";
            this.callbacks?.onError(new Error(formatOpenAiErrorMessage(`Transcription failed: ${errDetail}`)));
            this.accumulatedPartialText = "";
            return;
          }

          if (response.type === "conversation.item.input_audio_transcription.delta" && typeof response.delta === "string") {
            this.accumulatedPartialText += response.delta;
            if (this.accumulatedPartialText.trim()) {
              this.callbacks?.onPartial(this.accumulatedPartialText.trim());
            }
          } else if (
            response.type === "conversation.item.input_audio_transcription.completed" &&
            typeof response.transcript === "string"
          ) {
            const finalTranscript = response.transcript.trim() || this.accumulatedPartialText.trim();
            if (finalTranscript) {
              this.callbacks?.onFinal(finalTranscript);
            }
            this.accumulatedPartialText = "";
          }
        } catch {
          // Ignore non-JSON frames
        }
      });

      ws.on("unexpected-response", (_req, res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          let errorDetail = body.trim();
          try {
            const parsed = JSON.parse(body) as { error?: { message?: string; code?: string }; message?: string };
            errorDetail = parsed.error?.message || parsed.error?.code || parsed.message || body;
          } catch {
            // Use raw text body
          }
          const message = formatOpenAiErrorMessage(`HTTP ${res.statusCode}${res.statusMessage ? ` ${res.statusMessage}` : ""}: ${errorDetail || "Unknown error"}`);
          if (this.active) {
            this.callbacks?.onError(new Error(message));
          }
        });
      });

      ws.on("error", (error: Error) => {
        if (this.active) {
          this.callbacks?.onError(new Error(formatOpenAiErrorMessage(error.message)));
        }
      });
    } catch (error) {
      this.active = false;
      throw new Error(formatOpenAiErrorMessage(error instanceof Error ? error.message : String(error)));
    }
  }

  sendAudioFrame(float32Data: ArrayBuffer): void {
    if (!this.active || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const base64Pcm16 = process16kFloat32To24kPcm16Base64(float32Data);
      if (!base64Pcm16) {
        return;
      }

      const appendPayload = {
        type: "input_audio_buffer.append",
        audio: base64Pcm16
      };

      this.ws.send(JSON.stringify(appendPayload));
    } catch (error) {
      this.callbacks?.onError(new Error(`OpenAI audio send failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  async stopSession(): Promise<void> {
    this.active = false;
    this.callbacks = undefined;
    this.accumulatedPartialText = "";

    if (!this.ws) {
      return;
    }

    try {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    } catch {
      // Ignore errors during stream teardown
    }
    this.ws = undefined;
  }
}
