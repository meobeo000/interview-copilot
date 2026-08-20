import { create } from "zustand";
import { MockAudioCapture } from "../../audio/mockAudioCapture";
import { SystemAudioCapture } from "../../audio/systemAudioCapture";
import type { AudioCapture, AudioFrame } from "../../audio/types";
import { createAnswerService } from "../../llm/factory.browser";
import type { AnswerDelta } from "../../llm/types";
import type { QuestionIntent, QuestionIntentCategory } from "../../question-detector/intentClassifier";
import { type IntentCandidateEvent, SmartQuestionDetector } from "../../question-detector/smartQuestionDetector";
import { SemanticQuestionReconstructor } from "../../question-detector/semanticQuestionReconstructor";
import { isSpeculativeEnabled } from "../../question-detector/speculativeConfig";
import { SpeculativePrewarmPolicy, type PrewarmEligibilityResult } from "../../question-detector/speculativePrewarmPolicy";
import type { SemanticEvidenceState } from "../../question-detector/semanticEvidence";
import { capHistory } from "../../shared/history";
import { createCommittedTurn } from "../../question-detector/committedTurn";
import {
  calculatePipelineMetrics,
  extractFirstUsefulAnswer,
  formatPipelineMetricsLog,
  logTurnCreated,
  logTurnCommitted,
  logManualAnswerRequested,
  logAnswerAttachedToTurn,
  type PipelineTimestamps
} from "../../shared/telemetry";
import type { AppStatus, ConversationItem, StreamController, SuggestedAnswer } from "../../shared/types";
import { MockTranscriptService } from "../../transcription/mockTranscriptService";
import { RealStreamingSTTService } from "../../transcription/realStreamingSTT";
import type { TranscriptionService } from "../../transcription/types";
import { parseStreamingAnswer } from "../../llm/parseAnswerJson";
import { applyAnswerAction } from "../../llm/factSafety";
import { type CandidateProfile, loadCandidateProfile, saveCandidateProfile } from "../../shared/candidateProfile";
import {
  type SessionConfig,
  DEFAULT_SESSION_CONFIG,
  createDefaultSessionConfig,
  duplicateSessionConfig,
  snapshotSessionConfig,
  loadStoredSessions,
  saveStoredSessions,
  loadStoredActiveSessionId,
  saveStoredActiveSessionId
} from "../../shared/sessionConfig";
import { buildAnswerContract, isContractCompatible, type AnswerContract } from "../../llm/answerContract";
import { buildSafeFallbackAnswer } from "../../llm/fallbackAnswerBuilder";
import {
  InterviewTurnContextManager,
  type InterviewTurnContext
} from "../../question-detector/interviewTurnContext";
import {
  resolveFollowUpContext,
  extractDecisionFromCompletedTurn
} from "../../question-detector/followUpDetector";

const historyKey = "interview-copilot.history.v1";

function emptyAnswer(): SuggestedAnswer {
  return {
    openingLine: "",
    bullets: [],
    keywords: [],
    streamingText: ""
  };
}

function readHistory(): ConversationItem[] {
  try {
    const raw = window.localStorage.getItem(historyKey);
    if (!raw) {
      return [];
    }
    return capHistory(JSON.parse(raw) as ConversationItem[]);
  } catch {
    return [];
  }
}

function writeHistory(items: ConversationItem[]) {
  window.localStorage.setItem(historyKey, JSON.stringify(capHistory(items)));
}

function applyDelta(answer: SuggestedAnswer, delta: AnswerDelta): SuggestedAnswer {
  if (delta.type === "chunk") {
    const parsed = parseStreamingAnswer(delta.accumulatedText);
    return {
      ...answer,
      openingLine: parsed.openingLine || answer.openingLine,
      bullets: parsed.bullets.length > 0 ? parsed.bullets : answer.bullets,
      keywords: parsed.keywords.length > 0 ? parsed.keywords : answer.keywords,
      streamingText: delta.accumulatedText
    };
  }

  if (delta.type === "finalAnswer") {
    return {
      openingLine: delta.answer.openingLine,
      bullets: delta.answer.bullets,
      keywords: delta.answer.keywords,
      confidence: delta.answer.confidence,
      providerStatus: delta.answer.providerStatus || answer.providerStatus,
      answerSource: delta.answer.answerSource || answer.answerSource,
      fallbackReason: delta.answer.fallbackReason || answer.fallbackReason,
      streamingText: undefined
    };
  }

  if (delta.type === "openingLine") {
    return { ...answer, openingLine: delta.value };
  }

  if (delta.type === "bullet") {
    return { ...answer, bullets: [...answer.bullets, delta.value] };
  }

  if (delta.type === "keywords") {
    return { ...answer, keywords: delta.value };
  }

  return { ...answer, confidence: delta.value };
}

function createAudioCapture(): AudioCapture {
  if (typeof window !== "undefined" && typeof window.copilotWindow?.getDesktopSourceId === "function") {
    return new SystemAudioCapture();
  }
  return new MockAudioCapture();
}

function createTranscriptService(): TranscriptionService & {
  sendAudio?: (frame: AudioFrame) => void;
  resetTurn?: () => void;
} {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_USE_MOCK_STT === "true") {
    return new MockTranscriptService();
  }
  return new RealStreamingSTTService();
}

export interface CopilotState {
  status: AppStatus;
  audioLevel: number;
  liveTranscript: string;
  rawQuestion: string;
  cleanedQuestion: string;
  detectedTopic: string;
  questionConfidence?: number;
  intentCandidate?: IntentCandidateEvent;
  answer: SuggestedAnswer;
  history: ConversationItem[];
  isHistoryOpen: boolean;
  candidateProfile: CandidateProfile;
  isProfileOpen: boolean;
  sessions: SessionConfig[];
  activeSession: Readonly<SessionConfig>;
  isSessionDrawerOpen: boolean;
  compactMode: boolean;
  isPinned: boolean;
  opacityLevel: number;
  isClickThrough: boolean;
  activeHistoryIndex: number | null;
  sessionStartTime: number | null;
  isContentProtected: boolean;
  error?: string;
  startListening: () => void;
  pause: () => void;
  finalizeQuestionNow: () => void;
  toggleHistoryDrawer: () => void;
  setHistoryOpen: (open: boolean) => void;
  setProfileOpen: (open: boolean) => void;
  setSessionDrawerOpen: (open: boolean) => void;
  toggleCompactMode: () => void;
  togglePin: () => Promise<void>;
  setOpacityLevel: (opacity: number) => Promise<void>;
  toggleClickThrough: () => Promise<void>;
  navigateHistory: (direction: "prev" | "next" | "live") => void;
  makeAnswerShorter: () => Promise<void>;
  makeAnswerMoreTechnical: () => Promise<void>;
  explainAnswerWhy: () => Promise<void>;
  giveAnswerExample: () => Promise<void>;
  defendAnswer: () => Promise<void>;
  clearCurrentTurn: () => void;
  updateProfile: (profile: CandidateProfile) => void;
  createSession: (partial?: Partial<SessionConfig>) => SessionConfig;
  saveSession: (session: SessionConfig) => void;
  duplicateSession: (sessionId: string) => SessionConfig;
  deleteSession: (sessionId: string) => void;
  startSession: (session: SessionConfig) => void;
  reopenSession: (sessionId: string) => void;
  toggleContentProtection: () => Promise<void>;
  regenerateAnswer: () => Promise<void>;
  generateAnswerForTurn: (turnId: string) => Promise<void>;
  triggerDirectQuestion: (questionText: string) => Promise<void>;
  triggerDevDirectQuestion: (questionText?: string) => Promise<void>;
  hideOverlay: () => Promise<void>;
}

export interface ActiveSpeculativeSession {
  requestId: string;
  turnId?: string;
  intentCategory: QuestionIntentCategory;
  intentConfidence: number;
  normalizedQuestion: string;
  rawTranscript: string;
  startedAt: number;
  abortController: AbortController;
  status: "prewarming" | "streaming" | "completed" | "aborted";
  answer: SuggestedAnswer;
  bufferedText: string;
  contract?: AnswerContract;
  timestamps: PipelineTimestamps;
}

interface SpeculativePrewarmLogPayload {
  turnId?: string;
  intent: string;
  confidence?: number;
  eligible?: boolean;
  reason?: string;
  prewarmStartedAt?: number;
  speechEndedAt?: number;
  leadTimeMs?: number;
  prewarmLeadTimeMs?: number;
  requestId?: string;
  reused?: boolean;
  replaced?: boolean;
  cancelled?: boolean;
  geminiTtftMs?: number;
  speechEndToFirstVisibleAnswerMs?: number;
}

function logSpeculativePrewarmEvent(payload: SpeculativePrewarmLogPayload) {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
    return;
  }

  const lines = ["[SPECULATIVE PREWARM]"];
  if (payload.turnId) lines.push(`turnId: ${payload.turnId}`);
  lines.push(`intent: ${payload.intent}`);
  if (payload.confidence !== undefined) lines.push(`confidence: ${payload.confidence.toFixed(2)}`);
  if (payload.eligible !== undefined) lines.push(`eligible: ${payload.eligible}`);
  if (payload.reason) lines.push(`reason: ${payload.reason}`);

  if (payload.prewarmStartedAt !== undefined) lines.push(`prewarmStartedAt: ${payload.prewarmStartedAt}`);
  if (payload.speechEndedAt !== undefined) lines.push(`speechEndedAt: ${payload.speechEndedAt}`);
  if (payload.leadTimeMs !== undefined) lines.push(`leadTimeMs: ${payload.leadTimeMs} ms`);
  if (payload.prewarmLeadTimeMs !== undefined) lines.push(`prewarmLeadTimeMs: ${payload.prewarmLeadTimeMs} ms`);

  if (payload.requestId) lines.push(`requestId: ${payload.requestId}`);
  if (payload.reused !== undefined) lines.push(`reused: ${payload.reused}`);
  if (payload.replaced !== undefined) lines.push(`replaced: ${payload.replaced}`);
  if (payload.cancelled !== undefined) lines.push(`cancelled: ${payload.cancelled}`);

  if (payload.geminiTtftMs !== undefined) lines.push(`geminiTtftMs: ${payload.geminiTtftMs} ms`);
  if (payload.speechEndToFirstVisibleAnswerMs !== undefined) {
    lines.push(`speechEndToFirstVisibleAnswerMs: ${payload.speechEndToFirstVisibleAnswerMs} ms`);
  }

  console.log(lines.join("\n"));
}

const answerService = createAnswerService();
const audioCapture = createAudioCapture();
const smartDetector = new SmartQuestionDetector();
const semanticReconstructor = new SemanticQuestionReconstructor();
const prewarmPolicy = new SpeculativePrewarmPolicy();
export const turnContextManager = new InterviewTurnContextManager();

let activeTranscriptService:
  | (TranscriptionService & { sendAudio?: (frame: AudioFrame) => void; resetTurn?: () => void })
  | undefined;
let transcriptController: StreamController | undefined;
let activeItem: ConversationItem | undefined;
let activeSpeculative: ActiveSpeculativeSession | undefined;
let graceWindowTimer: number | undefined;
let rawTurnSpeechBuffer = "";
let correctedTurnSpeechBuffer = "";

// Real-time telemetry tracking buffers
let turnSpeechLastActivityAt: number | undefined;
let turnSpeechEndedAt: number | undefined;
let turnLastSttPartialAt: number | undefined;
let turnLastSttFinalAt: number | undefined;
let turnQuestionIntentReadyAt: number | undefined;
let latestIntentCandidate: QuestionIntent | undefined;

function clearGraceWindow() {
  if (graceWindowTimer !== undefined) {
    window.clearTimeout(graceWindowTimer);
    graceWindowTimer = undefined;
  }
}

function resetTurnTelemetry() {
  turnSpeechLastActivityAt = undefined;
  turnSpeechEndedAt = undefined;
  turnLastSttPartialAt = undefined;
  turnLastSttFinalAt = undefined;
  turnQuestionIntentReadyAt = undefined;
  latestIntentCandidate = undefined;
}

export function isSpeculativeSessionReusable(
  session: Pick<ActiveSpeculativeSession, "turnId" | "status" | "intentCategory" | "contract"> | undefined,
  currentTurnId: string,
  finalIntent: QuestionIntentCategory,
  finalContract?: AnswerContract
): boolean {
  if (!isSpeculativeEnabled() || !session || session.status === "aborted") {
    return false;
  }

  if (session.turnId !== currentTurnId) {
    return false;
  }

  if (session.contract && finalContract) {
    const check = isContractCompatible(session.contract, finalContract);
    if (!check.compatible) {
      return false;
    }
  }

  return (
    session.intentCategory === finalIntent ||
    (session.intentCategory !== "UNKNOWN" && (finalIntent === "STRATEGY_PLAN" || finalIntent === "UNKNOWN"))
  );
}

function snapshotSemanticEvidence(state: SemanticEvidenceState): SemanticEvidenceState {
  return {
    ...state,
    rawPartials: [...state.rawPartials],
    numbers: [...state.numbers],
    percentages: [...state.percentages],
    moneyAmounts: [...state.moneyAmounts],
    durations: [...state.durations],
    positions: [...state.positions],
    drValues: [...state.drValues],
    seoEntities: [...state.seoEntities],
    actionSignals: [...state.actionSignals],
    comparisonSignals: [...state.comparisonSignals],
    allocationSignals: [...state.allocationSignals],
    rankingSignals: [...state.rankingSignals],
    indexingSignals: [...state.indexingSignals],
    intentScores: state.intentScores.map((score) => ({ ...score, signals: { ...score.signals }, evidenceTokens: [...score.evidenceTokens] }))
  };
}

function logFinalSemanticEvidence(state: SemanticEvidenceState, intent: QuestionIntent): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
    return;
  }
  if (typeof process !== "undefined" && process.env?.DEBUG_SEMANTIC_EVIDENCE !== "true") {
    return;
  }

  console.log(
    `[SEMANTIC FINAL]\nturnId: ${state.turnId}\nintent: ${intent.category}\nconfidence: ${intent.confidence.toFixed(2)}\nevidence: ${JSON.stringify(state.seoEntities)}`
  );
}

function abortActiveSpeculative() {
  turnContextManager.abortCurrentTurn();
  if (activeSpeculative) {
    activeSpeculative.abortController.abort();
    activeSpeculative.status = "aborted";
    activeSpeculative = undefined;
  }
}

function handleTranscriptUpdate(
  rawText: string,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  rawTurnSpeechBuffer = rawText;
  const previousCtx = turnContextManager.getPreviousCompletedContext();
  const reconstruction = semanticReconstructor.reconstruct(rawText, {
    priorContext: previousCtx,
    priorIntent: previousCtx?.intent,
    priorEntities: previousCtx?.entities
  });
  correctedTurnSpeechBuffer = reconstruction.interpretedQuestion;

  const currentStatus = get().status;

  // Speech resumed during Grace Window: reopen candidate question and append speech
  if (currentStatus === "FinalizingQuestion" || currentStatus === "PossibleEnd") {
    clearGraceWindow();
    set({ status: "Listening", liveTranscript: correctedTurnSpeechBuffer });
  } else if (currentStatus !== "Answering") {
    set({ liveTranscript: correctedTurnSpeechBuffer });
  }

  // While answering committed answer, accumulate speech for next turn without triggering turn detection
  if (currentStatus === "Answering") {
    return;
  }

  evaluateAccumulatedTurn(set, get);
}

function evaluateAccumulatedTurn(
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  const currentStatus = get().status;
  if (currentStatus === "Answering" || !correctedTurnSpeechBuffer.trim()) {
    return;
  }

  smartDetector.updateTurn(
    correctedTurnSpeechBuffer,
    () => {
      if (get().status === "Listening") {
        set({ status: "PossibleEnd" });
      }
    },
    (candidate) => {
      if (candidate.intent) {
        latestIntentCandidate = candidate.intent;
      }
      startGraceWindow(candidate.text, set, get);
    },
    (candidateEvent) => {
      turnQuestionIntentReadyAt = candidateEvent.readyAt;
      latestIntentCandidate = candidateEvent.intent;
      set({ intentCandidate: candidateEvent });
    }
  );

  // PHASE 3 SPECULATIVE GEMINI PREWARM TRIGGER
  // Evaluates progressive SemanticEvidenceState on every partial update without requiring end-of-question markers!
  const evidenceState = smartDetector.getEvidenceState();
  const eligibility = prewarmPolicy.evaluate(evidenceState);

  if (eligibility.eligible) {
    handleSpeculativePrewarmTrigger(evidenceState, eligibility, set, get);
  }
}

function handleSpeculativePrewarmTrigger(
  evidenceState: SemanticEvidenceState,
  eligibility: PrewarmEligibilityResult,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  if (get().status === "Answering") {
    return;
  }

  // Request deduplication: If active speculative request exists
  if (activeSpeculative) {
    if (activeSpeculative.turnId !== evidenceState.turnId) {
      logSpeculativePrewarmEvent({
        turnId: activeSpeculative.turnId || "unknown-turn",
        intent: activeSpeculative.intentCategory,
        confidence: activeSpeculative.intentConfidence,
        eligible: false,
        reason: `Stale speculative turn ${activeSpeculative.turnId || "unknown"} does not match current turn ${evidenceState.turnId}`,
        prewarmStartedAt: activeSpeculative.startedAt,
        requestId: activeSpeculative.requestId,
        reused: false,
        replaced: true,
        cancelled: true
      });
      abortActiveSpeculative();
    }
  }

  if (activeSpeculative) {
    if (
      activeSpeculative.status !== "aborted" &&
      activeSpeculative.intentCategory === eligibility.intent
    ) {
      // Same intent: Deduplicate and continue background generation
      return;
    }
    // Intent shifted materially: abort previous speculative request and start replacement
    logSpeculativePrewarmEvent({
      turnId: evidenceState.turnId,
      intent: activeSpeculative.intentCategory,
      confidence: activeSpeculative.intentConfidence,
      eligible: false,
      reason: `Material intent shift from ${activeSpeculative.intentCategory} to ${eligibility.intent}`,
      prewarmStartedAt: activeSpeculative.startedAt,
      requestId: activeSpeculative.requestId,
      reused: false,
      replaced: true,
      cancelled: true
    });
    abortActiveSpeculative();
  }

  // Start new background speculative prewarm stream
  startSpeculativePrewarmStream(evidenceState, eligibility, set, get);
}

function startSpeculativePrewarmStream(
  evidenceState: SemanticEvidenceState,
  eligibility: PrewarmEligibilityResult,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  const requestId = crypto.randomUUID();
  const abortController = new AbortController();
  const startedAt = Date.now();

  const timestamps: PipelineTimestamps = {
    speechLastActivityAt: turnSpeechLastActivityAt ?? startedAt,
    lastSttPartialAt: turnLastSttPartialAt,
    lastSttFinalAt: turnLastSttFinalAt,
    intentCandidateAt: startedAt,
    questionIntentReadyAt: startedAt,
    speculativeRequestStartedAt: startedAt,
    answerRequestStartedAt: startedAt,
    mode: "speculativeReused"
  };

  const session: ActiveSpeculativeSession = {
    requestId,
    turnId: evidenceState.turnId,
    intentCategory: eligibility.intent,
    intentConfidence: eligibility.confidence,
    normalizedQuestion: evidenceState.latestTranscript,
    rawTranscript: rawTurnSpeechBuffer.trim() || evidenceState.latestTranscript,
    startedAt,
    abortController,
    status: "prewarming",
    answer: emptyAnswer(),
    bufferedText: "",
    timestamps
  };

  const previousContext = turnContextManager.getPreviousCompletedContext();
  const followUpContext = resolveFollowUpContext(
    evidenceState.latestTranscript,
    previousContext,
    evidenceState.turnId
  );

  const provisionalContract = buildAnswerContract({
    question: session.normalizedQuestion,
    intent: eligibility.intent,
    semanticEvidence: evidenceState,
    candidateProfile: get().candidateProfile,
    followUpContext
  });
  session.contract = provisionalContract;

  activeSpeculative = session;

  logSpeculativePrewarmEvent({
    turnId: evidenceState.turnId,
    intent: eligibility.intent,
    confidence: eligibility.confidence,
    eligible: true,
    reason: eligibility.reason,
    prewarmStartedAt: startedAt,
    requestId,
    reused: false,
    replaced: false,
    cancelled: false
  });

  // IMPORTANT: Do NOT show speculative answer text or switch status to "Answering" while interviewer is speaking!
  // Live transcript remains interactive and no partial answer is prematurely revealed.

  void (async () => {
    let nextAnswer = emptyAnswer();
    let accumulatedText = "";

    try {
      const generator = answerService.streamAnswer({
        questionId: requestId,
        turnId: session.turnId,
        question: session.normalizedQuestion,
        rawTranscript: session.rawTranscript,
        questionCommittedAt: startedAt,
        speechLastActivityAt: timestamps.speechLastActivityAt,
        questionIntentReadyAt: timestamps.questionIntentReadyAt,
        recentHistory: get().history.slice(0, 5),
        profile: get().candidateProfile,
        intent: {
          category: eligibility.intent,
          confidence: eligibility.confidence,
          normalizedQuestion: session.normalizedQuestion,
          evidence: evidenceState.seoEntities
        },
        contract: provisionalContract,
        semanticEvidence: evidenceState,
        followUpContext,
        signal: abortController.signal
      });

      for await (const delta of generator) {
        // Request ID & Abort Protection
        if (activeSpeculative?.requestId !== requestId || abortController.signal.aborted) {
          break;
        }

        if (timestamps.firstAnswerTokenAt === undefined) {
          timestamps.firstAnswerTokenAt = Date.now();
        }

        nextAnswer = applyDelta(nextAnswer, delta);
        session.answer = nextAnswer;

        if (delta.type === "chunk" && delta.accumulatedText) {
          accumulatedText = delta.accumulatedText;
          session.bufferedText = accumulatedText;
        }

        if (timestamps.firstUsefulAnswerAt === undefined) {
          const useful = extractFirstUsefulAnswer(nextAnswer);
          if (useful) {
            timestamps.firstUsefulAnswerAt = Date.now();
          }
        }

        // If this speculative session was promoted to the committed visible answer, render progressive chunks
        if (activeItem && activeItem.id === requestId) {
          timestamps.firstVisibleAnswerAt ??= Date.now();
          set({ answer: nextAnswer });
        }
      }

      if (activeSpeculative?.requestId === requestId) {
        session.status = "completed";
        timestamps.answerCompletedAt = Date.now();

        // If this speculative request has been promoted to committed activeItem, finalize history
        if (activeItem && activeItem.id === requestId) {
          finalizeCommittedItem(activeItem, nextAnswer, set, get);
        }
      }
    } catch {
      if (abortController.signal.aborted || activeSpeculative?.requestId !== requestId) {
        return;
      }
      session.status = "aborted";
    }
  })();
}

function startGraceWindow(
  questionText: string,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  const text = questionText.trim();
  if (!text || get().status === "FinalizingQuestion") {
    return;
  }

  clearGraceWindow();
  set({ status: "FinalizingQuestion" });

  // Grace Window (~1.8 seconds) to allow interviewer speech resumption
  graceWindowTimer = window.setTimeout(() => {
    commitQuestion(text, set, get);
  }, 1800);
}

function commitQuestion(
  questionText: string,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState,
  providerSpeechEndedAt?: number
) {
  if (get().status === "Answering") {
    return;
  }

  clearGraceWindow();
  if (!questionText.trim()) {
    return;
  }

  const commitTime = Date.now();
  const rawText = rawTurnSpeechBuffer.trim() || questionText.trim();
  const prevContext = turnContextManager.getPreviousCompletedContext();
  const evidenceSnapshot = snapshotSemanticEvidence(smartDetector.getEvidenceState());
  const finalTurnId = evidenceSnapshot.turnId || crypto.randomUUID();

  const reconstruction = semanticReconstructor.reconstruct(rawText, {
    turnId: finalTurnId,
    priorContext: prevContext,
    priorIntent: prevContext?.intent,
    priorEntities: prevContext?.entities
  });
  const correctedText = reconstruction.interpretedQuestion;

  const finalIntent = smartDetector.detectIntent(correctedText, rawText);
  const speechEndedAt = providerSpeechEndedAt ?? turnSpeechEndedAt;
  const speechLastActivityAt = turnSpeechLastActivityAt;
  const lastSttPartialAt = turnLastSttPartialAt;
  const lastSttFinalAt = turnLastSttFinalAt;
  const questionIntentReadyAt = turnQuestionIntentReadyAt;
  const latestIntent = latestIntentCandidate;
  logFinalSemanticEvidence(evidenceSnapshot, finalIntent);

  const previousContext = turnContextManager.getPreviousCompletedContext();
  const followUpContext = resolveFollowUpContext(
    correctedText,
    previousContext,
    finalTurnId
  );

  if (followUpContext.contextResolved && followUpContext.inheritedIntent) {
    finalIntent.category = followUpContext.inheritedIntent;
  }

  const committedTurn = createCommittedTurn({
    turnId: finalTurnId,
    questionText: correctedText,
    rawTranscript: rawText,
    committedAt: commitTime,
    intent: finalIntent.category,
    entities: evidenceSnapshot.seoEntities,
    numericFacts: evidenceSnapshot.numbers.map(String),
    scenarioConstraints: evidenceSnapshot.scenarioConstraints,
    parentTurnId: followUpContext.previousTurnId,
    followUpContext
  });

  turnContextManager.recordCommittedTurn(committedTurn);
  logTurnCreated({
    turnId: committedTurn.turnId,
    timestamp: committedTurn.committedAt,
    hash: committedTurn.hash
  });
  logTurnCommitted({
    turnId: committedTurn.turnId,
    questionText: committedTurn.questionText,
    intent: committedTurn.intent,
    questionShape: committedTurn.questionShape,
    hash: committedTurn.hash,
    parentTurnId: committedTurn.parentTurnId
  });

  const finalContract = buildAnswerContract({
    question: correctedText,
    intent: finalIntent,
    semanticEvidence: evidenceSnapshot,
    candidateProfile: get().candidateProfile,
    followUpContext
  });

  // Check if we can REUSE the active speculative request
  const speculativeAtCommit = activeSpeculative;
  const hadSpeculativeAtCommit = speculativeAtCommit !== undefined;
  const canReuseSpeculative = isSpeculativeSessionReusable(speculativeAtCommit, finalTurnId, finalIntent.category, finalContract);

  if (speculativeAtCommit && speculativeAtCommit.turnId !== finalTurnId) {
    logSpeculativePrewarmEvent({
      turnId: speculativeAtCommit.turnId || "unknown-turn",
      intent: speculativeAtCommit.intentCategory,
      confidence: speculativeAtCommit.intentConfidence,
      eligible: false,
      reason: `Stale speculative turn ${speculativeAtCommit.turnId || "unknown"} does not match committed turn ${finalTurnId}`,
      prewarmStartedAt: speculativeAtCommit.startedAt,
      requestId: speculativeAtCommit.requestId,
      reused: false,
      replaced: true,
      cancelled: true
    });
    abortActiveSpeculative();
  }

  // Reset only after final intent and speculative ownership have been decided.
  smartDetector.reset();
  if (typeof activeTranscriptService?.resetTurn === "function") {
    activeTranscriptService.resetTurn();
  }
  rawTurnSpeechBuffer = "";
  correctedTurnSpeechBuffer = "";
  resetTurnTelemetry();
  set({ liveTranscript: "" });

  if (canReuseSpeculative && speculativeAtCommit) {
    const spec = speculativeAtCommit;
    spec.timestamps.questionCommittedAt = commitTime;
    const resolvedSpeechEndedAt = speechEndedAt ?? commitTime;
    spec.timestamps.speechEndedAt = resolvedSpeechEndedAt;
    spec.timestamps.mode = "speculativeReused";

    const firstVisibleAnswerAt = Date.now();
    spec.timestamps.firstVisibleAnswerAt = firstVisibleAnswerAt;
    const prewarmLeadTimeMs = Math.max(0, resolvedSpeechEndedAt - spec.startedAt);
    const speechEndToFirstVisibleAnswerMs = Math.max(0, firstVisibleAnswerAt - resolvedSpeechEndedAt);
    const geminiTtftMs =
      spec.timestamps.firstAnswerTokenAt !== undefined
        ? Math.max(0, spec.timestamps.firstAnswerTokenAt - spec.startedAt)
        : undefined;

    logSpeculativePrewarmEvent({
      turnId: spec.turnId || "committed-turn",
      intent: spec.intentCategory,
      confidence: spec.intentConfidence,
      eligible: true,
      reason: "Speculative prewarm session reused successfully at speech commit",
      prewarmStartedAt: spec.startedAt,
      speechEndedAt: resolvedSpeechEndedAt,
      leadTimeMs: prewarmLeadTimeMs,
      prewarmLeadTimeMs,
      requestId: spec.requestId,
      reused: true,
      replaced: false,
      cancelled: false,
      geminiTtftMs,
      speechEndToFirstVisibleAnswerMs
    });

    const newItem: ConversationItem = {
      id: spec.requestId,
      turnId: finalTurnId,
      startedAt: spec.startedAt,
      rawTranscript: rawText,
      correctedTranscript: correctedText,
      cleanedQuestion: correctedText,
      detectedTopic:
        followUpContext.contextResolved && followUpContext.inheritedIntent
          ? followUpContext.inheritedIntent
          : spec.intentCategory !== "UNKNOWN"
          ? spec.intentCategory
          : "Vietnamese SEO Question",
      intent:
        finalIntent.category !== "UNKNOWN"
          ? finalIntent
          : (latestIntent ?? {
              category: spec.intentCategory,
              confidence: spec.intentConfidence,
              normalizedQuestion: correctedText,
              evidence: []
            }),
      contract: finalContract,
      followUpContext,
      answerProvider: answerService.providerName,
      answerModel: answerService.modelName,
      answer: spec.answer,
      timestamps: spec.timestamps
    };

    activeItem = newItem;
    resetTurnTelemetry();

    // Release buffered answer immediately to UI!
    set({
      status: "Answering",
      answer: spec.answer,
      rawQuestion: newItem.rawTranscript,
      cleanedQuestion: newItem.cleanedQuestion,
      detectedTopic: newItem.detectedTopic
    });

    // If speculative stream already finished before commit, record to history and finish turn
    if (spec.status === "completed") {
      finalizeCommittedItem(newItem, spec.answer, set, get);
    }
    return;
  }

  // Otherwise: Cancel any stale speculative request and start fresh stream
  const wasSpeculativeAborted = hadSpeculativeAtCommit;
  if (wasSpeculativeAborted && activeSpeculative) {
    logSpeculativePrewarmEvent({
      turnId: activeSpeculative.turnId || "replaced-turn",
      intent: activeSpeculative.intentCategory,
      confidence: activeSpeculative.intentConfidence,
      eligible: false,
      reason: `Material intent shift from ${activeSpeculative.intentCategory} to ${finalIntent.category}`,
      prewarmStartedAt: activeSpeculative.startedAt,
      requestId: activeSpeculative.requestId,
      reused: false,
      replaced: true,
      cancelled: true
    });
  }
  abortActiveSpeculative();

  const timestamps: PipelineTimestamps = {
    speechLastActivityAt: speechLastActivityAt ?? commitTime,
    speechEndedAt: speechEndedAt ?? commitTime,
    lastSttPartialAt,
    lastSttFinalAt,
    questionIntentReadyAt: questionIntentReadyAt ?? commitTime,
    questionCommittedAt: commitTime,
    mode: wasSpeculativeAborted ? "speculativeReplaced" : "normalCommitted"
  };

  const newItem: ConversationItem = {
    id: crypto.randomUUID(),
    turnId: finalTurnId,
    startedAt: commitTime,
    rawTranscript: rawText,
    correctedTranscript: correctedText,
    cleanedQuestion: correctedText,
    detectedTopic:
      followUpContext.contextResolved && followUpContext.inheritedIntent
        ? followUpContext.inheritedIntent
        : finalIntent.category !== "UNKNOWN"
        ? finalIntent.category
        : "Vietnamese SEO Question",
    intent: finalIntent,
    contract: finalContract,
    followUpContext,
    answerProvider: answerService.providerName,
    answerModel: answerService.modelName,
    timestamps
  };
  activeItem = newItem;

  resetTurnTelemetry();

  void streamAnswerForItem(newItem, set, get).catch((error: unknown) => {
    set({
      status: "Error",
      error: error instanceof Error ? error.message : "Answer stream failed."
    });
  });
}

function finalizeCommittedItem(
  item: ConversationItem,
  finalAnswer: SuggestedAnswer,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  const completedAt = Date.now();
  const targetTurnId = item.turnId || item.id;

  logAnswerAttachedToTurn({
    turnId: targetTurnId,
    requestId: item.id,
    attachedTurnId: targetTurnId,
    match: true
  });

  if (item.timestamps) {
    item.timestamps.answerCompletedAt = completedAt;
    if (item.timestamps.firstUsefulAnswerAt === undefined) {
      item.timestamps.firstUsefulAnswerAt = completedAt;
    }
    if (item.timestamps.firstAnswerTokenAt === undefined) {
      item.timestamps.firstAnswerTokenAt = completedAt;
    }
    const metrics = calculatePipelineMetrics(item.timestamps);
    if (answerService.providerName !== "gemini") {
      console.log(formatPipelineMetricsLog(metrics));
    }
  }

  const contract = item.contract;
  const intentCat = (item.intent && typeof item.intent !== "string" ? item.intent.category : item.intent || contract?.intent || "UNKNOWN") as QuestionIntentCategory;
  const decision = extractDecisionFromCompletedTurn(
    item.cleanedQuestion ?? item.rawTranscript,
    intentCat,
    finalAnswer,
    contract
  );

  const completedTurnContext: InterviewTurnContext = {
    turnId: targetTurnId,
    question: item.cleanedQuestion ?? item.rawTranscript,
    intent: intentCat,
    answerType: contract?.answerType,
    entities: contract?.requiredEntities && contract.requiredEntities.length > 0
      ? [...contract.requiredEntities]
      : (item.intent && typeof item.intent !== "string" ? item.intent.evidence || [] : []),
    numericFacts: contract?.requiredFacts ? [...contract.requiredFacts] : [],
    scenarioConstraints: contract?.scenarioConstraints,
    decision,
    answerSummary: finalAnswer.openingLine || (finalAnswer.bullets.slice(0, 2).join("; ")),
    committedAt: completedAt
  };

  turnContextManager.recordCompletedTurn(completedTurnContext);

  const finishedItem: ConversationItem = {
    ...item,
    turnId: targetTurnId,
    completedAt,
    answer: finalAnswer,
    timestamps: item.timestamps
  };

  // Deduplication: Avoid duplicate history items
  const existingHistory = get().history;
  const isDuplicate = existingHistory.some(
    (h) => h.id === finishedItem.id || h.turnId === finishedItem.turnId || (h.rawTranscript === finishedItem.rawTranscript && Math.abs(h.startedAt - finishedItem.startedAt) < 3000)
  );

  let history = existingHistory;
  if (!isDuplicate) {
    history = [finishedItem, ...existingHistory];
  } else {
    history = existingHistory.map((h) => (h.id === finishedItem.id || (finishedItem.turnId && h.turnId === finishedItem.turnId) ? finishedItem : h));
  }

  writeHistory(capHistory(history));

  activeSpeculative = undefined;
  activeItem = undefined;

  set({ status: "Listening", history });

  if (correctedTurnSpeechBuffer.trim()) {
    evaluateAccumulatedTurn(set, get);
  }
}

async function streamAnswerForItem(
  item: ConversationItem,
  set: (partial: Partial<CopilotState>) => void,
  get: () => CopilotState
) {
  let nextAnswer = emptyAnswer();
  set({
    status: "Answering",
    answer: nextAnswer,
    rawQuestion: item.rawTranscript,
    cleanedQuestion: item.cleanedQuestion ?? item.rawTranscript,
    detectedTopic: item.detectedTopic ?? "SEO Question"
  });

  const timestamps: PipelineTimestamps = {
    ...item.timestamps,
    answerRequestStartedAt: Date.now()
  };

  let hasError = false;
  let receivedAnyUsefulAnswer = false;
  let errorDetail = "";
  let providerStatus: "SUCCESS" | "RATE_LIMIT" | "TIMEOUT" | "NETWORK_ERROR" | "STREAM_ERROR" = "SUCCESS";
  let answerSource: "GEMINI" | "SAFE_FALLBACK" = "GEMINI";

  const contract =
    item.contract ||
    buildAnswerContract({
      question: item.cleanedQuestion ?? item.rawTranscript,
      intent: item.intent,
      candidateProfile: get().candidateProfile,
      followUpContext: item.followUpContext
    });

  try {
    const generator = answerService.streamAnswer({
      questionId: item.id,
      turnId: item.turnId,
      question: item.cleanedQuestion ?? item.rawTranscript,
      rawTranscript: item.rawTranscript,
      questionCommittedAt: item.timestamps?.questionCommittedAt ?? item.startedAt,
      speechLastActivityAt: item.timestamps?.speechLastActivityAt,
      speechEndedAt: item.timestamps?.speechEndedAt,
      questionIntentReadyAt: item.timestamps?.questionIntentReadyAt,
      recentHistory: get().history.slice(0, 5),
      profile: get().candidateProfile,
      intent: item.intent,
      contract,
      followUpContext: item.followUpContext
    });

    for await (const delta of generator) {
      // Ownership check: if activeItem changed to a new question during streaming, do not overwrite state with stale chunks!
      if (activeItem?.id !== item.id) {
        break;
      }

      if (timestamps.firstAnswerTokenAt === undefined) {
        timestamps.firstAnswerTokenAt = Date.now();
      }
      timestamps.firstVisibleAnswerAt ??= Date.now();

      nextAnswer = applyDelta(nextAnswer, delta);

      if (timestamps.firstUsefulAnswerAt === undefined) {
        const useful = extractFirstUsefulAnswer(nextAnswer);
        if (useful) {
          timestamps.firstUsefulAnswerAt = Date.now();
          receivedAnyUsefulAnswer = true;
        }
      }

      set({ answer: nextAnswer });
    }
  } catch (error) {
    hasError = true;
    errorDetail = error instanceof Error ? error.message : String(error);
    const errLower = errorDetail.toLowerCase();
    if (errLower.includes("429") || errLower.includes("quota")) {
      providerStatus = "RATE_LIMIT";
    } else if (errLower.includes("timeout") || errLower.includes("timed out")) {
      providerStatus = "TIMEOUT";
    } else if (errLower.includes("stream") || errLower.includes("cancelled")) {
      providerStatus = "STREAM_ERROR";
    } else {
      providerStatus = "NETWORK_ERROR";
    }

    // Task 4: Partial Stream Safety Policy:
    // If NO meaningful answer was exposed yet, invoke SAFE_FALLBACK so UI renders safe grounded answer
    if (!receivedAnyUsefulAnswer) {
      answerSource = "SAFE_FALLBACK";
      const fallback = buildSafeFallbackAnswer({
        contract,
        question: item.cleanedQuestion ?? item.rawTranscript,
        failureType: providerStatus,
        errorDetail
      });
      nextAnswer = {
        ...fallback,
        providerStatus,
        answerSource,
        fallbackReason: errorDetail
      };
      timestamps.firstVisibleAnswerAt ??= Date.now();
      timestamps.firstUsefulAnswerAt ??= Date.now();
      timestamps.answerCompletedAt = Date.now();

      if (activeItem?.id === item.id) {
        set({
          answer: nextAnswer,
          status: "Answering"
        });
      }
    } else {
      // If meaningful answer was already exposed, preserve it without appending conflicting text
      nextAnswer = {
        ...nextAnswer,
        providerStatus,
        answerSource: "GEMINI",
        fallbackReason: errorDetail
      };
    }
  }

  const updatedItem: ConversationItem = {
    ...item,
    answer: nextAnswer,
    providerStatus: nextAnswer.providerStatus || providerStatus,
    answerSource: nextAnswer.answerSource || answerSource,
    fallbackReason: nextAnswer.fallbackReason || errorDetail || undefined,
    timestamps
  };

  finalizeCommittedItem(updatedItem, nextAnswer, set, get);

  if (hasError && correctedTurnSpeechBuffer.trim()) {
    evaluateAccumulatedTurn(set, get);
  }
}

export const useCopilotStore = create<CopilotState>((set, get) => {
  const initialSessions = loadStoredSessions();
  const initialActiveId = loadStoredActiveSessionId();
  const initialActiveSession =
    initialSessions.find((s) => s.id === initialActiveId) || initialSessions[0] || DEFAULT_SESSION_CONFIG;

  return {
    status: "Idle",
    audioLevel: 0,
    liveTranscript: "",
    rawQuestion: "",
    cleanedQuestion: "",
    detectedTopic: "",
    questionConfidence: undefined,
    intentCandidate: undefined,
    answer: emptyAnswer(),
    history: readHistory(),
    isHistoryOpen: false,
    candidateProfile: loadCandidateProfile(),
    isProfileOpen: false,
    sessions: initialSessions,
    activeSession: snapshotSessionConfig(initialActiveSession),
    isSessionDrawerOpen: false,
    compactMode: false,
    isPinned: true,
    opacityLevel: 1.0,
    isClickThrough: false,
    activeHistoryIndex: null,
    sessionStartTime: null,
    isContentProtected: true,
    error: undefined,
    setSessionDrawerOpen: (open: boolean) => set({ isSessionDrawerOpen: open }),
    toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),
    togglePin: async () => {
      const next = !get().isPinned;
      if (window.copilotWindow?.setAlwaysOnTop) {
        await window.copilotWindow.setAlwaysOnTop(next);
      }
      set({ isPinned: next });
    },
    setOpacityLevel: async (opacity: number) => {
      if (window.copilotWindow?.setOpacity) {
        await window.copilotWindow.setOpacity(opacity);
      }
      set({ opacityLevel: opacity });
    },
    toggleClickThrough: async () => {
      const next = !get().isClickThrough;
      if (window.copilotWindow?.setClickThrough) {
        await window.copilotWindow.setClickThrough(next);
      }
      set({ isClickThrough: next });
    },
    navigateHistory: (direction: "prev" | "next" | "live") => {
      const { history, activeHistoryIndex } = get();
      if (direction === "live") {
        set({ activeHistoryIndex: null });
        return;
      }
      if (direction === "prev") {
        if (history.length === 0) return;
        if (activeHistoryIndex === null) {
          set({ activeHistoryIndex: 0 });
        } else if (activeHistoryIndex < history.length - 1) {
          set({ activeHistoryIndex: activeHistoryIndex + 1 });
        }
        return;
      }
      if (direction === "next") {
        if (activeHistoryIndex !== null) {
          if (activeHistoryIndex > 0) {
            set({ activeHistoryIndex: activeHistoryIndex - 1 });
          } else {
            set({ activeHistoryIndex: null });
          }
        }
      }
    },
    makeAnswerShorter: async () => {
      const currentAnswer = get().answer;
      if (!currentAnswer.bullets || currentAnswer.bullets.length === 0) return;
      const modified = applyAnswerAction(currentAnswer, "SHORTER");
      set({ answer: modified });
    },
    makeAnswerMoreTechnical: async () => {
      const currentAnswer = get().answer;
      if (!currentAnswer.bullets || currentAnswer.bullets.length === 0) return;
      const modified = applyAnswerAction(currentAnswer, "MORE_TECHNICAL");
      set({ answer: modified });
    },
    explainAnswerWhy: async () => {
      const currentAnswer = get().answer;
      if (!currentAnswer.bullets || currentAnswer.bullets.length === 0) return;
      const modified = applyAnswerAction(currentAnswer, "EXPLAIN_WHY");
      set({ answer: modified });
    },
    giveAnswerExample: async () => {
      const currentAnswer = get().answer;
      if (!currentAnswer.bullets || currentAnswer.bullets.length === 0) return;
      const modified = applyAnswerAction(currentAnswer, "GIVE_EXAMPLE");
      set({ answer: modified });
    },
    defendAnswer: async () => {
      const currentAnswer = get().answer;
      if (!currentAnswer.bullets || currentAnswer.bullets.length === 0) return;
      const modified = applyAnswerAction(currentAnswer, "DEFEND_ANSWER");
      set({ answer: modified });
    },
    clearCurrentTurn: () => {
      clearGraceWindow();
      abortActiveSpeculative();
      rawTurnSpeechBuffer = "";
      correctedTurnSpeechBuffer = "";
      set({
        liveTranscript: "",
        rawQuestion: "",
        cleanedQuestion: "",
        detectedTopic: "",
        answer: emptyAnswer(),
        activeHistoryIndex: null,
        error: undefined
      });
    },
    createSession: (partial?: Partial<SessionConfig>) => {
      const newSession = createDefaultSessionConfig(partial);
      const updated = [newSession, ...get().sessions];
      saveStoredSessions(updated);
      set({ sessions: updated });
      return newSession;
    },
    saveSession: (session: SessionConfig) => {
      const exists = get().sessions.some((s) => s.id === session.id);
      const updated = exists
        ? get().sessions.map((s) => (s.id === session.id ? session : s))
        : [session, ...get().sessions];
      saveStoredSessions(updated);
      const newActive =
        get().activeSession.id === session.id
          ? snapshotSessionConfig(session)
          : get().activeSession;
      set({ sessions: updated, activeSession: newActive });
    },
    duplicateSession: (sessionId: string) => {
      const target = get().sessions.find((s) => s.id === sessionId) || get().activeSession;
      const duplicated = duplicateSessionConfig(target);
      const updated = [duplicated, ...get().sessions];
      saveStoredSessions(updated);
      set({ sessions: updated });
      return duplicated;
    },
    deleteSession: (sessionId: string) => {
      const updated = get().sessions.filter((s) => s.id !== sessionId);
      if (updated.length === 0) {
        updated.push(DEFAULT_SESSION_CONFIG);
      }
      saveStoredSessions(updated);
      let newActive = get().activeSession;
      if (newActive.id === sessionId) {
        newActive = snapshotSessionConfig(updated[0]);
        saveStoredActiveSessionId(newActive.id);
      }
      set({ sessions: updated, activeSession: newActive });
    },
    startSession: (session: SessionConfig) => {
      const snapshot = snapshotSessionConfig(session);
      saveStoredActiveSessionId(snapshot.id);
      clearGraceWindow();
      abortActiveSpeculative();
      turnContextManager.reset();
      smartDetector.reset();
      resetTurnTelemetry();
      activeItem = undefined;
      rawTurnSpeechBuffer = "";
      correctedTurnSpeechBuffer = "";
      set({
        activeSession: snapshot,
        answer: emptyAnswer(),
        liveTranscript: "",
        rawQuestion: "",
        cleanedQuestion: "",
        error: undefined
      });
    },
    reopenSession: (sessionId: string) => {
      const target = get().sessions.find((s) => s.id === sessionId);
      if (target) {
        get().startSession(target);
      }
    },
  startListening: () => {
    transcriptController?.stop();
    clearGraceWindow();
    abortActiveSpeculative();
    turnContextManager.reset();
    smartDetector.reset();
    resetTurnTelemetry();

    activeItem = undefined;
    rawTurnSpeechBuffer = "";
    correctedTurnSpeechBuffer = "";

    set({
      status: "Listening",
      audioLevel: 0,
      liveTranscript: "",
      rawQuestion: "",
      cleanedQuestion: "",
      detectedTopic: "",
      questionConfidence: undefined,
      intentCandidate: undefined,
      answer: emptyAnswer(),
      error: undefined
    });

    activeTranscriptService = createTranscriptService();

    void audioCapture
      .start(
        (frame) => {
          turnSpeechLastActivityAt = frame.capturedAt || Date.now();
          set({ audioLevel: frame.rmsLevel });
          if (typeof activeTranscriptService?.sendAudio === "function") {
            activeTranscriptService.sendAudio(frame);
          }
        },
        (err) => {
          transcriptController?.stop();
          transcriptController = undefined;
          set({
            status: "Error",
            audioLevel: 0,
            error: `Audio stream error: ${err.message}`
          });
        }
      )
      .catch((err: unknown) => {
        transcriptController?.stop();
        transcriptController = undefined;
        set({
          status: "Error",
          audioLevel: 0,
          error: `Audio capture failed: ${err instanceof Error ? err.message : String(err)}`
        });
      });

    transcriptController = activeTranscriptService.start({
      onPartial: (chunk) => {
        turnLastSttPartialAt = Date.now();
        turnSpeechLastActivityAt = turnLastSttPartialAt;
        handleTranscriptUpdate(chunk.text, set, get);
      },
      onFinal: (chunk) => {
        turnLastSttFinalAt = Date.now();
        turnSpeechLastActivityAt = turnLastSttFinalAt;
        handleTranscriptUpdate(chunk.text, set, get);
      },
      onSpeechFinal: (chunk) => {
        const speechEndedAt = chunk.completedAt ?? Date.now();
        turnSpeechEndedAt = speechEndedAt;
        turnLastSttFinalAt = speechEndedAt;
        turnSpeechLastActivityAt = speechEndedAt;
        handleTranscriptUpdate(chunk.text, set, get);
        smartDetector.triggerSpeechFinal(chunk.text, (candidate) => {
          if (get().status === "Answering") {
            return;
          }
          if (candidate.intent) {
            latestIntentCandidate = candidate.intent;
          }
          commitQuestion(candidate.text, set, get, speechEndedAt);
        });
      },
      onError: (error) => {
        void audioCapture.stop();
        set({ status: "Error", audioLevel: 0, error: error.message });
      },
      onComplete: () => {
        const item = activeItem;
        if (!item?.rawTranscript) {
          void audioCapture.stop();
          set({ status: "Error", audioLevel: 0, error: "Transcript finished without a question." });
          return;
        }
      }
    });
  },
  pause: () => {
    clearGraceWindow();
    abortActiveSpeculative();
    turnContextManager.reset();
    smartDetector.reset();
    resetTurnTelemetry();
    transcriptController?.stop();
    transcriptController = undefined;
    activeTranscriptService = undefined;
    rawTurnSpeechBuffer = "";
    correctedTurnSpeechBuffer = "";
    void audioCapture.stop();
    set({ status: "Idle", audioLevel: 0, intentCandidate: undefined });
  },
  finalizeQuestionNow: () => {
    const liveText = get().liveTranscript.trim();
    if (liveText) {
      commitQuestion(liveText, set, get);
      return;
    }
    const targetTurnId = activeItem?.turnId || activeItem?.id || get().history[0]?.turnId || get().history[0]?.id;
    if (targetTurnId) {
      void generateAnswerForTurn(targetTurnId, set, get);
    }
  },
  toggleHistoryDrawer: () => set((state) => ({ isHistoryOpen: !state.isHistoryOpen })),
  setHistoryOpen: (open: boolean) => set({ isHistoryOpen: open }),
  setProfileOpen: (open: boolean) => set({ isProfileOpen: open }),
  updateProfile: (profile: CandidateProfile) => {
    saveCandidateProfile(profile);
    set({ candidateProfile: profile });
  },
  toggleContentProtection: async () => {
    const nextState = !get().isContentProtected;
    if (typeof window !== "undefined" && window.copilotWindow?.setContentProtection) {
      await window.copilotWindow.setContentProtection(nextState);
    }
    set({ isContentProtected: nextState });
  },
  generateAnswerForTurn: async (turnId: string) => {
    await generateAnswerForTurn(turnId, set, get);
  },
  regenerateAnswer: async () => {
    const activeTurnId = activeItem?.turnId || activeItem?.id || get().history[0]?.turnId || get().history[0]?.id;
    if (!activeTurnId) {
      return;
    }
    await generateAnswerForTurn(activeTurnId, set, get);
  },
  triggerDirectQuestion: async (questionText: string) => {
    clearGraceWindow();
    abortActiveSpeculative();
    smartDetector.reset();
    resetTurnTelemetry();

    const rawText = questionText;
    const finalTurnId = crypto.randomUUID();
    const previousContext = turnContextManager.getPreviousCompletedContext();
    const reconstruction = semanticReconstructor.reconstruct(rawText, {
      turnId: finalTurnId,
      priorContext: previousContext,
      priorIntent: previousContext?.intent,
      priorEntities: previousContext?.entities
    });
    const correctedText = reconstruction.interpretedQuestion;
    const finalIntent = smartDetector.detectIntent(correctedText, rawText);
    const commitTime = Date.now();

    const followUpContext = resolveFollowUpContext(
      correctedText,
      previousContext,
      finalTurnId
    );

    if (followUpContext.contextResolved && followUpContext.inheritedIntent) {
      finalIntent.category = followUpContext.inheritedIntent;
    }

    const committedTurn = createCommittedTurn({
      turnId: finalTurnId,
      questionText: correctedText,
      rawTranscript: rawText,
      committedAt: commitTime,
      intent: finalIntent.category,
      parentTurnId: followUpContext.previousTurnId,
      followUpContext
    });

    turnContextManager.recordCommittedTurn(committedTurn);
    logTurnCreated({
      turnId: committedTurn.turnId,
      timestamp: committedTurn.committedAt,
      hash: committedTurn.hash
    });
    logTurnCommitted({
      turnId: committedTurn.turnId,
      questionText: committedTurn.questionText,
      intent: committedTurn.intent,
      questionShape: committedTurn.questionShape,
      hash: committedTurn.hash,
      parentTurnId: committedTurn.parentTurnId
    });

    const contract = buildAnswerContract({
      question: correctedText,
      intent: finalIntent,
      candidateProfile: get().candidateProfile,
      followUpContext
    });

    const newItem: ConversationItem = {
      id: crypto.randomUUID(),
      turnId: finalTurnId,
      startedAt: commitTime,
      rawTranscript: rawText,
      correctedTranscript: correctedText,
      cleanedQuestion: correctedText,
      detectedTopic:
        followUpContext.contextResolved && followUpContext.inheritedIntent
          ? followUpContext.inheritedIntent
          : finalIntent.category !== "UNKNOWN"
          ? finalIntent.category
          : "Vietnamese SEO Question",
      intent: finalIntent,
      contract,
      followUpContext,
      answerProvider: answerService.providerName,
      answerModel: answerService.modelName,
      timestamps: {
        speechLastActivityAt: commitTime,
        questionIntentReadyAt: commitTime,
        questionCommittedAt: commitTime,
        mode: "normalCommitted"
      }
    };

    activeItem = newItem;
    await streamAnswerForItem(newItem, set, get);
  },
  triggerDevDirectQuestion: async (questionText = "Site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý thế nào?") => {
    clearGraceWindow();
    abortActiveSpeculative();
    smartDetector.reset();
    resetTurnTelemetry();

    const rawText = questionText;
    const finalTurnId = crypto.randomUUID();
    const previousContext = turnContextManager.getPreviousCompletedContext();
    const reconstruction = semanticReconstructor.reconstruct(rawText, {
      turnId: finalTurnId,
      priorContext: previousContext,
      priorIntent: previousContext?.intent,
      priorEntities: previousContext?.entities
    });
    const correctedText = reconstruction.interpretedQuestion;
    const finalIntent = smartDetector.detectIntent(correctedText, rawText);
    const commitTime = Date.now();

    const followUpContext = resolveFollowUpContext(
      correctedText,
      previousContext,
      finalTurnId
    );

    if (followUpContext.contextResolved && followUpContext.inheritedIntent) {
      finalIntent.category = followUpContext.inheritedIntent;
    }

    const committedTurn = createCommittedTurn({
      turnId: finalTurnId,
      questionText: correctedText,
      rawTranscript: rawText,
      committedAt: commitTime,
      intent: finalIntent.category,
      parentTurnId: followUpContext.previousTurnId,
      followUpContext
    });

    turnContextManager.recordCommittedTurn(committedTurn);
    logTurnCreated({
      turnId: committedTurn.turnId,
      timestamp: committedTurn.committedAt,
      hash: committedTurn.hash
    });
    logTurnCommitted({
      turnId: committedTurn.turnId,
      questionText: committedTurn.questionText,
      intent: committedTurn.intent,
      questionShape: committedTurn.questionShape,
      hash: committedTurn.hash,
      parentTurnId: committedTurn.parentTurnId
    });

    const contract = buildAnswerContract({
      question: correctedText,
      intent: finalIntent,
      candidateProfile: get().candidateProfile,
      followUpContext
    });

    const newItem: ConversationItem = {
      id: crypto.randomUUID(),
      turnId: finalTurnId,
      startedAt: commitTime,
      rawTranscript: rawText,
      correctedTranscript: correctedText,
      cleanedQuestion: correctedText,
      detectedTopic:
        followUpContext.contextResolved && followUpContext.inheritedIntent
          ? followUpContext.inheritedIntent
          : finalIntent.category !== "UNKNOWN"
          ? finalIntent.category
          : "Vietnamese SEO Question",
      intent: finalIntent,
      contract,
      followUpContext,
      answerProvider: answerService.providerName,
      answerModel: answerService.modelName,
      timestamps: {
        speechLastActivityAt: commitTime,
        questionIntentReadyAt: commitTime,
        questionCommittedAt: commitTime,
        mode: "normalCommitted"
      }
    };

    activeItem = newItem;
    await streamAnswerForItem(newItem, set, get);
  },
    hideOverlay: async () => {
      if (window.copilotWindow?.hide) {
        await window.copilotWindow.hide();
      }
    }
  };
});

export async function generateAnswerForTurn(
  turnId: string,
  set: (partial: Partial<CopilotState> | ((state: CopilotState) => Partial<CopilotState>)) => void,
  get: () => CopilotState
): Promise<void> {
  let turn = turnContextManager.getCommittedTurn(turnId);
  if (!turn) {
    const hist = get().history.find((h) => h.id === turnId || h.turnId === turnId);
    if (hist) {
      turn = createCommittedTurn({
        turnId: hist.turnId || hist.id,
        questionText: hist.cleanedQuestion || hist.rawTranscript,
        rawTranscript: hist.rawTranscript,
        committedAt: hist.startedAt,
        intent: (typeof hist.intent === "string" ? hist.intent : hist.intent?.category || "UNKNOWN") as QuestionIntentCategory,
        parentTurnId: hist.followUpContext?.previousTurnId,
        followUpContext: hist.followUpContext
      });
      turnContextManager.recordCommittedTurn(turn);
    }
  }

  if (!turn) {
    console.error(`[MANUAL ANSWER ERROR] No committed turn found for turnId: ${turnId}`);
    return;
  }

  clearGraceWindow();
  abortActiveSpeculative();

  const requestId = crypto.randomUUID();
  const requestTime = Date.now();

  logManualAnswerRequested({
    turnId: turn.turnId,
    requestId,
    requestedAt: requestTime,
    questionHash: turn.hash
  });

  const intentObj: QuestionIntent = {
    category: turn.intent,
    confidence: 1.0,
    normalizedQuestion: turn.questionText,
    evidence: [...turn.entities]
  };

  const contract = buildAnswerContract({
    question: turn.questionText,
    intent: intentObj,
    candidateProfile: get().candidateProfile,
    followUpContext: turn.followUpContext
  });

  const newItem: ConversationItem = {
    id: requestId,
    turnId: turn.turnId,
    startedAt: requestTime,
    rawTranscript: turn.rawTranscript,
    correctedTranscript: turn.questionText,
    cleanedQuestion: turn.questionText,
    detectedTopic:
      turn.followUpContext?.contextResolved && turn.followUpContext.inheritedIntent
        ? turn.followUpContext.inheritedIntent
        : turn.intent !== "UNKNOWN"
        ? turn.intent
        : "Vietnamese SEO Question",
    intent: intentObj,
    contract,
    followUpContext: turn.followUpContext,
    answerProvider: answerService.providerName,
    answerModel: answerService.modelName,
    timestamps: {
      speechLastActivityAt: turn.committedAt,
      speechEndedAt: turn.committedAt,
      questionIntentReadyAt: turn.committedAt,
      questionCommittedAt: turn.committedAt,
      answerRequestStartedAt: requestTime,
      mode: "normalCommitted"
    }
  };

  activeItem = newItem;
  set({ answer: emptyAnswer(), error: undefined });
  await streamAnswerForItem(newItem, set, get);
}

