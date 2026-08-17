import { describe, it, expect } from "vitest";
import { QuestionCommitGate } from "../question-detector/questionCommitGate";
import { hasUnicodeToken, matchUnicodePattern } from "../shared/semanticTextMatcher";
import { extractScenarioConstraints } from "../question-detector/scenarioConstraints";
import { classifyQuestionIntent, calculateIntentScores } from "../question-detector/intentClassifier";
import { SemanticEvidenceAccumulator } from "../question-detector/semanticEvidence";
import { SmartQuestionDetector, type QuestionCandidate } from "../question-detector/smartQuestionDetector";
import { buildAnswerContract, formatContractForPrompt, validateAnswerConstraints } from "../llm/answerContract";

describe("Phase 6.0: Real Interview Pipeline Correctness", () => {
  // A. Fragment speech_final held
  it("A: holds fragment when utterance is an incomplete speech fragment", () => {
    const fragment = "dựa trên tín hiệu từ GSC";
    const gateEval = QuestionCommitGate.evaluate(fragment);
    expect(gateEval.decision).toBe("HOLD_FRAGMENT");
    expect(gateEval.isCompleteQuestion).toBe(false);
  });

  // B. Fragment + continuation becomes one question
  it("B: fragment + continuation reassembles into a complete question that commits", () => {
    const detector = new SmartQuestionDetector();
    let committedCandidate: QuestionCandidate | null = null;

    // First fragment arrives and ends with speech_final
    detector.triggerSpeechFinal("dựa trên tín hiệu từ GSC", (cand) => {
      committedCandidate = cand;
    });
    expect(committedCandidate).toBeNull();

    // Continuation arrives and merges with previous segment
    const fullMerged = "dựa trên tín hiệu từ GSC thì khi nào em quyết định tăng PBN?";
    detector.triggerSpeechFinal(fullMerged, (cand) => {
      committedCandidate = cand;
    });

    expect(committedCandidate).not.toBeNull();
    const cand = committedCandidate as QuestionCandidate | null;
    expect(cand?.text).toBe(fullMerged);
    expect(cand?.isComplete).toBe(true);
  });

  // C. Short question recognition
  it("C: 'Tại sao?' remains a valid short question", () => {
    const shortQ = "Tại sao?";
    const gateEval = QuestionCommitGate.evaluate(shortQ);
    expect(gateEval.decision).toBe("COMMIT");
    expect(gateEval.isCompleteQuestion).toBe(true);

    const gateEval2 = QuestionCommitGate.evaluate("Vì sao?");
    expect(gateEval2.decision).toBe("COMMIT");

    const gateEval3 = QuestionCommitGate.evaluate("Em chọn domain nào?");
    expect(gateEval3.decision).toBe("COMMIT");
  });

  // D. Substring collision eliminated
  it("D: eliminates substring collisions like 'site bắt đầu' matching 'site b'", () => {
    const text = "em ưu tiên content chất lượng khi thấy site bắt đầu có inpression ổn định";
    const match = matchUnicodePattern(text, "con\\s+[ab]|domain\\s+[ab]|site\\s+[ab]");
    expect(match).toBeNull();

    const tokenMatch = hasUnicodeToken(text, "site b");
    expect(tokenMatch).toBe(false);

    // Intent classifier should NOT classify as DOMAIN_SELECTION
    const classified = classifyQuestionIntent(text);
    expect(classified.category).not.toBe("DOMAIN_SELECTION");
  });

  // E. Negated Core Update
  it("E: 'không có Core Update' correctly extracts coreUpdateOccurred = false and zeros out CORE_UPDATE_RECOVERY", () => {
    const text = "Site tụt nhưng không có Core Update thì em kiểm tra gì?";
    const constraints = extractScenarioConstraints(text);
    expect(constraints.coreUpdateOccurred).toBe(false);

    const scores = calculateIntentScores(text);
    const coreUpdateScore = scores.find((s) => s.category === "CORE_UPDATE_RECOVERY")?.totalScore || 0;
    expect(coreUpdateScore).toBe(0);
  });

  // F. Confirmed Core Update
  it("F: 'sau Core Update' correctly extracts coreUpdateOccurred = true", () => {
    const text = "Sau Core Update organic traffic giảm 50% em khắc phục thế nào?";
    const constraints = extractScenarioConstraints(text);
    expect(constraints.coreUpdateOccurred).toBe(true);
  });

  // G. Referring domain / backlink regressions
  it("G: evaluates referringDomainLoss correctly across positive, negative, and neutral statements", () => {
    // A. Neutral statement with change
    const textA = "Site tụt traffic và backlink profile có thay đổi";
    const constraintsA = extractScenarioConstraints(textA);
    expect(constraintsA.referringDomainLoss).toBeUndefined();

    // B. Explicit negative statement
    const textB = "Referring domain không thay đổi";
    const constraintsB = extractScenarioConstraints(textB);
    expect(constraintsB.referringDomainLoss).toBe(false);

    // C. Explicit positive backlink loss
    const textC = "Site bị mất backlink";
    const constraintsC = extractScenarioConstraints(textC);
    expect(constraintsC.referringDomainLoss).toBe(true);

    // D. Backlink increase (neutral for loss)
    const textD = "Backlink tăng mạnh";
    const constraintsD = extractScenarioConstraints(textD);
    expect(constraintsD.referringDomainLoss).toBeUndefined();
  });

  // G2. QuestionCommitGate tightened long-clause fallback regressions
  it("G2: holds long declarative statements as fragments unless they contain question/request signals", () => {
    // Declarative statement without question predicate -> HOLD_FRAGMENT
    const declText = "Em tối ưu content để site có tín hiệu rồi sau đó tăng link";
    const declGate = QuestionCommitGate.evaluate(declText);
    expect(declGate.decision).toBe("HOLD_FRAGMENT");
    expect(declGate.isCompleteQuestion).toBe(false);

    // Same statement ending with question request -> COMMIT
    const qText = "Em tối ưu content để site có tín hiệu rồi sau đó em làm gì?";
    const qGate = QuestionCommitGate.evaluate(qText);
    expect(qGate.decision).toBe("COMMIT");
    expect(qGate.isCompleteQuestion).toBe(true);

    // Conditional question ending with question particle -> COMMIT
    const condQText = "Nếu site có impression rồi thì em tăng PBN ngay không?";
    const condQGate = QuestionCommitGate.evaluate(condQText);
    expect(condQGate.decision).toBe("COMMIT");
    expect(condQGate.isCompleteQuestion).toBe(true);
  });

  // H. Numeric percentage traffic drop
  it("H: 'traffic giảm 40%' extracts trafficDrop = true and percentage = -40", () => {
    const text = "Sau đợt update traffic giảm khoảng 40% em xử lý sao?";
    const constraints = extractScenarioConstraints(text);
    expect(constraints.trafficDrop).toBe(true);
    expect(constraints.trafficChangePercent).toBe(-40);
  });

  // I. Indexing normal constraint
  it("I: 'indexing vẫn bình thường' extracts indexingIssue = false", () => {
    const text = "Site tụt traffic nhưng indexing vẫn bình thường và không có lỗi crawl";
    const constraints = extractScenarioConstraints(text);
    expect(constraints.indexingIssue).toBe(false);
    expect(constraints.crawlIssue).toBe(false);
  });

  // J. Manual action negative constraint
  it("J: 'không có manual action' extracts manualAction = false", () => {
    const text = "Check GSC thấy không có manual action nào";
    const constraints = extractScenarioConstraints(text);
    expect(constraints.manualAction).toBe(false);
  });

  // K. Negated Negative SEO
  it("K: 'không phải negative SEO' extracts negativeSeo = false and prevents NEGATIVE_SEO intent", () => {
    const text = "Ranking giảm nhưng em đã kiểm tra và không phải negative SEO, em check gì tiếp?";
    const constraints = extractScenarioConstraints(text);
    expect(constraints.negativeSeo).toBe(false);

    const scores = calculateIntentScores(text);
    const negSeoScore = scores.find((s) => s.category === "NEGATIVE_SEO")?.totalScore || 0;
    expect(negSeoScore).toBe(0);
  });

  // L. Core Update Real-Session Comprehensive Case
  it("L: handles Core Update real-session multi-constraint prompt accurately", () => {
    const question = `Site đang giữ top 3 cho nhiều keyword.
Sau một đợt Core Update organic traffic giảm khoảng 50%.
Impression chỉ giảm nhẹ 10%.
CTR giảm mạnh.
Referring domain không thay đổi.
Không có manual action.
Không có lỗi index hay crawl.
Trong 24 giờ đầu em làm gì?`;

    const accumulator = new SemanticEvidenceAccumulator();
    accumulator.appendFinal(question);
    const state = accumulator.getState();

    expect(state.scenarioConstraints?.coreUpdateOccurred).toBe(true);
    expect(state.scenarioConstraints?.trafficDrop).toBe(true);
    expect(state.scenarioConstraints?.trafficChangePercent).toBe(-50);
    expect(state.scenarioConstraints?.ctrDrop).toBe(true);
    expect(state.scenarioConstraints?.referringDomainLoss).toBe(false);
    expect(state.scenarioConstraints?.manualAction).toBe(false);
    expect(state.scenarioConstraints?.indexingIssue).toBe(false);
    expect(state.scenarioConstraints?.crawlIssue).toBe(false);

    const contract = buildAnswerContract({
      question,
      semanticEvidence: state
    });

    expect(contract.answerType).toBe("DIRECT_ACTION_DIAGNOSIS");
    const promptDirectives = formatContractForPrompt(contract);
    expect(promptDirectives).toContain("indexingIssue = false");
    expect(promptDirectives).toContain("crawlIssue = false");
    expect(promptDirectives).toContain("referringDomainLoss = false");
  });

  // M. 10 Money-Page Drop WITHOUT Core Update
  it("M: 10 money-page drop WITHOUT Core Update routes to ranking/money page diagnosis not Core Update", () => {
    const question = `10 money page cùng lúc từ top 5 tụt xuống top 15.
Informational page vẫn giữ traffic.
Backlink không mất.
Không có Core Update.
Em check gì trước?`;

    const accumulator = new SemanticEvidenceAccumulator();
    accumulator.appendFinal(question);
    const state = accumulator.getState();

    expect(state.scenarioConstraints?.coreUpdateOccurred).toBe(false);
    expect(state.scenarioConstraints?.referringDomainLoss).toBe(false);
    expect(state.bestIntent).not.toBe("CORE_UPDATE_RECOVERY");

    const contract = buildAnswerContract({
      question,
      semanticEvidence: state
    });
    expect(contract.intent).not.toBe("CORE_UPDATE_RECOVERY");
  });

  // N. Constraint Validator catches generic indexing answer when indexing is ruled out
  it("N: validateAnswerConstraints catches generic indexing/crawl advice when ruled out", () => {
    const contract = buildAnswerContract({
      question: "Site tụt traffic nhưng indexing và crawl đều bình thường",
      semanticEvidence: {
        ...new SemanticEvidenceAccumulator().getState(),
        scenarioConstraints: {
          indexingIssue: false,
          crawlIssue: false,
          provenance: []
        }
      }
    });

    const badAnswer = "Đầu tiên em check indexing và kiểm tra crawl xem có bị lỗi sitemap hay robots.txt không.";
    const validation = validateAnswerConstraints(badAnswer, contract);
    expect(validation.isValid).toBe(false);
    expect(validation.violation).toContain("CONSTRAINT_IGNORED");
  });

  // O. Constraint Validator does NOT false-positive when indexing problem is actually present
  it("O: validateAnswerConstraints allows indexing troubleshooting when indexing is NOT ruled out", () => {
    const contract = buildAnswerContract({
      question: "Site 2 tuần bot vào nhưng chưa nhận index, em làm gì?",
      semanticEvidence: {
        ...new SemanticEvidenceAccumulator().getState(),
        scenarioConstraints: {
          indexingIssue: true,
          provenance: []
        }
      }
    });

    const goodAnswer = "Em kiểm tra lại cấu trúc URL và check indexing trên GSC xem có bị chặn crawl không.";
    const validation = validateAnswerConstraints(goodAnswer, contract);
    expect(validation.isValid).toBe(true);
  });
});
