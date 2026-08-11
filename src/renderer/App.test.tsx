import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockQuestionDetector } from "../question-detector/mockQuestionDetector";
import type { ConversationItem } from "../shared/types";
import { App } from "./App";
import { useCopilotStore } from "./store/useCopilotStore";

describe("App mocked interview flow", () => {
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

  it("transitions Listening -> Processing -> Answering -> Idle and keeps cleaned question visible during Answering state", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
    vi.spyOn(MockQuestionDetector.prototype, "analyze").mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        isQuestion: true,
        confidence: 0.93,
        cleanedQuestion:
          "Nếu website giảm organic traffic sau Core Update, có dấu hiệu mất referring domain, canonical/301 sai và lỗi indexing, bạn sẽ ưu tiên kiểm tra và xử lý thế nào?",
        topic: "Technical SEO / Core Update recovery"
      };
    });

    render(<App />);

    expect(screen.getByText("Idle")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));
    expect(screen.getByText("Listening")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(screen.getByText(/Theo em/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });

    expect(screen.getByText("Processing")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });

    expect(screen.getByText("Answering")).toBeInTheDocument();
    expect(screen.getByText(/Nếu website giảm organic traffic sau Core Update/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.getByText("Idle")).toBeInTheDocument();
    expect(screen.getByText("1/5")).toBeInTheDocument();
  });

  it("caps history to five when creating six completed Q&A items, persisting only latest 5 to localStorage", async () => {
    let uuidCounter = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`
    );

    render(<App />);

    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole("button", { name: /listen/i }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(25_000);
      });
    }

    expect(screen.getByText("5/5")).toBeInTheDocument();

    const savedRaw = window.localStorage.getItem("interview-copilot.history.v1");
    expect(savedRaw).not.toBeNull();
    const saved = JSON.parse(savedRaw!) as ConversationItem[];

    expect(saved).toHaveLength(5);
    expect(saved.map((item) => item.id)).toEqual([
      "00000000-0000-4000-8000-000000000006",
      "00000000-0000-4000-8000-000000000005",
      "00000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000002"
    ]);
  });

  it("updates the existing conversation item on regenerate without creating duplicate history rows", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000099");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });

    expect(screen.getByText("1/5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.getByText("1/5")).toBeInTheDocument();
    const saved = JSON.parse(window.localStorage.getItem("interview-copilot.history.v1") ?? "[]") as ConversationItem[];
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe("00000000-0000-4000-8000-000000000099");
  });

  it("transitions to Idle state on low question confidence without leaving fake Listening state", async () => {
    vi.spyOn(MockQuestionDetector.prototype, "analyze").mockResolvedValueOnce({
      isQuestion: false,
      confidence: 0.35,
      reason: "Low confidence test"
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));
    expect(screen.getByText("Listening")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(screen.getByText("Idle")).toBeInTheDocument();
    expect(screen.getByText("Low confidence test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /listen/i })).toBeInTheDocument();
  });
});
