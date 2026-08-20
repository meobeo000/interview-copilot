import { describe, it, expect } from "vitest";
import { createCommittedTurn, computeTurnHash } from "./committedTurn";

describe("CommittedInterviewTurn Immutable Model", () => {
  it("creates an immutable, deep-frozen turn snapshot", () => {
    const turn = createCommittedTurn({
      turnId: "turn-test-1",
      questionText: "Domain A DR 55 traffic 0. Domain B DR 22 có traffic thật. Em chọn con nào?",
      rawTranscript: "Domain A DR 55 traffic 0 Domain B DR 22 co traffic that Em chon con nao",
      committedAt: 1700000000000,
      intent: "DOMAIN_SELECTION",
      entities: ["domain A", "domain B", "DR", "traffic"],
      numericFacts: ["55", "0", "22"],
      scenarioConstraints: {
        trafficChangePercent: 0,
        provenance: [
          {
            key: "trafficChangePercent",
            value: 0,
            sourceSnippet: "traffic 0",
            confidence: 1.0
          }
        ]
      }
    });

    expect(turn.turnId).toBe("turn-test-1");
    expect(turn.questionText).toBe("Domain A DR 55 traffic 0. Domain B DR 22 có traffic thật. Em chọn con nào?");
    expect(turn.intent).toBe("DOMAIN_SELECTION");
    expect(turn.questionShape).toBe("DECISION");
    expect(turn.entities).toEqual(["domain A", "domain B", "DR", "traffic"]);
    expect(turn.numericFacts).toEqual(["55", "0", "22"]);
    expect(turn.hash).toBeDefined();
    expect(turn.hash.length).toBeGreaterThan(0);

    // Assert deep immutability
    expect(Object.isFrozen(turn)).toBe(true);
    expect(Object.isFrozen(turn.entities)).toBe(true);
    expect(Object.isFrozen(turn.numericFacts)).toBe(true);
    if (turn.scenarioConstraints) {
      expect(Object.isFrozen(turn.scenarioConstraints)).toBe(true);
    }

    // Attempt mutation should throw in strict mode
    expect(() => {
      (turn as unknown as { questionText: string }).questionText = "Mutated question";
    }).toThrow();

    expect(() => {
      (turn.entities as string[]).push("hacked entity");
    }).toThrow();
  });

  it("produces deterministic hashes and changes on distinct content", () => {
    const hash1 = computeTurnHash("turn-1", "Em chọn domain nào?", "DOMAIN_SELECTION", 1000);
    const hash2 = computeTurnHash("turn-1", "Em chọn domain nào?", "DOMAIN_SELECTION", 1000);
    const hash3 = computeTurnHash("turn-2", "Em chọn domain nào?", "DOMAIN_SELECTION", 1000);
    const hash4 = computeTurnHash("turn-1", "Tại sao không chọn con A?", "DOMAIN_SELECTION", 1000);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).not.toBe(hash4);
  });

  it("classifies follow-up shape when followUpContext is resolved", () => {
    const turn = createCommittedTurn({
      turnId: "turn-followup-1",
      questionText: "Tại sao?",
      committedAt: 1700000000000,
      intent: "DOMAIN_SELECTION",
      parentTurnId: "turn-parent-1",
      followUpContext: {
        followUpType: "WHY",
        contextResolved: true,
        currentUtterance: "Tại sao?",
        previousTurnId: "turn-parent-1",
        previousQuestion: "Domain A hay B?",
        inheritedIntent: "DOMAIN_SELECTION",
        inheritedEntities: ["domain A", "domain B"],
        inheritedNumericFacts: ["DR 55", "DR 22"],
        resolutionMs: 1
      }
    });

    expect(turn.questionShape).toBe("SIGNAL_REQUEST");
    expect(turn.parentTurnId).toBe("turn-parent-1");
    expect(turn.followUpContext?.contextResolved).toBe(true);
  });
});
