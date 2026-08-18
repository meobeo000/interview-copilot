import { describe, expect, it } from "vitest";

export interface EvaluatorFollowUpCase {
  id: string;
  question: string;
  isInvalidTestDesign?: boolean;
  contextResolved: boolean;
  intentCorrect: boolean;
  contractCorrect: boolean;
}

export function computeFollowUpMetrics(cases: EvaluatorFollowUpCase[]): {
  totalFollowUps: number;
  validFollowUps: number;
  invalidFollowUps: number;
  passedValidFollowUps: number;
  followUpAccuracy: number;
} {
  const totalFollowUps = cases.length;
  const invalidCases = cases.filter((c) => c.isInvalidTestDesign);
  const validCases = cases.filter((c) => !c.isInvalidTestDesign);

  const invalidFollowUps = invalidCases.length;
  const validFollowUps = validCases.length;

  const passedValidFollowUps = validCases.filter(
    (c) => c.contextResolved && c.intentCorrect && c.contractCorrect
  ).length;

  const followUpAccuracy = validFollowUps > 0 ? (passedValidFollowUps / validFollowUps) * 100 : 100;

  return {
    totalFollowUps,
    validFollowUps,
    invalidFollowUps,
    passedValidFollowUps,
    followUpAccuracy
  };
}

describe("Follow-Up Evaluator Denominator Accounting", () => {
  it("excludes INVALID_TEST_DESIGN cases from denominator without polluting accuracy", () => {
    const testCases: EvaluatorFollowUpCase[] = [
      { id: "T11", question: "Vì sao?", contextResolved: true, intentCorrect: true, contractCorrect: true },
      { id: "T13", question: "Tại sao?", contextResolved: true, intentCorrect: true, contractCorrect: true },
      { id: "T14", question: "Tín hiệu nào?", contextResolved: true, intentCorrect: true, contractCorrect: true },
      { id: "T16", question: "Khi nào em dừng?", contextResolved: true, intentCorrect: true, contractCorrect: true },
      { id: "T17", question: "Nếu vẫn không lên thì sao?", contextResolved: true, intentCorrect: true, contractCorrect: true },
      { id: "T19", question: "Còn PBN?", contextResolved: true, intentCorrect: true, contractCorrect: true },
      { id: "T20", question: "Còn canonical?", isInvalidTestDesign: true, contextResolved: true, intentCorrect: true, contractCorrect: true }
    ];

    const metrics = computeFollowUpMetrics(testCases);

    expect(metrics.totalFollowUps).toBe(7);
    expect(metrics.invalidFollowUps).toBe(1);
    expect(metrics.validFollowUps).toBe(6);
    expect(metrics.passedValidFollowUps).toBe(6);
    expect(metrics.followUpAccuracy).toBe(100);
  });
});
