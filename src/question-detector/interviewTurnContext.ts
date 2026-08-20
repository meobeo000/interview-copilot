import type { QuestionIntentCategory } from "./intentClassifier";
import type { ScenarioConstraints } from "./scenarioConstraints";
import type { AnswerContractType } from "../llm/answerContract";
import type { CommittedInterviewTurn } from "./committedTurn";

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

import { InterviewContextGraph } from "./interviewContextGraph";

/**
 * Manages minimal turn context snapshots for the interview.
 * Strictly bounded: stores ONLY current turn and immediately previous completed turn.
 * Also keeps an immutable snapshot index of all committed interview turns and context graph.
 */
export class InterviewTurnContextManager {
  private previousCompletedContext: InterviewTurnContext | null = null;
  private currentTurnContext: InterviewTurnContext | null = null;
  private committedTurns = new Map<string, CommittedInterviewTurn>();
  private contextGraph = new InterviewContextGraph();

  /**
   * Returns the underlying context graph.
   */
  getContextGraph(): InterviewContextGraph {
    return this.contextGraph;
  }

  /**
   * Registers an immutable committed turn snapshot.
   */
  recordCommittedTurn(turn: CommittedInterviewTurn): void {
    if (!turn || !turn.turnId) {
      return;
    }
    this.committedTurns.set(turn.turnId, turn);
    this.contextGraph.registerTurn({
      turnId: turn.turnId,
      questionText: turn.questionText,
      intent: turn.intent,
      entities: turn.entities,
      numericFacts: turn.numericFacts,
      isFollowUp: Boolean(turn.followUpContext?.contextResolved),
      parentTurnId: turn.parentTurnId
    });
  }

  /**
   * Resolves an immutable committed turn snapshot by turnId.
   */
  getCommittedTurn(turnId: string): CommittedInterviewTurn | undefined {
    return this.committedTurns.get(turnId);
  }

  /**
   * Returns all recorded committed turns in chronological insertion order.
   */
  getAllCommittedTurns(): CommittedInterviewTurn[] {
    return Array.from(this.committedTurns.values());
  }

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
    this.committedTurns.clear();
    this.contextGraph.reset();
  }
}

