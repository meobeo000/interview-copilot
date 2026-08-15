import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { useCopilotStore } from "./store/useCopilotStore";

// ---------------------------------------------------------------------------
// Helper: build a mock copilotWindow.answer that completes quickly
// ---------------------------------------------------------------------------
function makeMockAnswerBridge() {
  type ChunkCb = (payload: { questionId: string; accumulatedText: string }) => void;
  type CompleteCb = (payload: { questionId: string; answer: unknown }) => void;
  type ErrorCb = (payload: { questionId: string; error: string }) => void;

  const chunkCbs = new Set<ChunkCb>();
  const completeCbs = new Set<CompleteCb>();
  const errorCbs = new Set<ErrorCb>();

  const generateAnswer = vi.fn(async (req: { questionId: string }) => {
    const { questionId } = req;
    // Fire a chunk immediately, but complete after a long delay (10s)
    // so the "Answering" status is observable at 3050ms in the multi-turn test
    Promise.resolve().then(() => {
      chunkCbs.forEach(cb => cb({ questionId, accumulatedText: "Mock answer in progress" }));
    });
    await new Promise(resolve => setTimeout(resolve, 4_000));
    const answer = { openingLine: "Mock opening", bullets: ["b1"], keywords: ["k1"] };
    completeCbs.forEach(cb => cb({ questionId, answer }));
  });

  return {
    generateAnswer,
    cancelAnswer: vi.fn(async () => {}),
    onChunk: vi.fn((cb: ChunkCb) => { chunkCbs.add(cb); return () => { chunkCbs.delete(cb); }; }),
    onComplete: vi.fn((cb: CompleteCb) => { completeCbs.add(cb); return () => { completeCbs.delete(cb); }; }),
    onError: vi.fn((cb: ErrorCb) => { errorCbs.add(cb); return () => { errorCbs.delete(cb); }; })
  };
}

// ---------------------------------------------------------------------------
// Helper: build a full mock copilotWindow with stt + answer
// ---------------------------------------------------------------------------
function makeMockCopilotWindow(onPartial: (cb: (text: string) => void) => void) {
  return {
    hide: vi.fn(),
    getDesktopSourceId: vi.fn(),
    stt: {
      startSession: vi.fn().mockResolvedValue(undefined),
      sendAudioFrame: vi.fn(),
      stopSession: vi.fn().mockResolvedValue(undefined),
      getConfig: vi.fn().mockResolvedValue({ provider: "deepgram", isRealSttAvailable: true, mockMode: false }),
      onPartial: (cb: (text: string) => void) => {
        onPartial(cb);
        return () => {};
      },
      onFinal: () => () => {},
      onError: () => () => {}
    },
    answer: makeMockAnswerBridge()
  };
}

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
    window.copilotWindow = makeMockCopilotWindow(cb => { partialCb = cb; });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen|bắt đầu/i }));

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
    window.copilotWindow = makeMockCopilotWindow(cb => { partialCb = cb; });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen|bắt đầu/i }));

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
    window.copilotWindow = makeMockCopilotWindow(cb => { partialCb = cb; });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen|bắt đầu/i }));

    act(() => {
      partialCb?.("Theo em nếu website giảm 40% traffic thì kiểm tra gì?");
    });

    fireEvent.click(screen.getByRole("button", { name: /answer now|trả lời ngay/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(useCopilotStore.getState().history).toHaveLength(1);
    expect(useCopilotStore.getState().history[0].rawTranscript).toBe("Theo em nếu website giảm 40% traffic thì kiểm tra gì?");
  });

  it("isolates two genuinely separate questions into two distinct history items", async () => {
    let partialCb: ((text: string) => void) | undefined;
    window.copilotWindow = makeMockCopilotWindow(cb => { partialCb = cb; });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen|bắt đầu/i }));

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

  it("REGRESSION TEST: preserves rawTranscript and correctedTranscript independently across multi-turn answer streaming", async () => {
    let partialCb: ((text: string) => void) | undefined;
    window.copilotWindow = makeMockCopilotWindow(cb => { partialCb = cb; });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /listen|bắt đầu/i }));

    // Q1
    act(() => {
      partialCb?.("Em giới thiệu dự án SEO gần nhất?");
    });
    // Trigger Q1 finalization and start answer streaming
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3050);
    });

    expect(useCopilotStore.getState().status).toBe("Answering");

    // While Q1 is answering, STT produces raw speech for Q2 containing "nhận sai"
    act(() => {
      partialCb?.("Em nói cho anh từ lúc nhận sai đến lúc keyword lên như thế nào?");
    });

    // Wait for Q1 answer to complete + Q2 candidate pause (~1200ms) + grace window (~1800ms) + Q2 answer commit (~5000ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    const history = useCopilotStore.getState().history;
    expect(history.length).toBeGreaterThanOrEqual(2);

    const q2 = history[0];
    expect(q2.rawTranscript).toBe("Em nói cho anh từ lúc nhận sai đến lúc keyword lên như thế nào?");
    expect(q2.correctedTranscript).toBe("Em nói cho anh từ lúc nhận sai đến lúc keyword lên như thế nào?");
  });
});
