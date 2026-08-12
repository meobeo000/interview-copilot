import WebSocket from "ws";
import { AUDIO_CHANNELS, AUDIO_ENCODING, AUDIO_SAMPLE_RATE, float32ToLinear16 } from "./audioEncoding";
import { SEO_VOCABULARY } from "./seoVocabulary";
import type { SttConfig, SttProviderCallbacks, StreamingSttProvider } from "./types";

export interface DeepgramSttConfig extends SttConfig {
  provider: "deepgram";
  apiKey: string;
  keywordsEnabled: boolean;
}

export type DeepgramWebSocketFactory = (url: string, options: WebSocket.ClientOptions) => WebSocket;

export function readDeepgramSttConfig(env: NodeJS.ProcessEnv = process.env): DeepgramSttConfig {
  const apiKey = env.DEEPGRAM_API_KEY?.trim() ?? "";
  const model = env.DEEPGRAM_MODEL?.trim() || "nova-3";

  return {
    provider: "deepgram",
    model,
    language: "vi",
    sampleRate: AUDIO_SAMPLE_RATE,
    channels: AUDIO_CHANNELS,
    encoding: AUDIO_ENCODING,
    isRealSttAvailable: Boolean(apiKey),
    mockMode: env.VITE_USE_MOCK_STT === "true",
    apiKey,
    keywordsEnabled: env.STT_DEEPGRAM_KEYWORDS !== "false"
  };
}

function defaultWebSocketFactory(url: string, options: WebSocket.ClientOptions): WebSocket {
  return new WebSocket(url, options);
}

export class DeepgramStreamingSttProvider implements StreamingSttProvider {
  private readonly config: DeepgramSttConfig;
  private readonly createWebSocket: DeepgramWebSocketFactory;
  private ws: WebSocket | undefined;
  private active = false;
  private callbacks: SttProviderCallbacks | undefined;

  constructor(
    config: DeepgramSttConfig = readDeepgramSttConfig(),
    createWebSocket: DeepgramWebSocketFactory = defaultWebSocketFactory
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

    if (!this.config.apiKey) {
      throw new Error("Deepgram configuration error: DEEPGRAM_API_KEY is missing.");
    }

    const keywordParams = this.config.keywordsEnabled
      ? SEO_VOCABULARY.map((keyword) => `keywords=${encodeURIComponent(keyword)}:1`).join("&")
      : "";
    const queryParams = [
      `model=${encodeURIComponent(this.config.model)}`,
      `language=${encodeURIComponent(this.config.language)}`,
      `encoding=linear16`,
      `sample_rate=${this.config.sampleRate}`,
      `channels=${this.config.channels}`,
      `interim_results=true`,
      `smart_formatting=true`,
      keywordParams
    ].filter(Boolean).join("&");

    const url = `wss://api.deepgram.com/v1/listen?${queryParams}`;

    try {
      const ws = this.createWebSocket(url, {
        headers: {
          Authorization: `Token ${this.config.apiKey}`
        }
      });
      this.ws = ws;

      ws.on("open", () => {
        console.log(`[STT] Connected to Deepgram streaming STT (${this.config.model}, ${this.config.language}).`);
      });

      ws.on("message", (data: WebSocket.Data) => {
        if (!this.active) {
          return;
        }

        try {
          const response = JSON.parse(data.toString()) as {
            is_final?: boolean;
            channel?: { alternatives?: Array<{ transcript?: string }> };
          };
          const transcript = response.channel?.alternatives?.[0]?.transcript?.trim();
          if (!transcript) {
            return;
          }

          if (response.is_final) {
            this.callbacks?.onFinal(transcript);
          } else {
            this.callbacks?.onPartial(transcript);
          }
        } catch {
          // Ignore non-JSON provider frames.
        }
      });

      ws.on("error", (error: Error) => {
        if (this.active) {
          this.callbacks?.onError(new Error(`Deepgram streaming error: ${error.message}`));
        }
      });
    } catch (error) {
      this.active = false;
      throw new Error(`Failed to initialize Deepgram streaming STT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  sendAudioFrame(float32Data: ArrayBuffer): void {
    if (!this.active || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.ws.send(float32ToLinear16(float32Data));
    } catch (error) {
      this.callbacks?.onError(new Error(`Deepgram audio send failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  async stopSession(): Promise<void> {
    this.active = false;
    this.callbacks = undefined;
    if (!this.ws) {
      return;
    }

    try {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
        this.ws.close();
      }
    } catch {
      // Ignore errors while closing an already-failed provider stream.
    }
    this.ws = undefined;
  }
}

