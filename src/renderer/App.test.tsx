import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { useCopilotStore } from "./store/useCopilotStore";

describe("App Phase 3B multi-question turn isolation tests", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_USE_MOCK_STT", "true");
    window.localStorage.clear();
    useCopilotStore.setState({
      status: "Idle",
      audioLevel: 0,
      liveTranscript: "",
      rawQuestion: "",
      cleanedQuestion: "",
      detectedTopic: "",
      questionConfidence: undefined,
      answer: { openingLine: "", bullets: [], keywords: [] },
      history: [],
      isHistoryOpen: false,
      error: undefined
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Test A: Question 1 finalizes, then Question 2 starts -> Question 2 rawTranscript contains ONLY Question 2 text.
  it("Test A: isolates Question 2 transcript so it contains only Question 2 text after Q1 finalization", async () => {
    let partialCb: ((text: string) => void) | undefined;
    window.copilotWindow = {
      hide: vi.fn(),
      getDesktopSourceId: vi.fn(),
      stt: {
        startSession: vi.fn().mockResolvedValue(undefined),
        sendAudioFrame: vi.fn(),
        stopSession: vi.fn().mockResolvedValue(undefined),
        getConfig: vi.fn().mockResolvedValue({ provider: "deepgram", isRealSttAvailable: true, mockMode: false }),
        onPartial: (cb) => {
          partialCb = cb;
          return () => {};
        },
        onFinal: () => () => {},
        onError: () => () => {}
      }
    };
    vi.stubEnv("VITE_USE_MOCK_STT", "false");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    // Question 1 speech
    act(() => {
      partialCb?.("Theo em backlink hiện tại có còn quan trọng không?");
    });
    fireEvent.click(screen.getByRole("button", { name: /answer now/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(useCopilotStore.getState().rawQuestion).toBe("Theo em backlink hiện tại có còn quan trọng không?");

    // Question 2 speech starts
    act(() => {
      partialCb?.("Em xử lý canonical tag bị lỗi 301 như thế nào?");
    });
    fireEvent.click(screen.getByRole("button", { name: /answer now/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(useCopilotStore.getState().rawQuestion).toBe("Em xử lý canonical tag bị lỗi 301 như thế nào?");
    expect(useCopilotStore.getState().rawQuestion).not.toContain("Theo em backlink");
  });

  // Test B: Alt+Enter finalizes Q1 -> next turn starts empty.
  it("Test B: Alt+Enter finalizes Q1 and clears liveTranscript for next turn", async () => {
    let partialCb: ((text: string) => void) | undefined;
    window.copilotWindow = {
      hide: vi.fn(),
      getDesktopSourceId: vi.fn(),
      stt: {
        startSession: vi.fn().mockResolvedValue(undefined),
        sendAudioFrame: vi.fn(),
        stopSession: vi.fn().mockResolvedValue(undefined),
        getConfig: vi.fn().mockResolvedValue({ provider: "deepgram", isRealSttAvailable: true, mockMode: false }),
        onPartial: (cb) => {
          partialCb = cb;
          return () => {};
        },
        onFinal: () => () => {},
        onError: () => () => {}
      }
    };
    vi.stubEnv("VITE_USE_MOCK_STT", "false");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    act(() => {
      partialCb?.("Theo em nếu website giảm organic traffic 40% thì kiểm tra gì?");
    });

    fireEvent.click(screen.getByRole("button", { name: /answer now/i }));

    // liveTranscript reset for next turn
    expect(useCopilotStore.getState().liveTranscript).toBe("");
  });

  // Test C: Speech arrives while answer for Q1 is streaming -> it is preserved as next-turn transcript, not lost.
  it("Test C: preserves speech arriving while Q1 answer is streaming for the next turn", async () => {
    let partialCb: ((text: string) => void) | undefined;
    window.copilotWindow = {
      hide: vi.fn(),
      getDesktopSourceId: vi.fn(),
      stt: {
        startSession: vi.fn().mockResolvedValue(undefined),
        sendAudioFrame: vi.fn(),
        stopSession: vi.fn().mockResolvedValue(undefined),
        getConfig: vi.fn().mockResolvedValue({ provider: "deepgram", isRealSttAvailable: true, mockMode: false }),
        onPartial: (cb) => {
          partialCb = cb;
          return () => {};
        },
        onFinal: () => () => {},
        onError: () => () => {}
      }
    };
    vi.stubEnv("VITE_USE_MOCK_STT", "false");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    act(() => {
      partialCb?.("Câu hỏi 1?");
    });
    fireEvent.click(screen.getByRole("button", { name: /answer now/i }));

    // Midway through streaming Q1 answer, Q2 speech arrives
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(useCopilotStore.getState().status).toBe("Answering");

    act(() => {
      partialCb?.("Theo em nếu website đang bị giảm traffic và");
    });

    // Complete Q1 answer stream
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    // Next turn transcript was preserved!
    expect(useCopilotStore.getState().liveTranscript).toBe("Theo em nếu website đang bị giảm traffic và");
  });

  // Test D: Stale detector timer from Q1 cannot finalize Q2.
  it("Test D: suppresses stale detector timers from Q1 during Answering state", async () => {
    let partialCb: ((text: string) => void) | undefined;
    window.copilotWindow = {
      hide: vi.fn(),
      getDesktopSourceId: vi.fn(),
      stt: {
        startSession: vi.fn().mockResolvedValue(undefined),
        sendAudioFrame: vi.fn(),
        stopSession: vi.fn().mockResolvedValue(undefined),
        getConfig: vi.fn().mockResolvedValue({ provider: "deepgram", isRealSttAvailable: true, mockMode: false }),
        onPartial: (cb) => {
          partialCb = cb;
          return () => {};
        },
        onFinal: () => () => {},
        onError: () => () => {}
      }
    };
    vi.stubEnv("VITE_USE_MOCK_STT", "false");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    act(() => {
      partialCb?.("Câu hỏi 1?");
    });
    fireEvent.click(screen.getByRole("button", { name: /answer now/i }));

    // Q1 answer is streaming
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    // Stale timer runs during Answering state
    expect(useCopilotStore.getState().status).toBe("Answering");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    // Status returns to Listening for next turn, not prematurely finalized by Q1 timer
    expect(useCopilotStore.getState().status).toBe("Listening");
  });

  // Test E: Two consecutive complete Vietnamese questions produce two distinct history items.
  it("Test E: produces two distinct history items for two consecutive finalized questions", async () => {
    let partialCb: ((text: string) => void) | undefined;
    window.copilotWindow = {
      hide: vi.fn(),
      getDesktopSourceId: vi.fn(),
      stt: {
        startSession: vi.fn().mockResolvedValue(undefined),
        sendAudioFrame: vi.fn(),
        stopSession: vi.fn().mockResolvedValue(undefined),
        getConfig: vi.fn().mockResolvedValue({ provider: "deepgram", isRealSttAvailable: true, mockMode: false }),
        onPartial: (cb) => {
          partialCb = cb;
          return () => {};
        },
        onFinal: () => () => {},
        onError: () => () => {}
      }
    };
    vi.stubEnv("VITE_USE_MOCK_STT", "false");

    let uuidCounter = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    // Q1
    act(() => {
      partialCb?.("Câu hỏi thứ nhất về SEO?");
    });
    fireEvent.click(screen.getByRole("button", { name: /answer now/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    // Q2
    act(() => {
      partialCb?.("Câu hỏi thứ hai về SEO?");
    });
    fireEvent.click(screen.getByRole("button", { name: /answer now/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    const history = useCopilotStore.getState().history;
    expect(history).toHaveLength(2);
    expect(history[0].rawTranscript).toBe("Câu hỏi thứ hai về SEO?");
    expect(history[1].rawTranscript).toBe("Câu hỏi thứ nhất về SEO?");
  });

  // Test F: Opening History still does not interrupt the current turn.
  it("Test F: opening History drawer does not interrupt background Listening state", async () => {
    useCopilotStore.setState({
      history: [
        {
          id: "hist-1",
          startedAt: Date.now() - 60_000,
          rawTranscript: "Đánh giá backlink ntn?",
          cleanedQuestion: "Đánh giá backlink ntn?",
          answer: { openingLine: "Đánh giá theo DR/UR...", bullets: [], keywords: [] }
        }
      ]
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));
    expect(screen.getByText("Listening")).toBeInTheDocument();

    const historyButton = screen.getByRole("button", { name: /history/i });
    fireEvent.click(historyButton);

    expect(screen.getAllByText("History (1)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Đánh giá backlink ntn?")).toBeInTheDocument();
    expect(useCopilotStore.getState().status).toBe("Listening");
  });
});
