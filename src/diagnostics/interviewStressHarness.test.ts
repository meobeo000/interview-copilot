import { describe, expect, it } from "vitest";
import {
  runContinuousStressSession,
  INTERVIEW_STRESS_QUESTIONS
} from "./interviewStressHarness";

describe("Phase 5: Interview Stress Test Harness & Observability Tests", () => {
  it("runs the continuous 20-turn stress session and produces full telemetry", async () => {
    const { results, summary } = await runContinuousStressSession();

    // Verify 20 turns
    expect(results.length).toBe(20);
    expect(summary.totalTurns).toBe(20);
    expect(summary.committedQuestions).toBe(20);

    // Verify no turnId leakage (all unique)
    const turnIds = new Set(results.map((r) => r.turnId));
    expect(turnIds.size).toBe(20);

    // Verify zero duplicate commits & zero stale turn reuses
    expect(summary.duplicateCommitCount).toBe(0);
    expect(summary.staleTurnReuseCount).toBe(0);

    // Verify numeric integrity (DR55, 40%, position 3.2 are not corrupted to money)
    expect(summary.numericFactIntegrityRate).toBe(100);

    // Verify candidate experience safety is observed and reported
    expect(summary.candidateExperienceSafetyViolations).toBe(1);
    const q1 = results.find((r) => r.id === "Q1");
    expect(q1?.failureReasons.some((f) => f.includes("CANDIDATE_EXPERIENCE_VIOLATION"))).toBe(true);

    // Verify intent accuracy & AnswerContract accuracy baseline
    expect(summary.intentAccuracy).toBeGreaterThanOrEqual(75);
    expect(summary.answerContractAccuracy).toBeGreaterThanOrEqual(75);

    // Verify percentile calculations
    expect(summary.speechEndToCommit.median).toBe(0);
    expect(summary.speechEndToFirstVisible.p95).toBeGreaterThan(0);
  });

  it("evaluates Q2 (Budget Allocation) speculative replacement behavior", async () => {
    const { results } = await runContinuousStressSession();
    const q2 = results.find((r) => r.id === "Q2");

    expect(q2).toBeDefined();
    expect(q2?.detectedIntent).toBe("BUDGET_ALLOCATION");
    expect(q2?.actualAnswerType).toBe("DIRECT_ALLOCATION");
    expect(q2?.speculativeStarted).toBe(true);
    // As expected per Phase 4.1.1 rule: provisional had [Content], final had [Content, Entity, backlink, Guest Post, PBN]
    expect(q2?.speculativeReplaced).toBe(true);
    expect(q2?.failureReasons.some((f) => f.includes("SPECULATIVE_REPLACEMENT_COST"))).toBe(true);
  });

  it("evaluates Q8 (DR55 vs DR20) numeric fact integrity", async () => {
    const { results } = await runContinuousStressSession();
    const q8 = results.find((r) => r.id === "Q8");

    expect(q8).toBeDefined();
    expect(q8?.detectedIntent).toBe("DOMAIN_SELECTION");
    expect(q8?.actualAnswerType).toBe("DIRECT_DECISION");
    expect(q8?.normalizedFacts).toContain("dr:20,55");
    expect(q8?.normalizedFacts.some((f) => f.includes("triệu"))).toBe(false);
  });

  it("handles Q16 short follow-up ('Tại sao?') failure representation without crashing", async () => {
    const { results } = await runContinuousStressSession();
    const q16 = results.find((r) => r.id === "Q16");

    expect(q16).toBeDefined();
    expect(q16?.status).toBe("FAIL");
    expect(q16?.failureReasons).toContain("SHORT_FOLLOWUP_CONTEXT_NOT_RESOLVED");
  });

  it("handles Q17 interrupted restart without stale semantic evidence contamination", async () => {
    const { results } = await runContinuousStressSession();
    const q17 = results.find((r) => r.id === "Q17");

    expect(q17).toBeDefined();
    expect(q17?.status).toBe("PASS");
    expect(q17?.detectedIntent).toBe("GSC_RANKING_DROP");
  });

  it("verifies question definitions count matches exactly 20", () => {
    expect(INTERVIEW_STRESS_QUESTIONS.length).toBe(20);
    const qIds = INTERVIEW_STRESS_QUESTIONS.map((q) => q.id);
    expect(qIds).toEqual([
      "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10",
      "Q11", "Q12", "Q13", "Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20"
    ]);
  });
});
