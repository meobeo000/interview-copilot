import { EyeOff, History, Pause, Play, RefreshCw } from "lucide-react";
import { AnswerPanel } from "./components/AnswerPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { QuestionPanel } from "./components/QuestionPanel";
import { StatusPill } from "./components/StatusPill";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { useCopilotStore } from "./store/useCopilotStore";

export function App() {
  const {
    status,
    liveTranscript,
    rawQuestion,
    cleanedQuestion,
    detectedTopic,
    questionConfidence,
    answer,
    history,
    error,
    startListening,
    pause,
    regenerateAnswer,
    hideOverlay
  } = useCopilotStore();

  const isListening = status === "Listening";
  const canRegenerate = Boolean(cleanedQuestion) && status !== "Answering";

  return (
    <main className="overlay-shell">
      <header className="titlebar">
        <div>
          <span className="eyebrow">Vietnamese SEO Interview Copilot</span>
          <h1>Live Assist</h1>
        </div>
        <div className="window-actions">
          <StatusPill status={status} />
          <button className="icon-button" type="button" onClick={hideOverlay} aria-label="Hide overlay" title="Hide overlay">
            <EyeOff size={18} />
          </button>
        </div>
      </header>

      <nav className="toolbar" aria-label="Interview controls">
        <button type="button" className="primary-action" onClick={isListening ? pause : startListening}>
          {isListening ? <Pause size={18} /> : <Play size={18} />}
          <span>{isListening ? "Pause" : "Listen"}</span>
        </button>
        <button type="button" onClick={() => void regenerateAnswer()} disabled={!canRegenerate}>
          <RefreshCw size={17} />
          <span>Regenerate</span>
        </button>
        <div className="history-count" title="Saved Q&A history">
          <History size={17} />
          <span>{history.length}/5</span>
        </div>
      </nav>

      {error ? <div className="error-banner">{error}</div> : null}

      <TranscriptPanel transcript={liveTranscript} />
      <QuestionPanel
        rawQuestion={rawQuestion}
        cleanedQuestion={cleanedQuestion}
        topic={detectedTopic}
        confidence={questionConfidence}
      />
      <AnswerPanel answer={answer} />
      <HistoryPanel items={history} />
    </main>
  );
}
