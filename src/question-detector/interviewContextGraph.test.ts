import { describe, it, expect, beforeEach } from "vitest";
import { InterviewContextGraph } from "./interviewContextGraph";

describe("Phase 4: Interview Context Graph & Topic Switch Isolation", () => {
  let graph: InterviewContextGraph;

  beforeEach(() => {
    graph = new InterviewContextGraph();
  });

  it("creates a scenario node for initial turn and links subsequent follow-ups to the same scenario", () => {
    // Turn 1: Initial domain comparison question
    const turn1 = graph.registerTurn({
      turnId: "turn-01",
      questionText: "Em so sánh Domain A DR 55 traffic 0 vs Domain B DR 25 traffic 3000?",
      intent: "DOMAIN_SELECTION",
      entities: ["Domain A", "Domain B", "DR", "traffic"],
      numericFacts: ["55", "0", "25", "3000"]
    });

    expect(turn1.scenarioId).toBeDefined();
    expect(turn1.isTopicSwitch).toBe(false);

    // Turn 2: Follow-up question continuing the scenario
    const turn2 = graph.registerTurn({
      turnId: "turn-02",
      questionText: "Tại sao em không chọn con A?",
      intent: "DOMAIN_SELECTION",
      entities: ["Domain A"],
      isFollowUp: true,
      parentTurnId: "turn-01",
      referencedTurns: ["turn-01"]
    });

    expect(turn2.scenarioId).toBe(turn1.scenarioId);
    expect(turn2.parentTurnId).toBe("turn-01");
    expect(turn2.referencedTurns).toContain("turn-01");
    expect(turn2.isTopicSwitch).toBe(false);

    const scenario = graph.getScenario(turn1.scenarioId);
    expect(scenario?.turnIds).toEqual(["turn-01", "turn-02"]);
    expect(scenario?.scenarioEntities).toContain("Domain A");
    expect(scenario?.scenarioEntities).toContain("Domain B");
  });

  it("detects Topic Switch and strictly isolates old scenario facts from leaking into new scenario", () => {
    // Scenario 1: Domain Selection with DR 55 and budget 20 triệu
    const turn1 = graph.registerTurn({
      turnId: "turn-01",
      questionText: "Domain A DR 55 có nên mua với ngân sách hai mươi triệu?",
      intent: "DOMAIN_SELECTION",
      entities: ["Domain A", "DR 55"],
      numericFacts: ["55", "20000000"]
    });

    // Scenario 2: Topic switch to Negative SEO / Disavow
    const turn2 = graph.registerTurn({
      turnId: "turn-02",
      questionText: "Đối thủ bắn 5000 link spam casino thì em xử lý disavow như thế nào?",
      intent: "NEGATIVE_SEO",
      entities: ["link spam", "disavow"],
      numericFacts: ["5000"]
    });

    expect(turn2.isTopicSwitch).toBe(true);
    expect(turn2.scenarioId).not.toBe(turn1.scenarioId);

    const scenario1 = graph.getScenario(turn1.scenarioId);
    const scenario2 = graph.getScenario(turn2.scenarioId);

    expect(scenario1?.isClosed).toBe(true);
    expect(scenario2?.isClosed).toBe(false);

    // Verify bounded context for Scenario 2 does NOT leak Domain A or DR 55 facts
    const contextTurn2 = graph.getBoundedContext("turn-02");
    expect(contextTurn2?.scenarioTopic).toBe("NEGATIVE_SEO");
    expect(contextTurn2?.inheritedEntities).toEqual(["link spam", "disavow"]);
    expect(contextTurn2?.inheritedEntities).not.toContain("Domain A");
    expect(contextTurn2?.inheritedFacts["num_55"]).toBeUndefined();
    expect(contextTurn2?.inheritedFacts["num_20000000"]).toBeUndefined();
    expect(contextTurn2?.inheritedFacts["num_5000"]).toBe("5000");

    // Verify topic boundaries recorded
    const boundaries = graph.getTopicBoundaries();
    expect(boundaries.length).toBe(1);
    expect(boundaries[0].fromTopic).toBe("DOMAIN_SELECTION");
    expect(boundaries[0].toTopic).toBe("NEGATIVE_SEO");
    expect(boundaries[0].boundaryTurnId).toBe("turn-02");
  });

  it("correctly resolves multi-turn follow-up chains without exceeding minimal context", () => {
    graph.registerTurn({
      turnId: "t1",
      questionText: "Chiến lược PBN ngày thứ 10?",
      intent: "PBN_TIMING",
      entities: ["PBN", "ngày 10"],
      numericFacts: ["10"]
    });

    graph.registerTurn({
      turnId: "t2",
      questionText: "Tín hiệu nào từ GSC để đi link?",
      intent: "PBN_TIMING",
      entities: ["GSC", "impression"],
      isFollowUp: true,
      parentTurnId: "t1"
    });

    graph.registerTurn({
      turnId: "t3",
      questionText: "Nếu 2 tuần vẫn chưa có impression thì sao?",
      intent: "PBN_TIMING",
      entities: ["impression"],
      numericFacts: ["2"],
      isFollowUp: true,
      parentTurnId: "t2"
    });

    const ctx = graph.getBoundedContext("t3");
    expect(ctx?.scenarioTopic).toBe("PBN_TIMING");
    expect(ctx?.parentTurnId).toBe("t2");
    expect(ctx?.inheritedEntities).toContain("PBN");
    expect(ctx?.inheritedEntities).toContain("GSC");
    expect(ctx?.inheritedEntities).toContain("impression");
    expect(ctx?.inheritedFacts["num_10"]).toBe("10");
    expect(ctx?.inheritedFacts["num_2"]).toBe("2");
  });
});
