import WebSocket from "ws";
import { AUDIO_CHANNELS, AUDIO_ENCODING, AUDIO_SAMPLE_RATE, float32ToLinear16 } from "./audioEncoding";
import { DEEPGRAM_KEYTERMS } from "./seoVocabulary";
import type { SttConfig, SttProviderCallbacks, StreamingSttProvider } from "./types";

export interface DeepgramSttConfig extends SttConfig {
  provider: "deepgram";
  apiKey: string;
  keytermsEnabled: boolean;
  keytermList: readonly string[];
}

export type DeepgramWebSocketFactory = (url: string, options: WebSocket.ClientOptions) => WebSocket;

export function readDeepgramSttConfig(env: NodeJS.ProcessEnv = process.env): DeepgramSttConfig {
  const apiKey = env.DEEPGRAM_API_KEY?.trim() ?? "";
  const model = env.DEEPGRAM_MODEL?.trim() || "nova-3";

  let keytermsEnabled = true;
  if (env.STT_DEEPGRAM_KEYTERMS !== undefined) {
    keytermsEnabled = env.STT_DEEPGRAM_KEYTERMS !== "false";
  } else if (env.STT_DEEPGRAM_KEYWORDS !== undefined) {
    keytermsEnabled = env.STT_DEEPGRAM_KEYWORDS !== "false";
  }

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
    keytermsEnabled,
    keytermList: DEEPGRAM_KEYTERMS
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

    const keytermParams = this.config.keytermsEnabled
      ? this.config.keytermList.map((term) => `keyterm=${encodeURIComponent(term)}`).join("&")
      : "";
    const queryParams = [
      `model=${encodeURIComponent(this.config.model)}`,
      `language=${encodeURIComponent(this.config.language)}`,
      `encoding=linear16`,
      `sample_rate=${this.config.sampleRate}`,
      `channels=${this.config.channels}`,
      `interim_results=true`,
      `smart_formatting=true`,
      keytermParams
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
        console.log(
          `[STT] Connected to Deepgram streaming STT (${this.config.model}, ${this.config.language}, keyterms: ${this.config.keytermsEnabled ? this.config.keytermList.length : 0}).`
        );
      });

      ws.on("message", (data: WebSocket.Data) => {
        if (!this.active) {
          return;
        }

        try {
          const response = JSON.parse(data.toString()) as {
            type?: string;
            is_final?: boolean;
            speech_final?: boolean;
            channel?: { alternatives?: Array<{ transcript?: string }> };
          };

          if (response.type === "UtteranceEnd") {
            this.callbacks?.onSpeechFinal?.();
            return;
          }

          const transcript = response.channel?.alternatives?.[0]?.transcript?.trim();
          if (!transcript) {
            if (response.speech_final) {
              this.callbacks?.onSpeechFinal?.();
            }
            return;
          }

          if (response.is_final) {
            this.callbacks?.onFinal(transcript);
          } else {
            this.callbacks?.onPartial(transcript);
          }

          if (response.speech_final) {
            this.callbacks?.onSpeechFinal?.(transcript);
          }
        } catch {
          // Ignore non-JSON provider frames.
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
            const parsed = JSON.parse(body) as { err_msg?: string; error?: string; message?: string };
            errorDetail = parsed.err_msg || parsed.error || parsed.message || body;
          } catch {
            // Use raw text body
          }
          const message = `Deepgram connection rejected (HTTP ${res.statusCode}${res.statusMessage ? ` ${res.statusMessage}` : ""}): ${errorDetail || "Unknown error"}`;
          if (this.active) {
            this.callbacks?.onError(new Error(message));
          }
        });
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


