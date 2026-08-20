import { useEffect } from "react";
import { Briefcase, EyeOff, History, Pause, Play, RefreshCw, Shield, ShieldCheck, User, Zap } from "lucide-react";
import { AnswerPanel } from "./components/AnswerPanel";
import { AudioMeter } from "./components/AudioMeter";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { ProfileDrawer } from "./components/ProfileDrawer";
import { SessionDrawer } from "./components/SessionDrawer";
import { QuestionPanel } from "./components/QuestionPanel";
import { StatusPill } from "./components/StatusPill";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { useCopilotStore } from "./store/useCopilotStore";

function getUserFacingErrorMessage(error?: string): { title: string; detail: string } {
  if (!error) {
    return { title: "Không thể tạo câu trả lời.", detail: "Vui lòng thử lại." };
  }
  const lower = error.toLowerCase();
  if (
    lower.includes("api_key") ||
    lower.includes("gemini_api_key") ||
    lower.includes("groq_api_key") ||
    lower.includes("missing") ||
    lower.includes("chưa cấu hình")
  ) {
    return {
      title: "Không thể tạo câu trả lời.",
      detail: "Chưa cấu hình dịch vụ AI."
    };
  }
  return {
    title: "Không thể tạo câu trả lời.",
    detail: "Vui lòng thử lại."
  };
}

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
    candidateProfile,
    isProfileOpen,
    sessions,
    activeSession,
    isSessionDrawerOpen,
    isContentProtected,
    error,
    startListening,
    pause,
    finalizeQuestionNow,
    toggleHistoryDrawer,
    setHistoryOpen,
    setProfileOpen,
    setSessionDrawerOpen,
    updateProfile,
    createSession,
    saveSession,
    duplicateSession,
    deleteSession,
    startSession,
    toggleContentProtection,
    regenerateAnswer,
    triggerDevDirectQuestion,
    hideOverlay
  } = useCopilotStore();

  const isListeningState =
    status === "Listening" || status === "PossibleEnd" || status === "FinalizingQuestion";

  const canRegenerate = Boolean(cleanedQuestion || rawQuestion) && status !== "Answering";
  const userError = error ? getUserFacingErrorMessage(error) : null;

  useEffect(() => {
    if (error) {
      console.error("[Copilot Error Diagnostic]:", error);
    }
  }, [error]);

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
          <button
            className="icon-button"
            type="button"
            onClick={() => void toggleContentProtection()}
            aria-label="Tàng hình khi Share Screen"
            title={isContentProtected ? "Đang bật tàng hình khi Share Screen (Zoom/Meet không thấy tool)" : "Tắt tàng hình khi Share Screen"}
            style={{ color: isContentProtected ? "#22c55e" : "#94a3b8" }}
          >
            {isContentProtected ? <ShieldCheck size={18} /> : <Shield size={18} />}
          </button>
          <AudioMeter level={audioLevel} active={isListeningState} error={error} />
          <StatusPill status={status} />
          <button
            className="icon-button"
            type="button"
            onClick={hideOverlay}
            aria-label="Ẩn cửa sổ"
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
          aria-label="Bắt đầu hoặc dừng nghe"
        >
          {isListeningState ? <Pause size={18} /> : <Play size={18} />}
          <span>{isListeningState ? "Dừng nghe" : "Bắt đầu nghe"}</span>
        </button>

        <button
          type="button"
          className="accent-action"
          onClick={finalizeQuestionNow}
          disabled={!liveTranscript.trim() || status === "Answering"}
          aria-label="Trả lời ngay"
          title="Chốt câu hỏi và trả lời ngay (Alt+Enter)"
        >
          <Zap size={16} />
          <span>Trả lời ngay</span>
        </button>

        <button
          type="button"
          onClick={() => void regenerateAnswer()}
          disabled={!canRegenerate}
          aria-label="Tạo lại câu trả lời"
          title="Tạo lại câu trả lời"
        >
          <RefreshCw size={16} />
          <span>Tạo lại</span>
        </button>

        <button
          type="button"
          className="history-button"
          onClick={() => setSessionDrawerOpen(true)}
          aria-label="Cấu hình phiên phỏng vấn"
          title={`Phiên hiện tại: ${activeSession.name} (${activeSession.company})`}
        >
          <Briefcase size={16} />
          <span>Phiên ({activeSession.company || "Setup"})</span>
        </button>

        <button
          type="button"
          className="history-button"
          onClick={() => setProfileOpen(true)}
          aria-label="Hồ sơ dự án thật"
          title="Xem & sửa hồ sơ kinh nghiệm / số liệu dự án thật"
        >
          <User size={16} />
          <span>Hồ sơ</span>
        </button>

        <button
          type="button"
          className="history-button"
          onClick={toggleHistoryDrawer}
          aria-label="Mở lịch sử"
          title="Xem lịch sử câu hỏi"
        >
          <History size={16} />
          <span>Lịch sử ({history.length})</span>
        </button>

        {import.meta.env?.DEV || process.env.NODE_ENV !== "production" ? (
          <button
            type="button"
            className="accent-action"
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={() => void triggerDevDirectQuestion()}
            disabled={status === "Answering"}
            aria-label="Direct Gemini Test"
            title="Gửi câu hỏi test trực tiếp qua IPC tới Gemini"
          >
            🧪 Test Gemini
          </button>
        ) : null}
      </nav>

      {userError ? (
        <div className="error-banner">
          <div className="error-text">
            <strong>{userError.title}</strong>
            <span className="error-detail">{userError.detail}</span>
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

      <ProfileDrawer
        isOpen={isProfileOpen}
        profile={candidateProfile}
        onClose={() => setProfileOpen(false)}
        onSave={updateProfile}
      />

      <SessionDrawer
        isOpen={isSessionDrawerOpen}
        sessions={sessions}
        activeSession={activeSession}
        onClose={() => setSessionDrawerOpen(false)}
        onSelectAndStart={startSession}
        onCreateSession={() => createSession()}
        onSaveSession={saveSession}
        onDuplicateSession={duplicateSession}
        onDeleteSession={deleteSession}
      />
    </main>
  );
}
