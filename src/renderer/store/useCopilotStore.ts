import { create } from "zustand";
import { MockAudioCapture } from "../../audio/mockAudioCapture";
import { SystemAudioCapture } from "../../audio/systemAudioCapture";
import type { AudioCapture, AudioFrame } from "../../audio/types";
import { ContextAwareTranscriptCorrector } from "../../corrector/contextAwareCorrector";
import { createAnswerService } from "../../llm/factory.browser";
import type { AnswerDelta } from "../../llm/types";
import type { QuestionIntent, QuestionIntentCategory } from "../../question-detector/intentClassifier";
import { type IntentCandidateEvent, SmartQuestionDetector } from "../../question-detector/smartQuestionDetector";
import { isSpeculativeEnabled } from "../../question-detector/speculativeConfig";
import { SpeculativePrewarmPolicy, type PrewarmEligibilityResult } from "../../question-detector/speculativePrewarmPolicy";
import type { SemanticEvidenceState } from "../../question-detector/semanticEvidence";
import { capHistory } from "../../shared/history";
import {
  calculatePipelineMetrics,
  extractFirstUsefulAnswer,
  formatPipelineMetricsLog,
  type PipelineTimestamps
} from "../../shared/telemetry";
import type { AppStatus, ConversationItem, StreamController, SuggestedAnswer } from "../../shared/types";
import { MockTranscriptService } from "../../transcription/mockTranscriptService";
import { RealStreamingSTTService } from "../../transcription/realStreamingSTT";
import type { TranscriptionService } from "../../transcription/types";
import { parseStreamingAnswer } from "../../llm/parseAnswerJson";
import { type CandidateProfile, loadCandidateProfile, saveCandidateProfile } from "../../shared/candidateProfile";
import { buildAnswerContract, isContractCompatible, type AnswerContract } from "../../llm/answerContract";

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
  isContentProtected: boolean;
  error?: string;
  startListening: () => void;
  pause: () => void;
  finalizeQuestionNow: () => void;
  toggleHistoryDrawer: () => void;
  setHistoryOpen: (open: boolean) => void;
  setProfileOpen: (open: boolean) => void;
  updateProfile: (profile: CandidateProfile) => void;
  toggleContentProtection: () => Promise<void>;
  regenerateAnswer: () => Promise<void>;
  triggerDirectQuestion?: (questionText: string) => Promise<void>;
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
const corrector = new ContextAwareTranscriptCorrector();
const prewarmPolicy = new SpeculativePrewarmPolicy();

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
  const correctionResult = corrector.correct(rawText, { domain: "seo_igaming_interview" });
  correctedTurnSpeechBuffer = correctionResult.correctedText;

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

  const provisionalContract = buildAnswerContract({
    question: session.normalizedQuestion,
    intent: eligibility.intent,
    semanticEvidence: evidenceState,
    candidateProfile: get().candidateProfile
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
  const correctedText = questionText.trim();
  if (!correctedText) {
    return;
  }

  const commitTime = Date.now();
  const rawText = rawTurnSpeechBuffer.trim() || correctedText;
  const evidenceSnapshot = snapshotSemanticEvidence(smartDetector.getEvidenceState());
  const finalIntent = smartDetector.detectIntent(correctedText, rawText);
  const finalTurnId = evidenceSnapshot.turnId;
  const speechEndedAt = providerSpeechEndedAt ?? turnSpeechEndedAt;
  const speechLastActivityAt = turnSpeechLastActivityAt;
  const lastSttPartialAt = turnLastSttPartialAt;
  const lastSttFinalAt = turnLastSttFinalAt;
  const questionIntentReadyAt = turnQuestionIntentReadyAt;
  const latestIntent = latestIntentCandidate;
  logFinalSemanticEvidence(evidenceSnapshot, finalIntent);

  const finalContract = buildAnswerContract({
    question: correctedText,
    intent: finalIntent,
    semanticEvidence: evidenceSnapshot,
    candidateProfile: get().candidateProfile
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
      startedAt: spec.startedAt,
      rawTranscript: rawText,
      correctedTranscript: correctedText,
      cleanedQuestion: correctedText,
      detectedTopic: spec.intentCategory !== "UNKNOWN" ? spec.intentCategory : "Vietnamese SEO Question",
      intent:
        finalIntent.category !== "UNKNOWN"
          ? finalIntent
          : (latestIntent ?? {
              category: spec.intentCategory,
              confidence: spec.intentConfidence,
              normalizedQuestion: correctedText,
              evidence: []
            }),
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
    startedAt: commitTime,
    rawTranscript: rawText,
    correctedTranscript: correctedText,
    cleanedQuestion: correctedText,
    detectedTopic: finalIntent.category !== "UNKNOWN" ? finalIntent.category : "Vietnamese SEO Question",
    intent: finalIntent,
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

  const finishedItem: ConversationItem = {
    ...item,
    completedAt,
    answer: finalAnswer,
    timestamps: item.timestamps
  };

  // Deduplication: Avoid duplicate history items
  const existingHistory = get().history;
  const isDuplicate = existingHistory.some(
    (h) => h.id === finishedItem.id || (h.rawTranscript === finishedItem.rawTranscript && Math.abs(h.startedAt - finishedItem.startedAt) < 3000)
  );

  let history = existingHistory;
  if (!isDuplicate) {
    history = [finishedItem, ...existingHistory];
  } else {
    history = existingHistory.map((h) => (h.id === finishedItem.id ? finishedItem : h));
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
  try {
    const contract = buildAnswerContract({
      question: item.cleanedQuestion ?? item.rawTranscript,
      intent: item.intent,
      candidateProfile: get().candidateProfile
    });

    const generator = answerService.streamAnswer({
      questionId: item.id,
      question: item.cleanedQuestion ?? item.rawTranscript,
      rawTranscript: item.rawTranscript,
      questionCommittedAt: item.timestamps?.questionCommittedAt ?? item.startedAt,
      speechLastActivityAt: item.timestamps?.speechLastActivityAt,
      speechEndedAt: item.timestamps?.speechEndedAt,
      questionIntentReadyAt: item.timestamps?.questionIntentReadyAt,
      recentHistory: get().history.slice(0, 5),
      profile: get().candidateProfile,
      intent: item.intent,
      contract
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
        }
      }

      set({ answer: nextAnswer });
    }
  } catch (error) {
    hasError = true;
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (activeItem?.id === item.id) {
      set({
        status: "Error",
        error: `Answer generation failed: ${errorMsg}`
      });
    }
  }

  if (hasError) {
    if (correctedTurnSpeechBuffer.trim()) {
      evaluateAccumulatedTurn(set, get);
    }
    return;
  }

  finalizeCommittedItem({ ...item, timestamps }, nextAnswer, set, get);
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
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
  isContentProtected: true,
  error: undefined,
  startListening: () => {
    transcriptController?.stop();
    clearGraceWindow();
    abortActiveSpeculative();
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
    const text = get().liveTranscript.trim();
    if (!text) {
      return;
    }
    commitQuestion(text, set, get);
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
  regenerateAnswer: async () => {
    const question = activeItem || get().history[0];
    if (!question?.cleanedQuestion) {
      return;
    }
    clearGraceWindow();
    abortActiveSpeculative();
    set({ answer: emptyAnswer(), error: undefined });
    await streamAnswerForItem(question, set, get);
  },
  triggerDirectQuestion: async (questionText: string) => {
    clearGraceWindow();
    abortActiveSpeculative();
    smartDetector.reset();
    resetTurnTelemetry();

    const rawText = questionText;
    const correctionResult = corrector.correct(rawText, { domain: "seo_igaming_interview" });
    const correctedText = correctionResult.correctedText;
    const finalIntent = smartDetector.detectIntent(correctedText, rawText);
    const commitTime = Date.now();

    const newItem: ConversationItem = {
      id: crypto.randomUUID(),
      startedAt: commitTime,
      rawTranscript: rawText,
      correctedTranscript: correctedText,
      cleanedQuestion: correctedText,
      detectedTopic: finalIntent.category !== "UNKNOWN" ? finalIntent.category : "Vietnamese SEO Question",
      intent: finalIntent,
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
    const correctionResult = corrector.correct(rawText, { domain: "seo_igaming_interview" });
    const correctedText = correctionResult.correctedText;
    const finalIntent = smartDetector.detectIntent(correctedText, rawText);
    const commitTime = Date.now();

    const newItem: ConversationItem = {
      id: crypto.randomUUID(),
      startedAt: commitTime,
      rawTranscript: rawText,
      correctedTranscript: correctedText,
      cleanedQuestion: correctedText,
      detectedTopic: finalIntent.category !== "UNKNOWN" ? finalIntent.category : "Vietnamese SEO Question",
      intent: finalIntent,
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
    if (window.copilotWindow) {
      await window.copilotWindow.hide();
    }
  }
}));
