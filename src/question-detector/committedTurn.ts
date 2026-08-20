import type { QuestionIntentCategory } from "./intentClassifier";
import type { ScenarioConstraints } from "./scenarioConstraints";
import type { ResolvedFollowUpContext } from "./interviewTurnContext";
import type { PractitionerInterviewReference } from "../knowledge/practitionerInterviewReference";
import { classifyQuestionShape, type QuestionShape } from "./questionShapeClassifier";

export interface CommittedInterviewTurn {
  readonly turnId: string;
  readonly questionText: string;
  readonly rawTranscript: string;
  readonly committedAt: number;
  readonly intent: QuestionIntentCategory;
  readonly questionShape: QuestionShape;
  readonly entities: readonly string[];
  readonly numericFacts: readonly string[];
  readonly scenarioConstraints?: Readonly<ScenarioConstraints>;
  readonly parentTurnId?: string;
  readonly followUpContext?: Readonly<ResolvedFollowUpContext>;
  readonly practitionerReferences?: readonly PractitionerInterviewReference[];
  readonly hash: string;
}

export interface CreateCommittedTurnParams {
  turnId?: string;
  questionText: string;
  rawTranscript?: string;
  committedAt?: number;
  intent: QuestionIntentCategory;
  questionShape?: QuestionShape;
  entities?: string[];
  numericFacts?: string[];
  scenarioConstraints?: ScenarioConstraints;
  parentTurnId?: string;
  followUpContext?: ResolvedFollowUpContext;
  practitionerReferences?: PractitionerInterviewReference[];
}

export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && (typeof value === "object" || typeof value === "function") && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj as Readonly<T>;
}

export function computeTurnHash(
  turnId: string,
  questionText: string,
  intent: string,
  committedAt: number
): string {
  const input = `${turnId}|${questionText.trim()}|${intent}|${committedAt}`;
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(12, "0");
}

export function createCommittedTurn(params: CreateCommittedTurnParams): CommittedInterviewTurn {
  const turnId = params.turnId || crypto.randomUUID();
  const questionText = params.questionText.trim();
  const rawTranscript = (params.rawTranscript ?? questionText).trim();
  const committedAt = params.committedAt ?? Date.now();
  const intent = params.intent;

  const shape =
    params.questionShape ??
    (params.followUpContext?.contextResolved
      ? "SIGNAL_REQUEST"
      : classifyQuestionShape(questionText).primaryShape);

  const hash = computeTurnHash(turnId, questionText, intent, committedAt);

  const rawTurn: CommittedInterviewTurn = {
    turnId,
    questionText,
    rawTranscript,
    committedAt,
    intent,
    questionShape: shape,
    entities: params.entities ? [...params.entities] : [],
    numericFacts: params.numericFacts ? [...params.numericFacts] : [],
    scenarioConstraints: params.scenarioConstraints ? { ...params.scenarioConstraints } : undefined,
    parentTurnId: params.parentTurnId ?? params.followUpContext?.previousTurnId,
    followUpContext: params.followUpContext ? { ...params.followUpContext } : undefined,
    practitionerReferences: params.practitionerReferences ? [...params.practitionerReferences] : undefined,
    hash
  };

  return deepFreeze(rawTurn);
}
