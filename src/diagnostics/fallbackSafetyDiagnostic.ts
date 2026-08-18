import { buildSafeFallbackAnswer, validateFallbackAnswer } from "../llm/fallbackAnswerBuilder";
import { buildAnswerContract } from "../llm/answerContract";
import { DEFAULT_CANDIDATE_PROFILE } from "../shared/candidateProfile";
import type { ScenarioConstraints } from "../question-detector/scenarioConstraints";

import type { QuestionIntentCategory } from "../question-detector/intentClassifier";

interface FallbackDiagnosticCase {
  id: string;
  name: string;
  question: string;
  intent: QuestionIntentCategory;
  scenarioConstraints?: ScenarioConstraints;
  failureType: "RATE_LIMIT" | "TIMEOUT" | "NETWORK_ERROR" | "STREAM_ERROR";
}

const FALLBACK_DIAGNOSTIC_CASES: FallbackDiagnosticCase[] = [
  {
    id: "CASE-A-BUDGET",
    name: "A. Budget Allocation 27M (Content, Entity, Guest Post, PBN)",
    question: "Tháng đầu tiên ngân sách 27 triệu, em phân bổ tiền cho Content, Entity, Guest Post và PBN thế nào?",
    intent: "BUDGET_ALLOCATION",
    failureType: "RATE_LIMIT"
  },
  {
    id: "CASE-B-RULED-OUT",
    name: "B. Ranking Drop with Ruled-out Causes (no Core Update, no manual action)",
    question: "10 money page tụt top nhưng không có Core Update và không bị manual action, em bóc tách lỗi gì trước?",
    intent: "GSC_RANKING_DROP",
    scenarioConstraints: {
      coreUpdateOccurred: false,
      manualAction: false,
      indexingIssue: false,
      provenance: []
    },
    failureType: "TIMEOUT"
  },
  {
    id: "CASE-C-NEGATIVE-SEO",
    name: "C. Negative SEO / Spam Backlink Wave (Disavow Caution)",
    question: "Website nhận 13.700 spam backlink từ 650 referring domain rác trong 3 ngày, em có disavow ngay không?",
    intent: "NEGATIVE_SEO",
    failureType: "NETWORK_ERROR"
  },
  {
    id: "CASE-D-PBN-TIMING",
    name: "D. PBN Timing on Signals",
    question: "Dàn site vệ tinh PBN thì đến giai đoạn nào site chính có traffic em mới triển khai?",
    intent: "PBN_TIMING",
    failureType: "STREAM_ERROR"
  },
  {
    id: "CASE-E-DOMAIN-SELECTION",
    name: "E. Domain Comparison (DR 68 0-traffic vs DR 31 3.5k traffic)",
    question: "Domain 1 DR 68 có 0 organic traffic, domain 2 DR 31 có 3.500 traffic. Em chọn domain nào?",
    intent: "DOMAIN_SELECTION",
    failureType: "RATE_LIMIT"
  },
  {
    id: "CASE-F-CANDIDATE-TRAP",
    name: "F. Candidate Experience Trap (150 PBN ownership inquiry)",
    question: "Em đã trực tiếp vận hành hệ thống 150 PBN private cho nhà cái nào trước đây và đem lại bao nhiêu tỷ doanh thu?",
    intent: "PROJECT_EXPERIENCE",
    failureType: "RATE_LIMIT"
  },
  {
    id: "CASE-G-GSC-GRID",
    name: "G. Numeric-heavy GSC Grid Diagnosis",
    question: "GSC báo traffic giảm 37%, CTR giảm từ 7.4% xuống 2.3%, position từ 4.1 xuống 9.6. Em đọc dữ liệu này thế nào?",
    intent: "GSC_RANKING_DROP",
    failureType: "TIMEOUT"
  },
  {
    id: "CASE-H-FOLLOW-UP",
    name: "H. Contextual Follow-Up (Tại sao?)",
    question: "Tại sao?",
    intent: "DOMAIN_SELECTION",
    failureType: "NETWORK_ERROR"
  }
];

export function runFallbackSafetyDiagnostic(): {
  totalCases: number;
  passedCases: number;
  candidateSafetyPassed: number;
  constraintCompliancePassed: number;
  numericContradictions: number;
  emptyAnswers: number;
} {
  console.log("\n============================================================");
  console.log("FALLBACK SAFETY & GROUNDING DIAGNOSTIC SUITE");
  console.log("============================================================\n");

  let passedCases = 0;
  let candidateSafetyPassed = 0;
  let constraintCompliancePassed = 0;
  let numericContradictions = 0;
  let emptyAnswers = 0;

  for (const c of FALLBACK_DIAGNOSTIC_CASES) {
    const contract = buildAnswerContract({
      question: c.question,
      intent: c.intent,
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });

    if (c.scenarioConstraints) {
      contract.scenarioConstraints = c.scenarioConstraints;
    }

    const fallback = buildSafeFallbackAnswer({
      contract,
      question: c.question,
      failureType: c.failureType
    });

    const val = validateFallbackAnswer(fallback, contract);

    if (!val.candidateSafetyViolation) candidateSafetyPassed++;
    if (!val.scenarioConstraintViolation) constraintCompliancePassed++;
    if (val.numericContradiction) numericContradictions++;
    if (val.emptyAnswer) emptyAnswers++;

    const casePassed = val.isValid;
    if (casePassed) passedCases++;

    console.log(`[${casePassed ? "PASS" : "FAIL"}] ${c.name}`);
    console.log(`   Failure Type: ${c.failureType} | Opening: "${fallback.openingLine}"`);
    if (val.violations.length > 0) {
      console.log(`   Violations: ${val.violations.join("; ")}`);
    }
  }

  console.log("\n============================================================");
  console.log("FALLBACK DIAGNOSTIC SUMMARY");
  console.log("============================================================");
  console.log(`Total Cases: ${FALLBACK_DIAGNOSTIC_CASES.length}`);
  console.log(`Passed: ${passedCases}/${FALLBACK_DIAGNOSTIC_CASES.length} (${(passedCases*100/FALLBACK_DIAGNOSTIC_CASES.length).toFixed(1)}%)`);
  console.log(`Candidate Safety: ${candidateSafetyPassed}/${FALLBACK_DIAGNOSTIC_CASES.length}`);
  console.log(`Constraint Compliance: ${constraintCompliancePassed}/${FALLBACK_DIAGNOSTIC_CASES.length}`);
  console.log(`Numeric Contradictions: ${numericContradictions}`);
  console.log(`Empty Answers: ${emptyAnswers}\n`);

  return {
    totalCases: FALLBACK_DIAGNOSTIC_CASES.length,
    passedCases,
    candidateSafetyPassed,
    constraintCompliancePassed,
    numericContradictions,
    emptyAnswers
  };
}

if (process.argv[1]?.includes("fallbackSafetyDiagnostic")) {
  const result = runFallbackSafetyDiagnostic();
  if (result.passedCases !== result.totalCases) {
    process.exit(1);
  }
}
