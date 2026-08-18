import type { QuestionIntentCategory } from "./intentClassifier";
import type { ScenarioConstraints } from "./scenarioConstraints";
import type { AnswerContractType } from "../llm/answerContract";

export type FollowUpType =
  | "WHY"
  | "SIGNAL"
  | "WHEN"
  | "FAILURE_NEXT_STEP"
  | "ENTITY_CONTINUATION"
  | "DECISION_REASON"
  | "GENERAL_CONTINUATION";

export interface InterviewTurnDecision {
  choice?: string;
  action?: string;
}

export interface InterviewTurnContext {
  turnId: string;
  question: string;
  intent: QuestionIntentCategory;
  answerType?: AnswerContractType;
  entities: string[];
  numericFacts: string[];
  scenarioConstraints?: ScenarioConstraints;
  decision?: InterviewTurnDecision;
  answerSummary?: string;
  committedAt: number;
}

export interface ResolvedFollowUpContext {
  followUpType: FollowUpType;
  contextResolved: boolean;
  currentUtterance: string;
  previousTurnId?: string;
  previousQuestion?: string;
  inheritedIntent?: QuestionIntentCategory;
  inheritedEntities: string[];
  inheritedNumericFacts: string[];
  inheritedConstraints?: ScenarioConstraints;
  previousDecision?: InterviewTurnDecision;
  previousAnswerSummary?: string;
  resolvedMeaning?: string;
  targetEntity?: string;
  resolutionMs: number;
}

export interface FollowUpDetectionResult {
  detected: boolean;
  type?: FollowUpType;
  targetEntity?: string;
  rawPattern?: string;
}

/**
 * Manages minimal turn context snapshots for the interview.
 * Strictly bounded: stores ONLY current turn and immediately previous completed turn.
 */
export class InterviewTurnContextManager {
  private previousCompletedContext: InterviewTurnContext | null = null;
  private currentTurnContext: InterviewTurnContext | null = null;

  /**
   * Records a completed turn after a valid answer session is finalized.
   */
  recordCompletedTurn(context: InterviewTurnContext): void {
    if (!context || !context.turnId || !context.question.trim()) {
      return;
    }
    this.previousCompletedContext = { ...context };
    this.currentTurnContext = null;
  }

  /**
   * Sets the active in-flight turn context.
   */
  setCurrentTurn(context: InterviewTurnContext): void {
    this.currentTurnContext = context;
  }

  /**
   * Gets the immediately previous completed interviewer turn context.
   */
  getPreviousCompletedContext(): InterviewTurnContext | null {
    return this.previousCompletedContext ? { ...this.previousCompletedContext } : null;
  }

  /**
   * Gets the current in-flight turn context.
   */
  getCurrentTurnContext(): InterviewTurnContext | null {
    return this.currentTurnContext ? { ...this.currentTurnContext } : null;
  }

  /**
   * Aborts the current in-flight turn without polluting or discarding
   * the valid previous completed context.
   */
  abortCurrentTurn(): void {
    this.currentTurnContext = null;
  }

  /**
   * Clears all stored turn contexts (e.g. on new interview session).
   */
  reset(): void {
    this.previousCompletedContext = null;
    this.currentTurnContext = null;
  }
}
