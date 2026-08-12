import WebSocket from "ws";
import { float32ToLinear16 } from "./audioEncoding";
import { SEO_VOCABULARY } from "./seoVocabulary";
import type { SttConfig, SttProviderCallbacks, StreamingSttProvider } from "./types";

const DEEPGRAM_CONFIG: SttConfig = {
  provider: "deepgram",
  model: "nova-2",
  language: "vi",
  sampleRate: 16000,
  channels: 1,
  encoding: "LINEAR16",
  isRealSttAvailable: Boolean(process.env.DEEPGRAM_API_KEY),
  mockMode: process.env.VITE_USE_MOCK_STT === "true"
};

export class DeepgramStreamingSttProvider implements StreamingSttProvider {
  private ws: WebSocket | undefined;
  private active = false;
  private callbacks: SttProviderCallbacks | undefined;

  getConfig(): SttConfig {
    return {
      ...DEEPGRAM_CONFIG,
      isRealSttAvailable: Boolean(process.env.DEEPGRAM_API_KEY)
    };
  }

  async startSession(callbacks: SttProviderCallbacks): Promise<void> {
    await this.stopSession();
    this.callbacks = callbacks;
    this.active = true;

    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) {
      throw new Error("Deepgram configuration error: DEEPGRAM_API_KEY is missing.");
    }

    const keywordParams = SEO_VOCABULARY.map((keyword) => `keywords=${encodeURIComponent(keyword)}:1`).join("&");
    const url = `wss://api.deepgram.com/v1/listen?model=${DEEPGRAM_CONFIG.model}&language=${DEEPGRAM_CONFIG.language}&encoding=linear16&sample_rate=${DEEPGRAM_CONFIG.sampleRate}&channels=${DEEPGRAM_CONFIG.channels}&interim_results=true&smart_formatting=true&${keywordParams}`;

    try {
      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${deepgramKey}`
        }
      });
      this.ws = ws;

      ws.on("open", () => {
        console.log("[STT] Connected to Deepgram streaming STT.");
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
