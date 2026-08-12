import type { BrowserWindow } from "electron";
import { AzureStreamingSttProvider, readAzureSttConfig } from "./stt/azureStreamingSttProvider";
import { DeepgramStreamingSttProvider, readDeepgramSttConfig } from "./stt/deepgramStreamingSttProvider";
import { GoogleStreamingSttProvider, readGoogleSttConfig } from "./stt/googleStreamingSttProvider";
import { OpenAIStreamingSttProvider, readOpenAiSttConfig } from "./stt/openAiStreamingSttProvider";
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
    if (providerName === "azure") {
      return readAzureSttConfig();
    }
    if (providerName === "deepgram") {
      return readDeepgramSttConfig();
    }
    if (providerName === "openai") {
      return readOpenAiSttConfig();
    }
    return readGoogleSttConfig();
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
    const providerEnv = process.env.STT_PROVIDER?.trim().toLowerCase();
    if (providerEnv === "azure") {
      return "azure";
    }
    if (providerEnv === "deepgram") {
      return "deepgram";
    }
    if (providerEnv === "openai") {
      return "openai";
    }
    return "google";
  }

  private createProvider(): StreamingSttProvider {
    const providerName = this.providerName();
    if (providerName === "azure") {
      return new AzureStreamingSttProvider();
    }
    if (providerName === "deepgram") {
      return new DeepgramStreamingSttProvider();
    }
    if (providerName === "openai") {
      return new OpenAIStreamingSttProvider();
    }
    return new GoogleStreamingSttProvider();
  }

  private logConfig(config: SttConfig): void {
    if (config.provider === "openai") {
      const openAiCfg = config as SttConfig & { sourceSampleRate?: number; targetSampleRate?: number };
      console.log(
        `[STT]\nprovider: ${config.provider}\nmodel: ${config.model}\nlanguage: ${config.language}\nsourceSampleRate: ${openAiCfg.sourceSampleRate ?? 16000}\ntargetSampleRate: ${openAiCfg.targetSampleRate ?? 24000}\nchannels: ${config.channels}\nwireEncoding: ${config.encoding.toLowerCase()}`
      );
      return;
    }

    const keytermConfig = config as SttConfig & { keytermsEnabled?: boolean; keytermList?: readonly string[] };
    const keytermsInfo = typeof keytermConfig.keytermsEnabled === "boolean"
      ? `\nkeytermsEnabled: ${String(keytermConfig.keytermsEnabled)}\nkeytermCount: ${Array.isArray(keytermConfig.keytermList) ? keytermConfig.keytermList.length : 0}`
      : "";
    console.log(
      `[STT]\nprovider: ${config.provider}\nmodel: ${config.model}\nlanguage: ${config.language}${keytermsInfo}\nsampleRate: ${config.sampleRate}\nchannels: ${config.channels}\nencoding: ${config.encoding.toLowerCase()}`
    );
  }
}
