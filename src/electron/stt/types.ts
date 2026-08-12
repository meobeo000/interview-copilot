import type { Duplex } from "node:stream";

export type SttProviderName = "google" | "deepgram" | "azure" | "openai";

export interface SttConfig {
  provider: SttProviderName;
  model: string;
  language: string;
  sampleRate: number;
  channels: 1;
  encoding: "LINEAR16" | "PCM16";
  isRealSttAvailable: boolean;
  mockMode: boolean;
}

export interface SttProviderCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (error: Error) => void;
}

export interface StreamingSttProvider {
  getConfig: () => SttConfig;
  startSession: (callbacks: SttProviderCallbacks) => Promise<void>;
  sendAudioFrame: (float32Data: ArrayBuffer) => void;
  stopSession: () => Promise<void>;
}

export type GoogleStreaming = Duplex & {
  write: (chunk: unknown) => boolean;
  end: () => void;
  destroy: (error?: Error) => void;
};
