import { useEffect } from "react";
import { EyeOff, History, Pause, Play, RefreshCw, Zap } from "lucide-react";
import { AnswerPanel } from "./components/AnswerPanel";
import { AudioMeter } from "./components/AudioMeter";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { QuestionPanel } from "./components/QuestionPanel";
import { StatusPill } from "./components/StatusPill";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { useCopilotStore } from "./store/useCopilotStore";

export function App() {
  const {
    status,
    audioLevel,
    liveTranscript,
    rawQuestion,
    cleanedQuestion,
    answer,
    history,
    isHistoryOpen,
    error,
    startListening,
    pause,
    finalizeQuestionNow,
    toggleHistoryDrawer,
    setHistoryOpen,
    regenerateAnswer,
    hideOverlay
  } = useCopilotStore();

  const isListeningState =
    status === "Listening" || status === "PossibleEnd" || status === "FinalizingQuestion";

  const canRegenerate = Boolean(cleanedQuestion || rawQuestion) && status !== "Answering";

  useEffect(() => {
    const unsub = window.copilotWindow?.onAnswerNow?.(() => {
      finalizeQuestionNow();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        finalizeQuestionNow();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unsub?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [finalizeQuestionNow]);

  return (
    <main className="overlay-shell">
      <header className="titlebar">
        <div className="brand">
          <span className="eyebrow">Interview Copilot</span>
          <span className="subtitle">Trợ lý phỏng vấn SEO</span>
        </div>
        <div className="window-actions">
          <AudioMeter level={audioLevel} active={isListeningState} error={error} />
          <StatusPill status={status} />
          <button
            className="icon-button"
            type="button"
            onClick={hideOverlay}
            aria-label="Hide overlay"
            title="Ẩn cửa sổ (Alt+Space)"
          >
            <EyeOff size={18} />
          </button>
        </div>
      </header>

      <nav className="toolbar" aria-label="Điều khiển phỏng vấn">
        <button
          type="button"
          className="primary-action"
          onClick={isListeningState ? pause : startListening}
          aria-label="Listen"
        >
          {isListeningState ? <Pause size={18} /> : <Play size={18} />}
          <span>{isListeningState ? "Dừng nghe" : "Bắt đầu nghe"}</span>
        </button>

        <button
          type="button"
          className="accent-action"
          onClick={finalizeQuestionNow}
          disabled={!liveTranscript.trim() || status === "Answering"}
          aria-label="Answer Now"
          title="Chốt câu hỏi và trả lời ngay (Alt+Enter)"
        >
          <Zap size={16} />
          <span>Trả lời ngay</span>
        </button>

        <button
          type="button"
          onClick={() => void regenerateAnswer()}
          disabled={!canRegenerate}
          aria-label="Regenerate"
          title="Tạo lại câu trả lời"
        >
          <RefreshCw size={16} />
          <span>Tạo lại</span>
        </button>

        <button
          type="button"
          className="history-button"
          onClick={toggleHistoryDrawer}
          aria-label="History"
          title="Xem lịch sử câu hỏi"
        >
          <History size={16} />
          <span>Lịch sử ({history.length})</span>
        </button>
      </nav>

      {error ? (
        <div className="error-banner">
          <div className="error-text">
            <strong>Không thể tạo câu trả lời.</strong>
            <span className="error-detail">{error}</span>
          </div>
          <button
            type="button"
            className="retry-button"
            onClick={() => void regenerateAnswer()}
            disabled={!canRegenerate}
          >
            Thử lại
          </button>
        </div>
      ) : null}

      <div className="main-layout">
        <div className="left-column">
          <QuestionPanel
            rawQuestion={rawQuestion}
            cleanedQuestion={cleanedQuestion}
          />
          <TranscriptPanel
            transcript={liveTranscript}
            isListening={isListeningState}
          />
        </div>

        <div className="right-column">
          <AnswerPanel answer={answer} isAnswering={status === "Answering"} />
        </div>
      </div>

      <HistoryDrawer
        isOpen={isHistoryOpen}
        history={history}
        onClose={() => setHistoryOpen(false)}
      />
    </main>
  );
}
