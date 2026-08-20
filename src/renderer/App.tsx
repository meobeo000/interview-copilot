import { useEffect, useState } from "react";
import {
  Briefcase,
  Clock,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  History,
  Maximize2,
  Minimize2,
  MousePointerClick,
  Pause,
  Pin,
  PinOff,
  Play,
  Percent,
  RefreshCw,
  Scissors,
  Shield,
  ShieldCheck,
  User,
  XCircle,
  Zap
} from "lucide-react";
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

function formatElapsedTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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
    compactMode,
    isPinned,
    opacityLevel,
    isClickThrough,
    activeHistoryIndex,
    sessionStartTime,
    isContentProtected,
    error,
    startListening,
    pause,
    finalizeQuestionNow,
    toggleHistoryDrawer,
    setHistoryOpen,
    setProfileOpen,
    setSessionDrawerOpen,
    toggleCompactMode,
    togglePin,
    setOpacityLevel,
    toggleClickThrough,
    navigateHistory,
    makeAnswerShorter,
    makeAnswerMoreTechnical,
    explainAnswerWhy,
    giveAnswerExample,
    defendAnswer,
    clearCurrentTurn,
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

  const [elapsedSecs, setElapsedSecs] = useState<number>(0);

  // Session stopwatch timer
  useEffect(() => {
    const isListening = status === "Listening" || status === "PossibleEnd" || status === "FinalizingQuestion" || status === "Answering";
    let timer: number | undefined;

    if (isListening || sessionStartTime) {
      timer = window.setInterval(() => {
        if (sessionStartTime) {
          const diff = Math.max(0, Math.floor((Date.now() - sessionStartTime) / 1000));
          setElapsedSecs(diff);
        } else {
          setElapsedSecs((prev) => prev + 1);
        }
      }, 1000);
    }

    return () => {
      if (timer !== undefined) clearInterval(timer);
    };
  }, [status, sessionStartTime]);

  const isListeningState =
    status === "Listening" || status === "PossibleEnd" || status === "FinalizingQuestion";

  // Selected display turn: either from past history navigation or active live state
  const displayedHistoryItem =
    activeHistoryIndex !== null && history[activeHistoryIndex]
      ? history[activeHistoryIndex]
      : null;

  const displayQuestion = displayedHistoryItem
    ? displayedHistoryItem.cleanedQuestion || displayedHistoryItem.rawTranscript
    : cleanedQuestion || rawQuestion;

  const displayAnswer = displayedHistoryItem?.answer || answer;

  const canRegenerate = Boolean(displayQuestion) && status !== "Answering";
  const canMakeShorter = Boolean(displayAnswer.bullets && displayAnswer.bullets.length > 0);
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
      // Keyboard shortcuts
      if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        finalizeQuestionNow();
      } else if (e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        if (canRegenerate) void regenerateAnswer();
      } else if (e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (canMakeShorter) void makeAnswerShorter();
      } else if (e.altKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        toggleCompactMode();
      } else if (e.altKey && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        clearCurrentTurn();
      } else if (e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        void togglePin();
      } else if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        navigateHistory("prev");
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        navigateHistory("next");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unsub?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    finalizeQuestionNow,
    regenerateAnswer,
    makeAnswerShorter,
    toggleCompactMode,
    clearCurrentTurn,
    togglePin,
    navigateHistory,
    canRegenerate,
    canMakeShorter
  ]);

  const cycleOpacity = () => {
    if (opacityLevel >= 0.95) void setOpacityLevel(0.85);
    else if (opacityLevel >= 0.8) void setOpacityLevel(0.70);
    else void setOpacityLevel(1.0);
  };

  return (
    <main className={`overlay-shell ${compactMode ? "compact-overlay" : ""}`} style={{ opacity: opacityLevel }}>
      {/* Titlebar Header */}
      <header className="titlebar">
        <div className="brand">
          <span className="eyebrow">Interview Copilot</span>
          <span className="subtitle">{activeSession.company || "Live HUD"}</span>
        </div>

        <div className="window-actions">
          {/* Session Timer */}
          <div className="session-timer-badge" title="Thời gian phiên phỏng vấn">
            <Clock size={12} />
            <span>{formatElapsedTimer(elapsedSecs)}</span>
          </div>

          <AudioMeter level={audioLevel} active={isListeningState} error={error} />
          <StatusPill status={status} />

          {/* Opacity Control */}
          <button
            className="icon-button"
            type="button"
            onClick={cycleOpacity}
            aria-label="Độ trong suốt"
            title={`Độ mờ: ${Math.round(opacityLevel * 100)}% (Click để đổi 100% / 85% / 70%)`}
          >
            <Percent size={15} />
          </button>

          {/* Pin Window */}
          <button
            className="icon-button"
            type="button"
            onClick={() => void togglePin()}
            aria-label="Ghim trên cùng"
            title={isPinned ? "Đang ghim cửa sổ trên cùng (Alt+P)" : "Bỏ ghim (Alt+P)"}
            style={{ color: isPinned ? "#38bdf8" : "#94a3b8" }}
          >
            {isPinned ? <Pin size={16} /> : <PinOff size={16} />}
          </button>

          {/* Click-through toggle */}
          <button
            className="icon-button"
            type="button"
            onClick={() => void toggleClickThrough()}
            aria-label="Click-through"
            title={isClickThrough ? "Click xuyên qua (Đang bật)" : "Click xuyên qua (Đang tắt)"}
            style={{ color: isClickThrough ? "#a855f7" : "#94a3b8" }}
          >
            <MousePointerClick size={16} />
          </button>

          {/* Screen-share stealth protection */}
          <button
            className="icon-button"
            type="button"
            onClick={() => void toggleContentProtection()}
            aria-label="Tàng hình khi Share Screen"
            title={isContentProtected ? "Đang bật tàng hình khi Share Screen (Zoom/Meet không thấy tool)" : "Tắt tàng hình khi Share Screen"}
            style={{ color: isContentProtected ? "#22c55e" : "#94a3b8" }}
          >
            {isContentProtected ? <ShieldCheck size={16} /> : <Shield size={16} />}
          </button>

          {/* Compact mode toggle */}
          <button
            className="icon-button"
            type="button"
            onClick={toggleCompactMode}
            aria-label="Chế độ thu gọn"
            title={compactMode ? "Mở rộng giao diện (Alt+C)" : "Thu gọn HUD nhỏ gọn (Alt+C)"}
          >
            {compactMode ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>

          {/* Hide overlay */}
          <button
            className="icon-button"
            type="button"
            onClick={hideOverlay}
            aria-label="Ẩn cửa sổ"
            title="Ẩn cửa sổ (Alt+Space)"
          >
            <EyeOff size={16} />
          </button>
        </div>
      </header>

      {/* Main HUD Toolbar */}
      <nav className="toolbar" aria-label="Điều khiển phỏng vấn">
        <button
          type="button"
          className="primary-action"
          onClick={isListeningState ? pause : startListening}
          aria-label="Bắt đầu hoặc dừng nghe"
        >
          {isListeningState ? <Pause size={16} /> : <Play size={16} />}
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
          <span>Trả lời</span>
        </button>

        <button
          type="button"
          onClick={() => void regenerateAnswer()}
          disabled={!canRegenerate}
          aria-label="Tạo lại câu trả lời"
          title="Tạo lại câu trả lời (Alt+R)"
        >
          <RefreshCw size={15} />
          <span>Tạo lại</span>
        </button>

        <button
          type="button"
          onClick={() => void makeAnswerShorter()}
          disabled={!canMakeShorter}
          aria-label="Rút ngắn câu trả lời"
          title="Rút ngắn câu trả lời (Alt+S)"
        >
          <Scissors size={15} />
          <span>Ngắn hơn</span>
        </button>

        <button
          type="button"
          onClick={clearCurrentTurn}
          aria-label="Xóa câu hỏi hiện tại"
          title="Xóa câu hỏi hiện tại (Alt+X)"
        >
          <XCircle size={15} />
          <span>Xóa</span>
        </button>

        {/* Turn Navigation: Previous / Next Turn (< >) */}
        {history.length > 0 && (
          <div className="turn-stepper" title="Chuyển đổi giữa các lượt câu hỏi (Alt+Mũi tên trái/phải)">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => navigateHistory("prev")}
              disabled={activeHistoryIndex !== null && activeHistoryIndex >= history.length - 1}
              aria-label="Lượt trước"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="stepper-label">
              {activeHistoryIndex === null ? "Live" : `Turn ${history.length - activeHistoryIndex}/${history.length}`}
            </span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => navigateHistory("next")}
              disabled={activeHistoryIndex === null}
              aria-label="Lượt sau"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <button
          type="button"
          className="history-button"
          onClick={() => setSessionDrawerOpen(true)}
          aria-label="Cấu hình phiên phỏng vấn"
          title={`Phiên: ${activeSession.name} (${activeSession.company})`}
        >
          <Briefcase size={15} />
          <span>Phiên</span>
        </button>

        <button
          type="button"
          className="history-button"
          onClick={() => setProfileOpen(true)}
          aria-label="Hồ sơ dự án thật"
          title="Xem & sửa hồ sơ kinh nghiệm"
        >
          <User size={15} />
          <span>Hồ sơ</span>
        </button>

        <button
          type="button"
          className="history-button"
          onClick={toggleHistoryDrawer}
          aria-label="Mở lịch sử"
          title="Xem lịch sử câu hỏi"
        >
          <History size={15} />
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
            🧪 Test
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

      {/* Main HUD Body: 2-Column Standard or 1-Column Compact */}
      {compactMode ? (
        <div className="compact-hud-wrapper">
          <div className="compact-question-card">
            <div style={{ fontSize: "11px", color: "#38bdf8", fontWeight: "600", textTransform: "uppercase", marginBottom: "4px" }}>
              {displayedHistoryItem ? "Câu hỏi đã lưu" : "Câu hỏi đang nghe"}
            </div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#f8fafc" }}>
              {displayQuestion || (isListeningState ? "Đang lắng nghe câu hỏi..." : "Sẵn sàng — nhấn Bắt đầu nghe")}
            </div>
          </div>
          <div className="compact-answer-card">
            <AnswerPanel
              answer={displayAnswer}
              isAnswering={status === "Answering"}
              onShorter={() => void makeAnswerShorter()}
              onTechnical={() => void makeAnswerMoreTechnical()}
              onExplainWhy={() => void explainAnswerWhy()}
              onGiveExample={() => void giveAnswerExample()}
              onDefend={() => void defendAnswer()}
            />
          </div>
        </div>
      ) : (
        <div className="main-layout">
          <div className="left-column">
            <QuestionPanel
              rawQuestion={displayedHistoryItem ? displayedHistoryItem.rawTranscript : rawQuestion}
              cleanedQuestion={displayedHistoryItem ? (displayedHistoryItem.cleanedQuestion || displayedHistoryItem.rawTranscript) : cleanedQuestion}
            />
            <TranscriptPanel
              transcript={displayedHistoryItem ? displayedHistoryItem.rawTranscript : liveTranscript}
              isListening={isListeningState}
            />
          </div>

          <div className="right-column">
            <AnswerPanel
              answer={displayAnswer}
              isAnswering={status === "Answering"}
              onShorter={() => void makeAnswerShorter()}
              onTechnical={() => void makeAnswerMoreTechnical()}
              onExplainWhy={() => void explainAnswerWhy()}
              onGiveExample={() => void giveAnswerExample()}
              onDefend={() => void defendAnswer()}
            />
          </div>
        </div>
      )}

      {/* Drawers */}
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
