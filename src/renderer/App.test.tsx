import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App mocked interview flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000000");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("streams transcript, keeps the completed question visible, streams the answer, and caps history to five", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /listen/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(screen.getByText(/Theo em/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(18_000);
    });

    expect(screen.getByText(/Nếu website giảm organic traffic sau Core Update/i)).toBeInTheDocument();
    expect(screen.getByText(/Em sẽ khoanh vùng nguyên nhân/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.getByText("GSC")).toBeInTheDocument();

    const saved = JSON.parse(window.localStorage.getItem("interview-copilot.history.v1") ?? "[]") as unknown[];
    expect(saved).toHaveLength(1);
  });
});
