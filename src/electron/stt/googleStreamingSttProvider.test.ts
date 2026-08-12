import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { GoogleStreamingSttProvider, readGoogleSttConfig } from "./googleStreamingSttProvider";
import type { GoogleStreaming } from "./types";

class FakeGoogleStream extends EventEmitter {
  readonly writes: unknown[] = [];
  readonly end = vi.fn();
  readonly destroy = vi.fn();

  write(chunk: unknown): boolean {
    this.writes.push(chunk);
    return true;
  }
}

describe("GoogleStreamingSttProvider", () => {
  it("builds a Chirp 3 Vietnamese streaming request and maps partial/final results", async () => {
    const fakeStream = new FakeGoogleStream();
    const stream = fakeStream as unknown as GoogleStreaming;
    const client = {
      _streamingRecognize: vi.fn(() => stream),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const config = readGoogleSttConfig({
      GOOGLE_CLOUD_PROJECT_ID: "test-project",
      GOOGLE_CLOUD_LOCATION: "us",
      STT_GOOGLE_ADAPTATION: "true"
    });
    const provider = new GoogleStreamingSttProvider(config, () => client);
    const onPartial = vi.fn();
    const onFinal = vi.fn();

    await provider.startSession({ onPartial, onFinal, onError: vi.fn() });

    expect(client._streamingRecognize).toHaveBeenCalledOnce();
    const configRequest = fakeStream.writes[0] as {
      recognizer: string;
      streamingConfig: { config: {
        model: string;
        languageCodes: string[];
        explicitDecodingConfig: { encoding: string; sampleRateHertz: number; audioChannelCount: number };
        adaptation?: { phraseSets: Array<{ inlinePhraseSet?: { phrases: Array<{ value?: string }> } }> };
      } };
    };

    expect(configRequest.recognizer).toBe("projects/test-project/locations/us/recognizers/_");
    expect(configRequest.streamingConfig.config.model).toBe("chirp_3");
    expect(configRequest.streamingConfig.config.languageCodes).toEqual(["vi-VN"]);
    expect(configRequest.streamingConfig.config.explicitDecodingConfig).toEqual({
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      audioChannelCount: 1
    });
    expect(configRequest.streamingConfig.config.adaptation?.phraseSets[0]?.inlinePhraseSet?.phrases).toEqual(
      expect.arrayContaining([{ value: "GSC", boost: 2 }, { value: "iGaming", boost: 2 }])
    );

    provider.sendAudioFrame(new Float32Array([0, 0.5]).buffer);
    expect(fakeStream.writes[1]).toEqual({ audio: Buffer.from([0, 0, 0, 64]) });

    stream.emit("data", { results: [{ isFinal: false, alternatives: [{ transcript: "Dự án iGaming" }] }] });
    stream.emit("data", { results: [{ isFinal: true, alternatives: [{ transcript: "Dự án iGaming gần nhất?" }] }] });
    expect(onPartial).toHaveBeenCalledWith("Dự án iGaming");
    expect(onFinal).toHaveBeenCalledWith("Dự án iGaming gần nhất?");

    await provider.stopSession();
    expect(stream.end).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("reports missing project configuration without calling Google", async () => {
    const createClient = vi.fn();
    const provider = new GoogleStreamingSttProvider(readGoogleSttConfig({}), createClient);

    await expect(provider.startSession({ onPartial: vi.fn(), onFinal: vi.fn(), onError: vi.fn() }))
      .rejects.toThrow("GOOGLE_CLOUD_PROJECT_ID is missing");
    expect(createClient).not.toHaveBeenCalled();
  });
});
