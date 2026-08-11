import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { useCopilotStore } from "./store/useCopilotStore";

describe("App Phase 3B ChatGPT Voice multi-segment turn isolation tests", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_USE_MOCK_STT", "false");
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

  // REGRESSION TEST: 6-segment ChatGPT Voice interview scenario
  it("REGRESSION TEST: combines 6 speech segments with natural pauses into EXACTLY ONE Question and History item", async () => {
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

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    // Segment 1
    act(() => {
      partialCb?.("Anh hỏi sâu hơn chút");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    // Segment 2
    act(() => {
      partialCb?.("Anh hỏi sâu hơn chút, giả sử index canonical robots đều bình thường");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    // Segment 3
    act(() => {
      partialCb?.("Anh hỏi sâu hơn chút, giả sử index canonical robots đều bình thường, impressions chỉ giảm 5% nhưng click giảm 40%");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // Segment 4
    act(() => {
      partialCb?.("Anh hỏi sâu hơn chút, giả sử index canonical robots đều bình thường, impressions chỉ giảm 5% nhưng click giảm 40%, vị trí trung bình từ 3.2 xuống 6.8");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1700);
    });

    // Segment 5
    act(() => {
      partialCb?.("Anh hỏi sâu hơn chút, giả sử index canonical robots đều bình thường, impressions chỉ giảm 5% nhưng click giảm 40%, vị trí trung bình từ 3.2 xuống 6.8, đối thủ chính lại tăng");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });

    // Segment 6: Question prompt
    act(() => {
      partialCb?.("Anh hỏi sâu hơn chút, giả sử index canonical robots đều bình thường, impressions chỉ giảm 5% nhưng click giảm 40%, vị trí trung bình từ 3.2 xuống 6.8, đối thủ chính lại tăng, em ưu tiên kiểm tra gì tiếp theo và vì sao?");
    });

    // Candidate pause (~1200ms) + Grace window (~1800ms) + Answer stream (~5000ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    const history = useCopilotStore.getState().history;
    // MUST BE EXACTLY ONE HISTORY ITEM
    expect(history).toHaveLength(1);
    expect(history[0].rawTranscript).toContain("Anh hỏi sâu hơn chút");
    expect(history[0].rawTranscript).toContain("em ưu tiên kiểm tra gì tiếp theo và vì sao");
  });

  it("reopens turn if speech resumes during Grace Window", async () => {
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

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    act(() => {
      partialCb?.("Em sẽ xử lý như thế nào?");
    });

    // Candidate pause (~1200ms) triggers Grace Window
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });

    expect(useCopilotStore.getState().status).toBe("FinalizingQuestion");

    // Speech resumes during Grace Window (at 1000ms into grace window)
    act(() => {
      partialCb?.("Em sẽ xử lý như thế nào, và tại sao em lại chọn cách đó?");
    });

    // Reopened turn! Status back to Listening
    expect(useCopilotStore.getState().status).toBe("Listening");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    const history = useCopilotStore.getState().history;
    expect(history).toHaveLength(1);
    expect(history[0].rawTranscript).toContain("và tại sao em lại chọn cách đó");
  });

  it("bypasses Grace Window and finalizes immediately on Alt+Enter", async () => {
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

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    act(() => {
      partialCb?.("Theo em nếu website giảm 40% traffic thì kiểm tra gì?");
    });

    fireEvent.click(screen.getByRole("button", { name: /answer now/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(useCopilotStore.getState().history).toHaveLength(1);
    expect(useCopilotStore.getState().history[0].rawTranscript).toBe("Theo em nếu website giảm 40% traffic thì kiểm tra gì?");
  });

  it("isolates two genuinely separate questions into two distinct history items", async () => {
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

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    // Question 1
    act(() => {
      partialCb?.("Câu hỏi 1: Em xử lý canonical tag bị lỗi như thế nào?");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(useCopilotStore.getState().history).toHaveLength(1);

    // Question 2
    act(() => {
      partialCb?.("Câu hỏi 2: Em đánh giá backlink spam bằng cách nào?");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    const history = useCopilotStore.getState().history;
    expect(history).toHaveLength(2);
    expect(history[0].rawTranscript).toBe("Câu hỏi 2: Em đánh giá backlink spam bằng cách nào?");
    expect(history[1].rawTranscript).toBe("Câu hỏi 1: Em xử lý canonical tag bị lỗi như thế nào?");
  });
});
