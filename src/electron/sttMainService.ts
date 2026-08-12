import type { BrowserWindow } from "electron";
import { DeepgramStreamingSttProvider } from "./stt/deepgramStreamingSttProvider";
import { GoogleStreamingSttProvider, readGoogleSttConfig } from "./stt/googleStreamingSttProvider";
import type { SttConfig, SttProviderName, StreamingSttProvider } from "./stt/types";

export { SEO_VOCABULARY as SEO_KEYWORDS } from "./stt/googleStreamingSttProvider";
export type { SttConfig } from "./stt/types";

export class SttMainService {
  private provider: StreamingSttProvider | undefined;
  private active = false;
  private firstAudioCapturedAt: number | undefined;
  private lastAudioCapturedAt: number | undefined;

  getConfig(): SttConfig {
    const providerName = this.providerName();
    const config = providerName === "google"
      ? readGoogleSttConfig()
      : new DeepgramStreamingSttProvider().getConfig();

    return config;
  }

  async startSession(window: BrowserWindow): Promise<void> {
    await this.stopSession();
    this.active = true;
    this.firstAudioCapturedAt = undefined;
    this.lastAudioCapturedAt = undefined;

    const provider = this.createProvider();
    this.provider = provider;
    this.logConfig(provider.getConfig());

    try {
      await provider.startSession({
        onPartial: (text) => {
          if (!this.active) {
            return;
          }
          if (this.firstAudioCapturedAt !== undefined) {
            console.log(`[STT] ${provider.getConfig().provider} first partial latency: ${Date.now() - this.firstAudioCapturedAt} ms`);
            this.firstAudioCapturedAt = undefined;
          }
          window.webContents.send("stt:partial", text);
        },
        onFinal: (text) => {
          if (!this.active) {
            return;
          }
          if (this.lastAudioCapturedAt !== undefined) {
            console.log(`[STT] ${provider.getConfig().provider} final segment latency: ${Date.now() - this.lastAudioCapturedAt} ms`);
          }
          window.webContents.send("stt:final", text);
        },
        onError: (error) => {
          if (this.active) {
            window.webContents.send("stt:error", error.message);
          }
        }
      });
    } catch (error) {
      this.active = false;
      window.webContents.send("stt:error", error instanceof Error ? error.message : String(error));
    }
  }

  sendAudioFrame(float32Data: ArrayBuffer, capturedAt = Date.now()): void {
    if (!this.active || !this.provider) {
      return;
    }

    this.firstAudioCapturedAt ??= capturedAt;
    this.lastAudioCapturedAt = capturedAt;
    this.provider.sendAudioFrame(float32Data);
  }

  async stopSession(): Promise<void> {
    this.active = false;
    if (this.provider) {
      await this.provider.stopSession();
      this.provider = undefined;
    }
    this.firstAudioCapturedAt = undefined;
    this.lastAudioCapturedAt = undefined;
  }

  private providerName(): SttProviderName {
    return process.env.STT_PROVIDER === "deepgram" ? "deepgram" : "google";
  }

  private createProvider(): StreamingSttProvider {
    return this.providerName() === "google"
      ? new GoogleStreamingSttProvider()
      : new DeepgramStreamingSttProvider();
  }

  private logConfig(config: SttConfig): void {
    console.log(
      `[STT]\nprovider: ${config.provider}\nmodel: ${config.model}\nlanguage: ${config.language}\nsampleRate: ${config.sampleRate}\nchannels: ${config.channels}\nencoding: ${config.encoding}`
    );
  }
}
