import type { QuestionIntentCategory } from "./intentClassifier";

export interface ScenarioFact {
  key: string;
  value: string | number | boolean;
  sourceTurnId: string;
}

export interface ScenarioNode {
  scenarioId: string;
  topic: string;
  rootTurnId: string;
  turnIds: string[];
  scenarioEntities: string[];
  scenarioFacts: Record<string, ScenarioFact>;
  isClosed: boolean;
  createdAt: number;
  closedAt?: number;
}

export interface TurnGraphNode {
  turnId: string;
  scenarioId: string;
  parentTurnId?: string;
  referencedTurns: string[];
  intent: QuestionIntentCategory;
  questionText: string;
  entities: string[];
  numericFacts: string[];
  isTopicSwitch: boolean;
  timestamp: number;
}

export interface TopicSwitchBoundary {
  fromScenarioId: string;
  toScenarioId: string;
  fromTopic: string;
  toTopic: string;
  boundaryTurnId: string;
  detectedAt: number;
  reason: string;
}

export interface BoundedContextPayload {
  scenarioId: string;
  currentTurnId: string;
  parentTurnId?: string;
  referencedTurns: string[];
  scenarioTopic: string;
  inheritedEntities: string[];
  inheritedFacts: Record<string, string | number | boolean>;
  isTopicSwitch: boolean;
  topicSwitchBoundary?: TopicSwitchBoundary;
}

/**
 * InterviewContextGraph manages the relational structure of turns, scenarios,
 * reference resolutions, and strict topic-switch isolation boundaries.
 */
export class InterviewContextGraph {
  private scenarios = new Map<string, ScenarioNode>();
  private turns = new Map<string, TurnGraphNode>();
  private topicBoundaries: TopicSwitchBoundary[] = [];
  private activeScenarioId: string | null = null;

  /**
   * Registers a turn into the context graph, determining scenario membership,
   * reference links, or topic switch boundaries.
   */
  registerTurn(params: {
    turnId: string;
    questionText: string;
    intent: QuestionIntentCategory;
    entities?: readonly string[];
    numericFacts?: readonly string[];
    isFollowUp?: boolean;
    parentTurnId?: string;
    referencedTurns?: readonly string[];
  }): TurnGraphNode {
    const {
      turnId,
      questionText,
      intent,
      entities = [],
      numericFacts = [],
      isFollowUp = false,
      parentTurnId,
      referencedTurns = []
    } = params;

    const timestamp = Date.now();
    let scenarioId: string;
    let isTopicSwitch = false;

    const activeScenario = this.activeScenarioId ? this.scenarios.get(this.activeScenarioId) : null;

    if (isFollowUp && activeScenario && !activeScenario.isClosed) {
      // 1. Follow-up continues current scenario
      scenarioId = activeScenario.scenarioId;
      activeScenario.turnIds.push(turnId);
      for (const ent of entities) {
        if (!activeScenario.scenarioEntities.includes(ent)) {
          activeScenario.scenarioEntities.push(ent);
        }
      }
      for (const fact of numericFacts) {
        activeScenario.scenarioFacts[`num_${fact}`] = {
          key: `num_${fact}`,
          value: fact,
          sourceTurnId: turnId
        };
      }
    } else {
      // 2. Either initial turn or Topic Switch: start new scenario
      if (activeScenario && !activeScenario.isClosed) {
        activeScenario.isClosed = true;
        activeScenario.closedAt = timestamp;
        isTopicSwitch = true;
      }

      scenarioId = `scenario_${intent.toLowerCase()}_${turnId.slice(0, 8)}`;
      const newScenario: ScenarioNode = {
        scenarioId,
        topic: intent,
        rootTurnId: turnId,
        turnIds: [turnId],
        scenarioEntities: [...entities],
        scenarioFacts: {},
        isClosed: false,
        createdAt: timestamp
      };

      for (const fact of numericFacts) {
        newScenario.scenarioFacts[`num_${fact}`] = {
          key: `num_${fact}`,
          value: fact,
          sourceTurnId: turnId
        };
      }

      this.scenarios.set(scenarioId, newScenario);

      if (isTopicSwitch && activeScenario) {
        const boundary: TopicSwitchBoundary = {
          fromScenarioId: activeScenario.scenarioId,
          toScenarioId: scenarioId,
          fromTopic: activeScenario.topic,
          toTopic: intent,
          boundaryTurnId: turnId,
          detectedAt: timestamp,
          reason: `Topic switched from ${activeScenario.topic} to ${intent}`
        };
        this.topicBoundaries.push(boundary);
      }

      this.activeScenarioId = scenarioId;
    }

    const resolvedParent = isFollowUp ? parentTurnId || activeScenario?.turnIds[activeScenario.turnIds.length - 2] : undefined;
    const resolvedReferences = [...referencedTurns];
    if (resolvedParent && !resolvedReferences.includes(resolvedParent)) {
      resolvedReferences.push(resolvedParent);
    }

    const node: TurnGraphNode = {
      turnId,
      scenarioId,
      parentTurnId: resolvedParent,
      referencedTurns: resolvedReferences,
      intent,
      questionText,
      entities: [...entities],
      numericFacts: [...numericFacts],
      isTopicSwitch,
      timestamp
    };

    this.turns.set(turnId, node);
    return node;
  }

  /**
   * Resolves bounded context for LLM prompt generation without leaking old scenario facts.
   */
  getBoundedContext(turnId: string): BoundedContextPayload | null {
    const turn = this.turns.get(turnId);
    if (!turn) return null;

    const scenario = this.scenarios.get(turn.scenarioId);
    if (!scenario) return null;

    // Isolate facts to ONLY this scenario
    const rawFacts: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(scenario.scenarioFacts)) {
      rawFacts[k] = v.value;
    }

    const latestBoundary = this.topicBoundaries.find((b) => b.toScenarioId === scenario.scenarioId && b.boundaryTurnId === turnId);

    return {
      scenarioId: scenario.scenarioId,
      currentTurnId: turnId,
      parentTurnId: turn.parentTurnId,
      referencedTurns: turn.referencedTurns,
      scenarioTopic: scenario.topic,
      inheritedEntities: [...scenario.scenarioEntities],
      inheritedFacts: rawFacts,
      isTopicSwitch: turn.isTopicSwitch,
      topicSwitchBoundary: latestBoundary
    };
  }

  /**
   * Gets a specific turn node by turnId.
   */
  getTurn(turnId: string): TurnGraphNode | undefined {
    return this.turns.get(turnId);
  }

  /**
   * Gets a scenario by scenarioId.
   */
  getScenario(scenarioId: string): ScenarioNode | undefined {
    return this.scenarios.get(scenarioId);
  }

  /**
   * Returns all recorded topic boundaries.
   */
  getTopicBoundaries(): TopicSwitchBoundary[] {
    return [...this.topicBoundaries];
  }

  /**
   * Clears the graph state (e.g. on session reset).
   */
  reset(): void {
    this.scenarios.clear();
    this.turns.clear();
    this.topicBoundaries = [];
    this.activeScenarioId = null;
  }
}
