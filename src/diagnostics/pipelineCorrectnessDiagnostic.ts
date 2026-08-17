import { QuestionCommitGate } from "../question-detector/questionCommitGate";
import { hasUnicodeToken, matchUnicodePattern } from "../shared/semanticTextMatcher";
import { extractScenarioConstraints } from "../question-detector/scenarioConstraints";
import { classifyQuestionIntent, calculateIntentScores } from "../question-detector/intentClassifier";
import { SemanticEvidenceAccumulator } from "../question-detector/semanticEvidence";
import { SmartQuestionDetector, type QuestionCandidate } from "../question-detector/smartQuestionDetector";
import { buildAnswerContract, formatContractForPrompt, validateAnswerConstraints } from "../llm/answerContract";

export async function runPipelineCorrectnessDiagnostic(): Promise<void> {
  const startTotal = performance.now();

  console.log("\n========================================");
  console.log("PHASE 6.0 PIPELINE CORRECTNESS");
  console.log("========================================\n");

  // 1. Fragment commit
  const fragGate = QuestionCommitGate.evaluate("dựa trên tín hiệu từ GSC");
  const fragCommitPass = fragGate.decision === "HOLD_FRAGMENT" && !fragGate.isCompleteQuestion;
  console.log(`Fragment commit:\n${fragCommitPass ? "PASS" : "FAIL"}\n`);

  // 2. Fragment continuation
  const detector = new SmartQuestionDetector();
  let committedCandidate: QuestionCandidate | null = null;
  detector.triggerSpeechFinal("dựa trên tín hiệu từ GSC", (cand) => {
    committedCandidate = cand;
  });
  const holdPass = committedCandidate === null;

  const fullMerged = "dựa trên tín hiệu từ GSC thì khi nào em quyết định tăng PBN?";
  detector.triggerSpeechFinal(fullMerged, (cand) => {
    committedCandidate = cand;
  });
  const fragContinuationPass =
    holdPass &&
    committedCandidate !== null &&
    (committedCandidate as QuestionCandidate).text === fullMerged;
  console.log(`Fragment continuation:\n${fragContinuationPass ? "PASS" : "FAIL"}\n`);

  // 3. Short question recognition
  const shortQ1 = QuestionCommitGate.evaluate("Tại sao?");
  const shortQ2 = QuestionCommitGate.evaluate("Vì sao?");
  const shortQ3 = QuestionCommitGate.evaluate("Em chọn domain nào?");
  const shortQPass = shortQ1.decision === "COMMIT" && shortQ2.decision === "COMMIT" && shortQ3.decision === "COMMIT";
  console.log(`Short question recognition:\n${shortQPass ? "PASS" : "FAIL"}\n`);

  // 4. Substring collision
  const collisionText = "em ưu tiên content chất lượng khi thấy site bắt đầu có inpression ổn định";
  const match = matchUnicodePattern(collisionText, "con\\s+[ab]|domain\\s+[ab]|site\\s+[ab]");
  const tokenMatch = hasUnicodeToken(collisionText, "site b");
  const collisionClassified = classifyQuestionIntent(collisionText);
  const collisionPass = match === null && !tokenMatch && collisionClassified.category !== "DOMAIN_SELECTION";
  console.log(`Substring collision:\n${collisionPass ? "PASS" : "FAIL"}\n`);

  // 5. Negation extraction
  const negText = "Site tụt nhưng không có Core Update và referring domain không thay đổi, indexing vẫn bình thường";
  const constraints = extractScenarioConstraints(negText);
  const negPass = constraints.coreUpdateOccurred === false && constraints.referringDomainLoss === false && constraints.indexingIssue === false;
  console.log(`Negation extraction:\n${negPass ? "PASS" : "FAIL"}\n`);

  // 6. Constraint preservation in AnswerContract & Prompt
  const accumulator = new SemanticEvidenceAccumulator();
  accumulator.appendFinal(negText);
  const state = accumulator.getState();
  const contract = buildAnswerContract({
    question: negText,
    semanticEvidence: state
  });
  const prompt = formatContractForPrompt(contract);
  const constraintPreservePass = prompt.includes("coreUpdateOccurred = false") && prompt.includes("indexingIssue = false");
  console.log(`Constraint preservation:\n${constraintPreservePass ? "PASS" : "FAIL"}\n`);

  // 7. Intent negation safety
  const negSeoText = "Ranking giảm nhưng em đã kiểm tra và không phải negative SEO, em check gì tiếp?";
  const negScores = calculateIntentScores(negSeoText);
  const negSeoScore = negScores.find((s) => s.category === "NEGATIVE_SEO")?.totalScore || 0;
  const intentNegationPass = negSeoScore === 0;
  console.log(`Intent negation safety:\n${intentNegationPass ? "PASS" : "FAIL"}\n`);

  // 8. Core Update regression
  const coreUpdateQ = `Site đang giữ top 3 cho nhiều keyword.
Sau một đợt Core Update organic traffic giảm khoảng 50%.
Impression chỉ giảm nhẹ 10%.
CTR giảm mạnh.
Referring domain không thay đổi.
Không có manual action.
Không có lỗi index hay crawl.
Trong 24 giờ đầu em làm gì?`;
  const coreAcc = new SemanticEvidenceAccumulator();
  coreAcc.appendFinal(coreUpdateQ);
  const coreState = coreAcc.getState();
  const coreContract = buildAnswerContract({
    question: coreUpdateQ,
    semanticEvidence: coreState
  });
  const corePass =
    coreState.scenarioConstraints?.coreUpdateOccurred === true &&
    coreState.scenarioConstraints?.trafficChangePercent === -50 &&
    coreState.scenarioConstraints?.referringDomainLoss === false &&
    coreState.scenarioConstraints?.indexingIssue === false &&
    coreContract.answerType === "DIRECT_ACTION_DIAGNOSIS";
  console.log(`Core Update regression:\n${corePass ? "PASS" : "FAIL"}\n`);

  // 9. No-Core-Update regression
  const noCoreQ = `10 money page cùng lúc từ top 5 tụt xuống top 15.
Informational page vẫn giữ traffic.
Backlink không mất.
Không có Core Update.
Em check gì trước?`;
  const noCoreAcc = new SemanticEvidenceAccumulator();
  noCoreAcc.appendFinal(noCoreQ);
  const noCoreState = noCoreAcc.getState();
  const noCoreContract = buildAnswerContract({
    question: noCoreQ,
    semanticEvidence: noCoreState
  });
  const noCorePass = noCoreState.scenarioConstraints?.coreUpdateOccurred === false && noCoreContract.intent !== "CORE_UPDATE_RECOVERY";
  console.log(`No-Core-Update regression:\n${noCorePass ? "PASS" : "FAIL"}\n`);

  // 10. Constraint ignored detector
  const badAnswer = "Đầu tiên em check indexing và kiểm tra crawl xem có bị lỗi sitemap hay robots.txt không.";
  const validationBad = validateAnswerConstraints(badAnswer, contract);
  const goodAnswer = "Với case này em kiểm tra ngay biến động search intent và cấu trúc internal link từ informational page.";
  const validationGood = validateAnswerConstraints(goodAnswer, contract);
  const detectorPass = !validationBad.isValid && validationGood.isValid;
  console.log(`Constraint ignored detector:\n${detectorPass ? "PASS" : "FAIL"}\n`);

  const totalDurationMs = Math.round((performance.now() - startTotal) * 100) / 100;
  console.log(`Processing overhead:\n${totalDurationMs} ms\n`);
  console.log("========================================\n");
}

if (typeof require !== "undefined" && require.main === module) {
  void runPipelineCorrectnessDiagnostic();
}
