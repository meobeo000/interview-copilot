import { extractScenarioConstraints } from "../question-detector/scenarioConstraints";
import {
  InterviewTurnContextManager,
  type InterviewTurnContext
} from "../question-detector/interviewTurnContext";
import { resolveFollowUpContext } from "../question-detector/followUpDetector";
import { buildAnswerContract, formatContractForPrompt } from "../llm/answerContract";

interface SimulationResult {
  name: string;
  followUpType?: string;
  contextResolved: boolean;
  inheritedIntent?: string;
  entities: string[];
  numericFacts: string[];
  constraints: Record<string, unknown>;
  resolutionMs: number;
  passed: boolean;
  notes?: string;
}

export function runFollowUpContextDiagnostic(): { allPassed: boolean; results: SimulationResult[] } {
  console.log("\n========================================");
  console.log("PHASE 6.1 FOLLOW-UP CONTEXT DIAGNOSTIC");
  console.log("========================================\n");

  const results: SimulationResult[] = [];
  const manager = new InterviewTurnContextManager();

  // -------------------------------------------------------------------------
  // CASE 1: Negative SEO -> "Tại sao?"
  // -------------------------------------------------------------------------
  manager.reset();
  const case1PrevTurn: InterviewTurnContext = {
    turnId: "turn-1",
    question: "20.000 backlink spam xuất hiện nhưng ranking chỉ dao động nhẹ. Em có disavow ngay không?",
    intent: "NEGATIVE_SEO",
    answerType: "DIRECT_DECISION",
    entities: ["backlink", "negative SEO", "Ahrefs", "GSC"],
    numericFacts: ["20.000 backlink"],
    decision: {
      action: "Do not disavow immediately; inspect and monitor ranking impact first."
    },
    answerSummary: "Em chưa disavow ngay, em kiểm tra xem link spam đã index và ảnh hưởng ranking chưa.",
    committedAt: Date.now() - 5000
  };
  manager.recordCompletedTurn(case1PrevTurn);

  const case1FollowUp = resolveFollowUpContext("Tại sao?", manager.getPreviousCompletedContext(), "turn-1-followup");
  const case1Contract = buildAnswerContract({
    question: "Tại sao?",
    intent: case1FollowUp.inheritedIntent || "UNKNOWN",
    followUpContext: case1FollowUp
  });

  const case1Prompt = formatContractForPrompt(case1Contract);
  const pass1 =
    case1FollowUp.contextResolved === true &&
    case1FollowUp.followUpType === "WHY" &&
    case1FollowUp.inheritedIntent === "NEGATIVE_SEO" &&
    case1Prompt.includes("NEGATIVE_SEO") &&
    case1Prompt.includes("Do not disavow immediately");

  results.push({
    name: "1. Negative SEO -> Tại sao?",
    followUpType: case1FollowUp.followUpType,
    contextResolved: case1FollowUp.contextResolved,
    inheritedIntent: case1FollowUp.inheritedIntent,
    entities: case1FollowUp.inheritedEntities,
    numericFacts: case1FollowUp.inheritedNumericFacts,
    constraints: (case1FollowUp.inheritedConstraints as unknown as Record<string, unknown>) || {},
    resolutionMs: case1FollowUp.resolutionMs,
    passed: pass1
  });

  // -------------------------------------------------------------------------
  // CASE 2: Domain choice -> "Vì sao?"
  // -------------------------------------------------------------------------
  manager.reset();
  const case2PrevTurn: InterviewTurnContext = {
    turnId: "turn-2",
    question: "Domain A DR 55 traffic bằng 0, domain B DR 20 có traffic thật. Em chọn domain nào?",
    intent: "DOMAIN_SELECTION",
    answerType: "DIRECT_DECISION",
    entities: ["DR", "traffic", "expired domain"],
    numericFacts: ["DR: DR 55, DR 20", "dr:20,55"],
    decision: {
      choice: "domain B",
      action: "Em chọn domain B."
    },
    answerSummary: "Em chọn domain B vì có organic traffic thật và backlink tự nhiên.",
    committedAt: Date.now() - 5000
  };
  manager.recordCompletedTurn(case2PrevTurn);

  const case2FollowUp = resolveFollowUpContext("Vì sao?", manager.getPreviousCompletedContext(), "turn-2-followup");

  const pass2 =
    case2FollowUp.contextResolved === true &&
    case2FollowUp.inheritedIntent === "DOMAIN_SELECTION" &&
    case2FollowUp.inheritedNumericFacts.some((f) => f.includes("55") || f.includes("20")) &&
    case2FollowUp.previousDecision?.choice === "domain B";

  results.push({
    name: "2. Domain choice -> Vì sao?",
    followUpType: case2FollowUp.followUpType,
    contextResolved: case2FollowUp.contextResolved,
    inheritedIntent: case2FollowUp.inheritedIntent,
    entities: case2FollowUp.inheritedEntities,
    numericFacts: case2FollowUp.inheritedNumericFacts,
    constraints: (case2FollowUp.inheritedConstraints as unknown as Record<string, unknown>) || {},
    resolutionMs: case2FollowUp.resolutionMs,
    passed: pass2
  });

  // -------------------------------------------------------------------------
  // CASE 3: PBN timing -> "Tín hiệu nào?"
  // -------------------------------------------------------------------------
  manager.reset();
  const case3PrevTurn: InterviewTurnContext = {
    turnId: "turn-3",
    question: "Khoảng khi nào em bắt đầu đi PBN?",
    intent: "PBN_TIMING",
    answerType: "DIRECT_TIMING_EXPLANATION",
    entities: ["PBN", "indexing", "impression"],
    numericFacts: [],
    decision: {
      action: "Wait for indexing and impressions before building PBN."
    },
    answerSummary: "Ngày 10 không phải mốc cố định, em chờ site có tín hiệu index và impression trước khi đi PBN.",
    committedAt: Date.now() - 5000
  };
  manager.recordCompletedTurn(case3PrevTurn);

  const case3FollowUp = resolveFollowUpContext("Tín hiệu nào?", manager.getPreviousCompletedContext(), "turn-3-followup");
  const case3Contract = buildAnswerContract({
    question: "Tín hiệu nào?",
    intent: case3FollowUp.inheritedIntent || "UNKNOWN",
    followUpContext: case3FollowUp
  });

  const pass3 =
    case3FollowUp.contextResolved === true &&
    case3FollowUp.followUpType === "SIGNAL" &&
    case3FollowUp.inheritedIntent === "PBN_TIMING" &&
    case3Contract.answerType === "DIRECT_TIMING_EXPLANATION";

  results.push({
    name: "3. PBN timing -> Tín hiệu nào?",
    followUpType: case3FollowUp.followUpType,
    contextResolved: case3FollowUp.contextResolved,
    inheritedIntent: case3FollowUp.inheritedIntent,
    entities: case3FollowUp.inheritedEntities,
    numericFacts: case3FollowUp.inheritedNumericFacts,
    constraints: (case3FollowUp.inheritedConstraints as unknown as Record<string, unknown>) || {},
    resolutionMs: case3FollowUp.resolutionMs,
    passed: pass3
  });

  // -------------------------------------------------------------------------
  // CASE 4: No keyword -> "Nếu vẫn không lên thì sao?"
  // -------------------------------------------------------------------------
  manager.reset();
  const case4PrevTurn: InterviewTurnContext = {
    turnId: "turn-4",
    question: "Site index hai tuần nhưng chưa nhận keyword, em xử lý thế nào?",
    intent: "NO_KEYWORD_SIGNAL",
    answerType: "DIRECT_ACTION_DIAGNOSIS",
    entities: ["indexing", "keyword", "on-page", "internal link"],
    numericFacts: ["duration:2_tuần"],
    decision: {
      action: "check intent + on-page + internal link before building links"
    },
    answerSummary: "Em chưa đi thêm link ngay, em check lại indexing, on-page và internal link trước.",
    committedAt: Date.now() - 5000
  };
  manager.recordCompletedTurn(case4PrevTurn);

  const case4FollowUp = resolveFollowUpContext("Nếu vẫn không lên thì sao?", manager.getPreviousCompletedContext(), "turn-4-followup");
  const case4Contract = buildAnswerContract({
    question: "Nếu vẫn không lên thì sao?",
    intent: case4FollowUp.inheritedIntent || "UNKNOWN",
    followUpContext: case4FollowUp
  });

  const pass4 =
    case4FollowUp.contextResolved === true &&
    case4FollowUp.followUpType === "FAILURE_NEXT_STEP" &&
    case4FollowUp.inheritedIntent === "NO_KEYWORD_SIGNAL" &&
    case4Contract.answerType === "DIRECT_ACTION_DIAGNOSIS";

  results.push({
    name: "4. No keyword -> Nếu vẫn không lên thì sao?",
    followUpType: case4FollowUp.followUpType,
    contextResolved: case4FollowUp.contextResolved,
    inheritedIntent: case4FollowUp.inheritedIntent,
    entities: case4FollowUp.inheritedEntities,
    numericFacts: case4FollowUp.inheritedNumericFacts,
    constraints: (case4FollowUp.inheritedConstraints as unknown as Record<string, unknown>) || {},
    resolutionMs: case4FollowUp.resolutionMs,
    passed: pass4
  });

  // -------------------------------------------------------------------------
  // CASE 5: Budget -> "Còn PBN?"
  // -------------------------------------------------------------------------
  manager.reset();
  const case5PrevTurn: InterviewTurnContext = {
    turnId: "turn-5",
    question: "Budget 20 triệu em phân bổ Content, Entity, Guest Post và PBN thế nào?",
    intent: "BUDGET_ALLOCATION",
    answerType: "DIRECT_ALLOCATION",
    entities: ["Content", "Entity", "Guest Post", "PBN"],
    numericFacts: ["budget: 20 triệu", "budget:20000000:vnd"],
    decision: {
      action: "Phân bổ 8tr Content, 4tr Entity, 5tr Guest Post, 3tr PBN dự phòng."
    },
    answerSummary: "Với 20 triệu em chia khoảng 8tr Content, 4tr Entity, 5tr Guest Post và 3tr PBN.",
    committedAt: Date.now() - 5000
  };
  manager.recordCompletedTurn(case5PrevTurn);

  const case5FollowUp = resolveFollowUpContext("Còn PBN?", manager.getPreviousCompletedContext(), "turn-5-followup");

  const pass5 =
    case5FollowUp.contextResolved === true &&
    case5FollowUp.followUpType === "ENTITY_CONTINUATION" &&
    case5FollowUp.targetEntity === "PBN" &&
    case5FollowUp.inheritedIntent === "BUDGET_ALLOCATION" &&
    case5FollowUp.inheritedNumericFacts.some((f) => f.includes("20"));

  results.push({
    name: "5. Budget -> Còn PBN?",
    followUpType: case5FollowUp.followUpType,
    contextResolved: case5FollowUp.contextResolved,
    inheritedIntent: case5FollowUp.inheritedIntent,
    entities: case5FollowUp.inheritedEntities,
    numericFacts: case5FollowUp.inheritedNumericFacts,
    constraints: (case5FollowUp.inheritedConstraints as unknown as Record<string, unknown>) || {},
    resolutionMs: case5FollowUp.resolutionMs,
    passed: pass5
  });

  // -------------------------------------------------------------------------
  // CASE 6: Constrained ranking drop -> "Vậy bước tiếp theo là gì?"
  // -------------------------------------------------------------------------
  manager.reset();
  const constraints6 = extractScenarioConstraints(
    "Traffic giảm 40%. Không có Core Update. Không có manual action. Indexing và crawl bình thường. Referring domain không thay đổi. Em check gì?"
  );
  const case6PrevTurn: InterviewTurnContext = {
    turnId: "turn-6",
    question: "Traffic giảm 40%. Không có Core Update. Không có manual action. Indexing và crawl bình thường. Referring domain không thay đổi. Em check gì?",
    intent: "STRATEGY_PLAN",
    answerType: "DIRECT_ACTION_DIAGNOSIS",
    entities: ["traffic", "Core Update", "manual action", "indexing", "crawl", "referring domain"],
    numericFacts: ["metrics: 40%"],
    scenarioConstraints: constraints6,
    decision: {
      action: "Check search intent shift and competitor on-page optimization."
    },
    answerSummary: "Đầu tiên em check lại search intent và biến động từ khóa của đối thủ.",
    committedAt: Date.now() - 5000
  };
  manager.recordCompletedTurn(case6PrevTurn);

  const case6FollowUp = resolveFollowUpContext("Vậy bước tiếp theo là gì?", manager.getPreviousCompletedContext(), "turn-6-followup");
  const case6Contract = buildAnswerContract({
    question: "Vậy bước tiếp theo là gì?",
    intent: case6FollowUp.inheritedIntent || "UNKNOWN",
    followUpContext: case6FollowUp
  });

  const sc = case6Contract.scenarioConstraints;
  const pass6 =
    case6FollowUp.contextResolved === true &&
    sc?.coreUpdateOccurred === false &&
    sc?.manualAction === false &&
    sc?.indexingIssue === false &&
    sc?.crawlIssue === false &&
    sc?.referringDomainLoss === false &&
    sc?.trafficChangePercent === -40;

  results.push({
    name: "6. Constrained drop -> Vậy bước tiếp theo là gì?",
    followUpType: case6FollowUp.followUpType,
    contextResolved: case6FollowUp.contextResolved,
    inheritedIntent: case6FollowUp.inheritedIntent,
    entities: case6FollowUp.inheritedEntities,
    numericFacts: case6FollowUp.inheritedNumericFacts,
    constraints: (sc as unknown as Record<string, unknown>) || {},
    resolutionMs: case6FollowUp.resolutionMs,
    passed: pass6
  });

  // -------------------------------------------------------------------------
  // CASE 7: Fresh session -> "Tại sao?"
  // -------------------------------------------------------------------------
  manager.reset();
  const case7FollowUp = resolveFollowUpContext("Tại sao?", manager.getPreviousCompletedContext(), "turn-7-fresh");

  const pass7 =
    case7FollowUp.followUpType === "WHY" &&
    case7FollowUp.contextResolved === false &&
    case7FollowUp.inheritedIntent === undefined &&
    case7FollowUp.previousQuestion === undefined;

  results.push({
    name: "7. Fresh session -> Tại sao?",
    followUpType: case7FollowUp.followUpType,
    contextResolved: case7FollowUp.contextResolved,
    inheritedIntent: case7FollowUp.inheritedIntent,
    entities: case7FollowUp.inheritedEntities,
    numericFacts: case7FollowUp.inheritedNumericFacts,
    constraints: {},
    resolutionMs: case7FollowUp.resolutionMs,
    passed: pass7
  });

  // -------------------------------------------------------------------------
  // CASE 8: Context replacement
  // -------------------------------------------------------------------------
  manager.reset();
  // Turn A: Domain Selection
  manager.recordCompletedTurn({
    turnId: "turn-A",
    question: "Domain A hay domain B?",
    intent: "DOMAIN_SELECTION",
    entities: ["DR", "traffic"],
    numericFacts: ["DR: DR 55, DR 20"],
    decision: { choice: "domain B" },
    committedAt: Date.now() - 10000
  });

  // Turn B: Standalone Core Update question
  manager.recordCompletedTurn({
    turnId: "turn-B",
    question: "Sau một đợt Core Update organic traffic giảm 50%, em xử lý thế nào?",
    intent: "CORE_UPDATE_RECOVERY",
    entities: ["Core Update", "traffic"],
    numericFacts: ["metrics: 50%"],
    decision: { action: "Inspect query-level CTR and audit unhelpful content." },
    committedAt: Date.now() - 5000
  });

  // Turn C: "Tại sao?" -> Must refer strictly to Turn B (Core Update Recovery)
  const case8FollowUp = resolveFollowUpContext("Tại sao?", manager.getPreviousCompletedContext(), "turn-C");

  const pass8 =
    case8FollowUp.contextResolved === true &&
    case8FollowUp.previousTurnId === "turn-B" &&
    case8FollowUp.inheritedIntent === "CORE_UPDATE_RECOVERY" &&
    !case8FollowUp.inheritedEntities.includes("DR");

  results.push({
    name: "8. Context replacement -> Turn C refers only to Turn B",
    followUpType: case8FollowUp.followUpType,
    contextResolved: case8FollowUp.contextResolved,
    inheritedIntent: case8FollowUp.inheritedIntent,
    entities: case8FollowUp.inheritedEntities,
    numericFacts: case8FollowUp.inheritedNumericFacts,
    constraints: {},
    resolutionMs: case8FollowUp.resolutionMs,
    passed: pass8
  });

  // -------------------------------------------------------------------------
  // Print Diagnostic Summary
  // -------------------------------------------------------------------------
  let allPassed = true;
  for (const r of results) {
    console.log(`[TEST] ${r.name}`);
    console.log(`  followUpType: ${r.followUpType}`);
    console.log(`  contextResolved: ${r.contextResolved}`);
    console.log(`  inheritedIntent: ${r.inheritedIntent || "none"}`);
    console.log(`  entities: ${JSON.stringify(r.entities)}`);
    console.log(`  numericFacts: ${JSON.stringify(r.numericFacts)}`);
    console.log(`  constraints: ${JSON.stringify(r.constraints)}`);
    console.log(`  resolutionMs: ${r.resolutionMs} ms`);
    console.log(`  Status: ${r.passed ? "PASS" : "FAIL"}\n`);

    if (!r.passed) {
      allPassed = false;
    }
  }

  const maxResolutionMs = Math.max(...results.map((r) => r.resolutionMs));
  console.log(`Max resolution latency: ${maxResolutionMs.toFixed(2)} ms (< 5ms target: ${maxResolutionMs < 5 ? "PASS" : "WARN"})`);
  console.log(`OVERALL RESULT: ${allPassed ? "PASS" : "FAIL"}\n========================================\n`);

  return { allPassed, results };
}

if (typeof process !== "undefined" && import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "")) {
  const result = runFollowUpContextDiagnostic();
  if (!result.allPassed) {
    process.exit(1);
  }
}
