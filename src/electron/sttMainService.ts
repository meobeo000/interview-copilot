import { BrowserWindow } from "electron";
import WebSocket from "ws";

export const SEO_KEYWORDS = [
  "GSC",
  "GA4",
  "Ahrefs",
  "backlink",
  "Core Update",
  "canonical",
  "redirect 301",
  "crawl budget",
  "robots.txt",
  "sitemap"
];

export interface SttConfig {
  provider: string;
  isRealSttAvailable: boolean;
  mockMode: boolean;
}

export class SttMainService {
  private ws: WebSocket | undefined;
  private active = false;

  getConfig(): SttConfig {
    const mockMode = process.env.VITE_USE_MOCK_STT === "true";
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const isRealSttAvailable = Boolean(deepgramKey || groqKey || openaiKey);

    return {
      provider: process.env.STT_PROVIDER || (deepgramKey ? "deepgram" : "webspeech"),
      isRealSttAvailable,
      mockMode
    };
  }

  async startSession(window: BrowserWindow): Promise<void> {
    await this.stopSession();
    this.active = true;

    const deepgramKey = process.env.DEEPGRAM_API_KEY;

    if (!deepgramKey) {
      window.webContents.send(
        "stt:error",
        "No STT API key configured. Please add DEEPGRAM_API_KEY to your .env file or set VITE_USE_MOCK_STT=true for dev testing."
      );
      return;
    }

    try {
      const keywordParams = SEO_KEYWORDS.map((kw) => `keywords=${encodeURIComponent(kw)}:2`).join("&");
      const url = `wss://api.deepgram.com/v1/listen?model=nova-2&language=vi&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&smart_formatting=true&${keywordParams}`;

      const ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${deepgramKey}`
        }
      });

      this.ws = ws;

      ws.on("open", () => {
        console.log("[STT] Connected to Deepgram Vietnamese streaming STT WebSocket.");
      });

      ws.on("message", (data: WebSocket.Data) => {
        if (!this.active) {
          return;
        }

        try {
          const response = JSON.parse(data.toString()) as {
            is_final?: boolean;
            channel?: {
              alternatives?: Array<{
                transcript?: string;
                confidence?: number;
              }>;
            };
          };

          const transcript = response.channel?.alternatives?.[0]?.transcript?.trim();
          if (transcript) {
            if (response.is_final) {
              window.webContents.send("stt:final", transcript);
            } else {
              window.webContents.send("stt:partial", transcript);
            }
          }
        } catch {
          // Ignore non-JSON frame responses
        }
      });

      ws.on("error", (err: Error) => {
        console.error("[STT] Deepgram WebSocket error:", err.message);
        if (this.active) {
          window.webContents.send("stt:error", `Streaming STT error: ${err.message}`);
        }
      });

      ws.on("close", () => {
        console.log("[STT] Deepgram WebSocket closed.");
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.webContents.send("stt:error", `Failed to initialize STT session: ${msg}`);
    }
  }

  sendAudioFrame(float32Data: ArrayBuffer): void {
    if (!this.active || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      // Convert Float32Array PCM (-1.0 to 1.0) to 16-bit signed PCM (Int16Array)
      const float32Array = new Float32Array(float32Data);
      const int16Buffer = new Int16Array(float32Array.length);

      for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      this.ws.send(int16Buffer.buffer);
    } catch (err) {
      console.warn("[STT] Error sending audio frame to WebSocket:", err);
    }
  }

  async stopSession(): Promise<void> {
    this.active = false;
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          // Send Deepgram close stream payload
          this.ws.send(JSON.stringify({ type: "CloseStream" }));
          this.ws.close();
        }
      } catch {
        // Ignore closing errors
      }
      this.ws = undefined;
    }
  }
}
