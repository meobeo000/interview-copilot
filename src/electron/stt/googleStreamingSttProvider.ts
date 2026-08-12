import fs from "node:fs";
import { v2 } from "@google-cloud/speech";
import type { SttConfig, SttProviderCallbacks, StreamingSttProvider, GoogleStreaming } from "./types";
import { AUDIO_CHANNELS, AUDIO_ENCODING, AUDIO_SAMPLE_RATE, float32ToLinear16 } from "./audioEncoding";
import { SEO_VOCABULARY } from "./seoVocabulary";

export { SEO_VOCABULARY } from "./seoVocabulary";

export interface GoogleSttConfig extends SttConfig {
  provider: "google";
  projectId: string;
  location: string;
  endpoint: string;
  recognizer: string;
  adaptationEnabled: boolean;
}

interface GoogleSpeechClient {
  _streamingRecognize: () => GoogleStreaming;
  close: () => Promise<void>;
}

export type GoogleClientFactory = (options: { projectId: string; apiEndpoint: string }) => GoogleSpeechClient;

function endpointFor(location: string): string {
  return `${location}-speech.googleapis.com`;
}

export function readGoogleSttConfig(env: NodeJS.ProcessEnv = process.env): GoogleSttConfig {
  const projectId = env.GOOGLE_CLOUD_PROJECT_ID?.trim() ?? "";
  const location = env.GOOGLE_CLOUD_LOCATION?.trim() || "us";
  const endpoint = endpointFor(location);

  return {
    provider: "google",
    model: "chirp_3",
    language: "vi-VN",
    sampleRate: AUDIO_SAMPLE_RATE,
    channels: AUDIO_CHANNELS,
    encoding: AUDIO_ENCODING,
    isRealSttAvailable: Boolean(projectId),
    mockMode: env.VITE_USE_MOCK_STT === "true",
    projectId,
    location,
    endpoint,
    recognizer: projectId ? `projects/${projectId}/locations/${location}/recognizers/_` : "",
    adaptationEnabled: env.STT_GOOGLE_ADAPTATION !== "false"
  };
}

function defaultClientFactory(options: { projectId: string; apiEndpoint: string }): GoogleSpeechClient {
  return new v2.SpeechClient(options);
}

function validateConfig(config: GoogleSttConfig): void {
  if (!config.projectId) {
    throw new Error("Google STT configuration error: GOOGLE_CLOUD_PROJECT_ID is missing.");
  }

  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credentialPath && !fs.existsSync(credentialPath)) {
    throw new Error(`Google STT configuration error: credential file was not found at ${credentialPath}.`);
  }
}

function googleErrorMessage(error: unknown): string {
  const value = error as { code?: number | string; details?: string; message?: string };
  const code = value.code === undefined ? "" : ` (${String(value.code)})`;
  const message = value.details || value.message || String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("could not load the default credentials") || normalized.includes("credential") || normalized.includes("adc")) {
    return `Google STT credentials missing${code}: configure GOOGLE_APPLICATION_CREDENTIALS or Application Default Credentials.`;
  }
  if (normalized.includes("permission_denied") || value.code === 7) {
    return `Google STT permission denied${code}: check Speech-to-Text IAM permissions and project billing.`;
  }
  if (normalized.includes("resource_exhausted") || value.code === 8) {
    return `Google STT quota exceeded${code}: check Speech-to-Text quotas and billing.`;
  }
  if (normalized.includes("unavailable") || normalized.includes("econnreset") || normalized.includes("timeout")) {
    return `Google STT network or stream timeout${code}: ${message}`;
  }
  if (normalized.includes("not_found") || normalized.includes("model")) {
    return `Google STT model or region unavailable${code}: ${message}`;
  }
  return `Google STT streaming error${code}: ${message}`;
}

export class GoogleStreamingSttProvider implements StreamingSttProvider {
  private readonly config: GoogleSttConfig;
  private readonly createClient: GoogleClientFactory;
  private client: GoogleSpeechClient | undefined;
  private stream: GoogleStreaming | undefined;
  private callbacks: SttProviderCallbacks | undefined;
  private active = false;

  constructor(config: GoogleSttConfig = readGoogleSttConfig(), createClient: GoogleClientFactory = defaultClientFactory) {
    this.config = config;
    this.createClient = createClient;
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
      this.client = this.createClient({
        projectId: this.config.projectId,
        apiEndpoint: this.config.endpoint
      });
      const stream = this.client._streamingRecognize();
      this.stream = stream;
      stream.on("data", (response: unknown) => this.handleResponse(response));
      stream.on("error", (error: Error) => {
        if (this.active) {
          this.callbacks?.onError(new Error(googleErrorMessage(error)));
        }
      });
      stream.on("end", () => {
        if (this.active) {
          this.callbacks?.onError(new Error("Google STT stream ended unexpectedly."));
        }
      });

      stream.write({
        recognizer: this.config.recognizer,
        streamingConfig: {
          config: {
            explicitDecodingConfig: {
              encoding: AUDIO_ENCODING,
              sampleRateHertz: AUDIO_SAMPLE_RATE,
              audioChannelCount: AUDIO_CHANNELS
            },
            model: this.config.model,
            languageCodes: [this.config.language],
            features: {
              enableAutomaticPunctuation: true
            },
            ...(this.config.adaptationEnabled
              ? {
                  adaptation: {
                    phraseSets: [
                      {
                        inlinePhraseSet: {
                          phrases: SEO_VOCABULARY.map((value) => ({ value, boost: 2 }))
                        }
                      }
                    ]
                  }
                }
              : {})
          }
        }
      });

      console.log("[STT] Google Chirp 3 streaming session initialized.");
    } catch (error) {
      this.active = false;
      await this.stopSession();
      throw new Error(googleErrorMessage(error));
    }
  }

  sendAudioFrame(float32Data: ArrayBuffer): void {
    if (!this.active || !this.stream) {
      return;
    }

    try {
      this.stream.write({ audio: float32ToLinear16(float32Data) });
    } catch (error) {
      this.callbacks?.onError(new Error(`Google STT malformed audio: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  async stopSession(): Promise<void> {
    this.active = false;
    this.callbacks = undefined;

    if (this.stream) {
      try {
        this.stream.end();
      } catch {
        // Ignore errors while closing a failed stream.
      }
      this.stream = undefined;
    }

    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore errors while closing the client channel.
      }
      this.client = undefined;
    }
  }

  private handleResponse(response: unknown): void {
    if (!this.active) {
      return;
    }

    const results = (response as { results?: Array<{
      isFinal?: boolean;
      alternatives?: Array<{ transcript?: string }>;
    }> }).results;

    for (const result of results ?? []) {
      const transcript = result.alternatives?.[0]?.transcript?.trim();
      if (!transcript) {
        continue;
      }

      if (result.isFinal) {
        this.callbacks?.onFinal(transcript);
      } else {
        this.callbacks?.onPartial(transcript);
      }
    }
  }
}
