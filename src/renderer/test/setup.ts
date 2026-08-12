import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const storage = new Map<string, string>();

Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear()
  },
  writable: true
});

// Mock copilotWindow with a streaming answer IPC bridge that resolves quickly.
const mockChunkCbs = new Set<(payload: { questionId: string; accumulatedText: string }) => void>();
const mockCompleteCbs = new Set<(payload: { questionId: string; answer: unknown }) => void>();
const mockErrorCbs = new Set<(payload: { questionId: string; error: string }) => void>();

const mockAnswer = {
  generateAnswer: vi.fn(async (req: { questionId: string; question: string; rawTranscript: string }) => {
    // Simulate progressive streaming with immediate mock chunks
    const { questionId } = req;
    setTimeout(() => {
      mockChunkCbs.forEach(cb => cb({ questionId, accumulatedText: "Mock answer chunk" }));
    }, 10);
    setTimeout(() => {
      const answer = { openingLine: "Mock opening", bullets: ["Mock bullet"], keywords: ["keyword"] };
      mockChunkCbs.forEach(cb => cb({ questionId, accumulatedText: "Mock answer chunk complete" }));
      mockCompleteCbs.forEach(cb => cb({ questionId, answer }));
    }, 50);
  }),
  cancelAnswer: vi.fn(async () => {}),
  onChunk: vi.fn((cb: (payload: { questionId: string; accumulatedText: string }) => void) => {
    mockChunkCbs.add(cb);
    return () => { mockChunkCbs.delete(cb); };
  }),
  onComplete: vi.fn((cb: (payload: { questionId: string; answer: unknown }) => void) => {
    mockCompleteCbs.add(cb);
    return () => { mockCompleteCbs.delete(cb); };
  }),
  onError: vi.fn((cb: (payload: { questionId: string; error: string }) => void) => {
    mockErrorCbs.add(cb);
    return () => { mockErrorCbs.delete(cb); };
  })
};

Object.defineProperty(window, "copilotWindow", {
  value: {
    hide: vi.fn(),
    answer: mockAnswer
  },
  writable: true
});
