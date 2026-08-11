import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../shared/types";
import { App } from "./App";
import { useCopilotStore } from "./store/useCopilotStore";

describe("App Phase 3B interview flow", () => {
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

  it("finalizes question immediately on Answer Now button click", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));
    expect(screen.getByText("Listening")).toBeInTheDocument();

    act(() => {
      useCopilotStore.setState({ liveTranscript: "Theo em backlink hiện tại có còn quan trọng không?" });
    });

    const answerNowButton = screen.getByRole("button", { name: /answer now/i });
    expect(answerNowButton).not.toBeDisabled();

    fireEvent.click(answerNowButton);

    expect(screen.getByText(/Answering|Finalizing question/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.getAllByText("Theo em backlink hiện tại có còn quan trọng không?").length).toBeGreaterThanOrEqual(1);
  });

  it("opens History drawer without stopping Listening state", async () => {
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

    // History drawer opens and displays history item
    expect(screen.getAllByText("History (1)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Đánh giá backlink ntn?")).toBeInTheDocument();

    // App remains in Listening state in background!
    expect(useCopilotStore.getState().status).toBe("Listening");
  });

  it("uses dominant mode layout when listening and switches to Q&A layout on finalized question", () => {
    const { container } = render(<App />);
    const mainShell = container.querySelector("main");

    expect(mainShell).toHaveClass("mode-listening-dominant");

    act(() => {
      useCopilotStore.setState({
        rawQuestion: "Hỏi về Core Update",
        cleanedQuestion: "Hỏi về Core Update"
      });
    });

    expect(mainShell).toHaveClass("mode-qna");
  });

  it("caps history to 5 items when creating 6 items", async () => {
    render(<App />);

    for (let i = 0; i < 6; i++) {
      act(() => {
        useCopilotStore.setState({ status: "Listening", liveTranscript: `Câu hỏi số ${i + 1} về SEO?` });
      });
      fireEvent.click(screen.getByRole("button", { name: /answer now/i }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
    }

    expect(screen.getByText("History (5)")).toBeInTheDocument();

    const savedRaw = window.localStorage.getItem("interview-copilot.history.v1");
    expect(savedRaw).not.toBeNull();
    const saved = JSON.parse(savedRaw!) as ConversationItem[];
    expect(saved).toHaveLength(5);
  });
});
