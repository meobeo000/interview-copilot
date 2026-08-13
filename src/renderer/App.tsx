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
    detectedTopic,
    questionConfidence,
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

  const canRegenerate = Boolean(cleanedQuestion) && status !== "Answering";
  const hasQuestion = Boolean(cleanedQuestion || rawQuestion);

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
    <main className={`overlay-shell ${!hasQuestion ? "mode-listening-dominant" : "mode-qna"}`}>
      <header className="titlebar">
        <div>
          <span className="eyebrow">Vietnamese SEO Interview Copilot</span>
          <h1>Live Assist</h1>
        </div>
        <div className="window-actions">
          <AudioMeter level={audioLevel} active={isListeningState} error={error} />
          <StatusPill status={status} />
          <button
            className="icon-button"
            type="button"
            onClick={hideOverlay}
            aria-label="Hide overlay"
            title="Hide overlay (Alt+Space)"
          >
            <EyeOff size={18} />
          </button>
        </div>
      </header>

      <nav className="toolbar" aria-label="Interview controls">
        <button
          type="button"
          className="primary-action"
          onClick={isListeningState ? pause : startListening}
        >
          {isListeningState ? <Pause size={18} /> : <Play size={18} />}
          <span>{isListeningState ? "Pause" : "Listen"}</span>
        </button>

        <button
          type="button"
          className="accent-action"
          onClick={finalizeQuestionNow}
          disabled={!liveTranscript.trim() || status === "Answering"}
          title="Finalize transcript as question immediately (Alt+Enter)"
        >
          <Zap size={16} />
          <span>Answer Now</span>
        </button>

        <button type="button" onClick={() => void regenerateAnswer()} disabled={!canRegenerate}>
          <RefreshCw size={16} />
          <span>Regenerate</span>
        </button>

        <button
          type="button"
          className="history-button"
          onClick={toggleHistoryDrawer}
          title="View Q&A History"
        >
          <History size={16} />
          <span>History ({history.length})</span>
        </button>
      </nav>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="content-container">
        <TranscriptPanel transcript={liveTranscript} />

        {hasQuestion ? (
          <>
            <QuestionPanel
              rawQuestion={rawQuestion}
              cleanedQuestion={cleanedQuestion}
              topic={detectedTopic}
              confidence={questionConfidence}
            />
            <AnswerPanel answer={answer} isAnswering={status === "Answering"} />
          </>
        ) : null}
      </div>

      <HistoryDrawer
        isOpen={isHistoryOpen}
        history={history}
        onClose={() => setHistoryOpen(false)}
      />
    </main>
  );
}
