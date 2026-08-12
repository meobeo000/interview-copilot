import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import type { SttConfig, SttProviderCallbacks, StreamingSttProvider } from "./types";
import { AUDIO_CHANNELS, AUDIO_SAMPLE_RATE, float32ToLinear16 } from "./audioEncoding";
import { SEO_VOCABULARY } from "./seoVocabulary";

export interface AzureSttConfig extends SttConfig {
  provider: "azure";
  subscriptionKey: string;
  serviceRegion: string;
  phraseListEnabled: boolean;
}

export interface AzureRecognizerSession {
  recognizer: SpeechSDK.SpeechRecognizer;
  pushStream: SpeechSDK.PushAudioInputStream;
}

export type AzureRecognizerFactory = (config: AzureSttConfig) => AzureRecognizerSession;

export function readAzureSttConfig(env: NodeJS.ProcessEnv = process.env): AzureSttConfig {
  const subscriptionKey = env.AZURE_SPEECH_KEY?.trim() ?? "";
  const serviceRegion = env.AZURE_SPEECH_REGION?.trim() ?? "";

  return {
    provider: "azure",
    model: "speech-to-text",
    language: "vi-VN",
    sampleRate: AUDIO_SAMPLE_RATE,
    channels: AUDIO_CHANNELS,
    encoding: "PCM16",
    isRealSttAvailable: Boolean(subscriptionKey && serviceRegion),
    mockMode: env.VITE_USE_MOCK_STT === "true",
    subscriptionKey,
    serviceRegion,
    phraseListEnabled: env.STT_AZURE_PHRASE_LIST !== "false"
  };
}

function validateConfig(config: AzureSttConfig): void {
  if (!config.subscriptionKey) {
    throw new Error("Azure STT configuration error: AZURE_SPEECH_KEY is missing.");
  }
  if (!config.serviceRegion) {
    throw new Error("Azure STT configuration error: AZURE_SPEECH_REGION is missing.");
  }
}

function azureErrorMessage(errorDetails?: string, reason?: string): string {
  const details = errorDetails || reason || "Unknown error";
  const normalized = details.toLowerCase();

  if (normalized.includes("401") || normalized.includes("unauthorized") || normalized.includes("invalid key") || normalized.includes("subscription")) {
    return `Azure STT authentication error: check AZURE_SPEECH_KEY and subscription status. (${details})`;
  }
  if (normalized.includes("429") || normalized.includes("quota") || normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return `Azure STT quota/rate limit exceeded: check Azure Speech F0/tier usage and quota limit. (${details})`;
  }
  if (normalized.includes("404") || normalized.includes("region") || normalized.includes("not found")) {
    return `Azure STT region configuration error: check AZURE_SPEECH_REGION (${details}).`;
  }
  if (normalized.includes("ws") || normalized.includes("connection") || normalized.includes("network") || normalized.includes("timeout")) {
    return `Azure STT network connection error: ${details}`;
  }
  return `Azure STT streaming error: ${details}`;
}

function defaultRecognizerFactory(config: AzureSttConfig): AzureRecognizerSession {
  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(config.subscriptionKey, config.serviceRegion);
  speechConfig.speechRecognitionLanguage = config.language;

  const pushStream = SpeechSDK.AudioInputStream.createPushStream(
    SpeechSDK.AudioStreamFormat.getWaveFormatPCM(config.sampleRate, 16, config.channels)
  );

  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  if (config.phraseListEnabled) {
    const phraseList = SpeechSDK.PhraseListGrammar.fromRecognizer(recognizer);
    for (const phrase of SEO_VOCABULARY) {
      phraseList.addPhrase(phrase);
    }
  }

  return { recognizer, pushStream };
}

export class AzureStreamingSttProvider implements StreamingSttProvider {
  private readonly config: AzureSttConfig;
  private readonly createFactory: AzureRecognizerFactory;
  private recognizer: SpeechSDK.SpeechRecognizer | undefined;
  private pushStream: SpeechSDK.PushAudioInputStream | undefined;
  private callbacks: SttProviderCallbacks | undefined;
  private active = false;

  constructor(
    config: AzureSttConfig = readAzureSttConfig(),
    createFactory: AzureRecognizerFactory = defaultRecognizerFactory
  ) {
    this.config = config;
    this.createFactory = createFactory;
  }

  getConfig(): SttConfig {
    return { ...this.config };
  }

  async startSession(callbacks: SttProviderCallbacks): Promise<void> {
    await this.stopSession();
    validateConfig(this.config);
    this.callbacks = callbacks;
    this.active = true;

    try {
      const session = this.createFactory(this.config);
      this.recognizer = session.recognizer;
      this.pushStream = session.pushStream;

      this.recognizer.recognizing = (_sender, event) => {
        if (!this.active) {
          return;
        }
        const text = event.result.text?.trim();
        if (text) {
          this.callbacks?.onPartial(text);
        }
      };

      this.recognizer.recognized = (_sender, event) => {
        if (!this.active) {
          return;
        }
        if (event.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const text = event.result.text?.trim();
          if (text) {
            this.callbacks?.onFinal(text);
          }
        }
      };

      this.recognizer.canceled = (_sender, event) => {
        if (!this.active) {
          return;
        }
        const message = azureErrorMessage(event.errorDetails, String(event.reason));
        this.callbacks?.onError(new Error(message));
      };

      this.recognizer.sessionStopped = () => {
        if (this.active) {
          console.log("[STT] Azure Speech session stopped by service.");
        }
      };

      await new Promise<void>((resolve, reject) => {
        this.recognizer?.startContinuousRecognitionAsync(
          () => {
            console.log("[STT] Azure Speech continuous recognition initialized (vi-VN).");
            resolve();
          },
          (err) => {
            this.active = false;
            reject(new Error(azureErrorMessage(String(err))));
          }
        );
      });
    } catch (error) {
      this.active = false;
      await this.stopSession();
      throw error instanceof Error ? error : new Error(azureErrorMessage(String(error)));
    }
  }

  sendAudioFrame(float32Data: ArrayBuffer): void {
    if (!this.active || !this.pushStream) {
      return;
    }

    try {
      const pcmBuffer = float32ToLinear16(float32Data);
      const arrayBuffer = pcmBuffer.buffer.slice(
        pcmBuffer.byteOffset,
        pcmBuffer.byteOffset + pcmBuffer.byteLength
      ) as ArrayBuffer;
      this.pushStream.write(arrayBuffer);
    } catch (error) {
      this.callbacks?.onError(
        new Error(`Azure STT malformed audio: ${error instanceof Error ? error.message : String(error)}`)
      );
    }
  }

  async stopSession(): Promise<void> {
    this.active = false;
    this.callbacks = undefined;

    if (this.pushStream) {
      try {
        this.pushStream.close();
      } catch {
        // Ignore stream closing errors
      }
      this.pushStream = undefined;
    }

    if (this.recognizer) {
      const rec = this.recognizer;
      this.recognizer = undefined;

      await new Promise<void>((resolve) => {
        try {
          rec.stopContinuousRecognitionAsync(
            () => {
              try {
                rec.close();
              } catch {
                // Ignore close errors
              }
              resolve();
            },
            () => {
              try {
                rec.close();
              } catch {
                // Ignore close errors
              }
              resolve();
            }
          );
        } catch {
          resolve();
        }
      });
    }
  }
}
