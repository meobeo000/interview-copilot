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
function makeMockCopilotWindow(
  onPartial: (cb: (text: string) => void) => void,
  onSpeechFinal: (cb: (text?: string) => void) => void = () => {}
) {
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
      onSpeechFinal: (cb: (text?: string) => void) => {
        onSpeechFinal(cb);
        return () => {};
      },
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

  it("commits immediately on provider speech_final and preserves accumulated intent evidence", () => {
    let partialCb: ((text: string) => void) | undefined;
    let speechFinalCb: ((text?: string) => void) | undefined;
    window.copilotWindow = makeMockCopilotWindow(
      (cb) => { partialCb = cb; },
      (cb) => { speechFinalCb = cb; }
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /listen|bắt đầu/i }));

    act(() => {
      partialCb?.("20 triệu");
      partialCb?.("20 triệu em phân bổ content");
      partialCb?.("20 triệu em phân bổ content Entity Guest Post PBN");
      speechFinalCb?.("20 triệu em phân bổ content Entity Guest Post PBN thế nào");
    });

    const state = useCopilotStore.getState();
    expect(state.status).toBe("Answering");
    expect(state.cleanedQuestion).toContain("20 triệu em phân bổ content Entity Guest Post PBN thế nào");
    expect(state.detectedTopic).toBe("BUDGET_ALLOCATION");

    act(() => {
      vi.advanceTimersByTime(1_799);
    });
    expect(useCopilotStore.getState().cleanedQuestion).toContain("20 triệu em phân bổ");
  });

  it("does not commit chatter or double-commit speech_final followed by UtteranceEnd", async () => {
    let partialCb: ((text: string) => void) | undefined;
    let speechFinalCb: ((text?: string) => void) | undefined;
    const mockWindow = makeMockCopilotWindow(
      (cb) => { partialCb = cb; },
      (cb) => { speechFinalCb = cb; }
    );
    window.copilotWindow = mockWindow;

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /listen|bắt đầu/i }));

    act(() => {
      partialCb?.("alo em nghe rõ không");
      speechFinalCb?.("alo em nghe rõ không");
      speechFinalCb?.("alo em nghe rõ không");
    });
    expect(useCopilotStore.getState().cleanedQuestion).toBe("");
    expect(mockWindow.answer?.generateAnswer).not.toHaveBeenCalled();

    act(() => {
      partialCb?.("20 triệu phân bổ content Entity Guest Post PBN thế nào");
      speechFinalCb?.("20 triệu phân bổ content Entity Guest Post PBN thế nào");
      speechFinalCb?.("20 triệu phân bổ content Entity Guest Post PBN thế nào");
    });
    expect(mockWindow.answer?.generateAnswer).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(useCopilotStore.getState().history).toHaveLength(1);
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

describe("Phase 2: Live Interview HUD Controls & Keyboard Shortcuts", () => {
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
      compactMode: false,
      isPinned: true,
      opacityLevel: 1.0,
      isClickThrough: false,
      activeHistoryIndex: null,
      sessionStartTime: 10000,
      answer: {
        openingLine: "Đây là câu mở đầu chi tiết về chiến lược SEO iGaming.",
        bullets: ["Ý 1: Xây dựng nền tảng technical và audit crawl budget.", "Ý 2: Triển khai content silo và internal link.", "Ý 3: Phân bổ ngân sách PBN an toàn."],
        keywords: ["SEO", "PBN"]
      },
      history: [
        {
          id: "turn-1",
          turnId: "turn-1",
          startedAt: 1000,
          rawTranscript: "Turn 1: PBN là gì?",
          cleanedQuestion: "PBN là gì?",
          answer: { openingLine: "PBN là mạng blog vệ tinh cá nhân.", bullets: ["B1"], keywords: [] }
        },
        {
          id: "turn-2",
          turnId: "turn-2",
          startedAt: 2000,
          rawTranscript: "Turn 2: Tiêu chí săn domain?",
          cleanedQuestion: "Tiêu chí săn domain?",
          answer: { openingLine: "Kiểm tra Wayback và anchor text.", bullets: ["B2"], keywords: [] }
        }
      ],
      isHistoryOpen: false,
      error: undefined
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("toggles compact mode via button and shortcut Alt+C", () => {
    render(<App />);

    expect(useCopilotStore.getState().compactMode).toBe(false);

    // Click compact toggle button
    const compactBtn = screen.getByTitle(/Thu gọn HUD/i);
    fireEvent.click(compactBtn);
    expect(useCopilotStore.getState().compactMode).toBe(true);

    // Alt+C shortcut to toggle back
    fireEvent.keyDown(window, { altKey: true, key: "c" });
    expect(useCopilotStore.getState().compactMode).toBe(false);
  });

  it("condenses answer into shorter format via Ngắn hơn button and Alt+S", () => {
    render(<App />);

    const shorterBtn = screen.getByTitle(/Rút ngắn câu trả lời/i);
    fireEvent.click(shorterBtn);

    const answer = useCopilotStore.getState().answer;
    expect(answer.bullets.length).toBeLessThanOrEqual(2);
    expect(answer.bullets[0]).toContain("Ý 1: Xây dựng nền tảng technical");
  });

  it("clears current turn via Xóa button and Alt+X", () => {
    useCopilotStore.setState({
      rawQuestion: "Câu hỏi nháp",
      cleanedQuestion: "Câu hỏi nháp",
      liveTranscript: "Đang nghe dở dang..."
    });

    render(<App />);

    const clearBtn = screen.getByTitle(/Xóa câu hỏi hiện tại/i);
    fireEvent.click(clearBtn);

    expect(useCopilotStore.getState().cleanedQuestion).toBe("");
    expect(useCopilotStore.getState().liveTranscript).toBe("");
  });

  it("navigates previous and next turns in history directly inside HUD", () => {
    render(<App />);

    // Click prev turn
    const prevBtn = screen.getByLabelText("Lượt trước");
    fireEvent.click(prevBtn);

    expect(useCopilotStore.getState().activeHistoryIndex).toBe(0);
    expect(screen.getByText("Turn 2/2")).toBeInTheDocument();

    // Step further back
    fireEvent.click(prevBtn);
    expect(useCopilotStore.getState().activeHistoryIndex).toBe(1);
    expect(screen.getByText("Turn 1/2")).toBeInTheDocument();

    // Step forward back to live
    const nextBtn = screen.getByLabelText("Lượt sau");
    fireEvent.click(nextBtn);
    expect(useCopilotStore.getState().activeHistoryIndex).toBe(0);

    fireEvent.click(nextBtn);
    expect(useCopilotStore.getState().activeHistoryIndex).toBe(null);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });
});

