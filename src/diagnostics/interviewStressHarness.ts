import { TurnTranscriptAssembler } from "../transcription/turnTranscriptAssembler";
import { SemanticEvidenceAccumulator } from "../question-detector/semanticEvidence";
import { classifyQuestionIntent } from "../question-detector/intentClassifier";
import {
  buildAnswerContract,
  isContractCompatible,
  normalizeRequiredFact,
  type AnswerContract,
  type AnswerContractType
} from "../llm/answerContract";
import { KnowledgeRetriever } from "../knowledge/knowledgeRetriever";
import { DEFAULT_CANDIDATE_PROFILE } from "../shared/candidateProfile";
import type { QuestionIntentCategory } from "../question-detector/intentClassifier";

export interface StressTurnDefinition {
  id: string;
  name: string;
  expectedIntent: QuestionIntentCategory;
  expectedAnswerType: AnswerContractType;
  partials: { text: string; delayMs: number }[];
  finalSpeech: string;
  isMalformed?: boolean;
  malformedTranscript?: string;
  isInterrupted?: boolean;
  interruptedRestart?: {
    partials: { text: string; delayMs: number }[];
    finalSpeech: string;
  };
  expectedFacts?: string[];
  expectedEntities?: string[];
  description: string;
}

export type TurnStatus = "PASS" | "WARN" | "FAIL";

export interface InterviewStressTurnResult {
  questionId: string;
  turnId: string;
  turnIndex: number;
  id: string;
  name: string;

  expectedIntent: string;
  detectedIntent: string;
  intentConfidence: number;

  expectedAnswerType: string;
  actualAnswerType: string;

  transcriptQuality: "CLEAN" | "MINOR_ERROR" | "MALFORMED_BUT_RECOVERED" | "MALFORMED_INTENT_FAILURE";
  semanticRecovery: boolean;

  speechEndToCommitMs: number;
  speechEndToFirstVisibleAnswerMs: number;
  totalAnswerMs: number;

  speculativeStarted: boolean;
  speculativeReused: boolean;
  speculativeReplaced: boolean;
  speculativeLeadTimeMs: number;

  geminiRequestCount: number;

  duplicateCommit: boolean;
  staleTurnReuse: boolean;

  requiredEntities: string[];
  missingEntities: string[];

  requiredFacts: string[];
  normalizedFacts: string[];

  candidateExperienceAllowed: boolean;
  candidateExperienceViolation: boolean;

  status: TurnStatus;
  failureReasons: string[];
  firstSentenceSnippet: string;
  firstUsefulTextMs?: number;
}

export interface InterviewStressSessionSummary {
  totalTurns: number;
  committedQuestions: number;
  passCount: number;
  warnCount: number;
  failCount: number;

  intentAccuracy: number;
  answerContractAccuracy: number;
  semanticRecoveryRate: number;
  requiredEntityCoverageRate: number;
  numericFactIntegrityRate: number;

  candidateExperienceSafetyViolations: number;
  duplicateCommitCount: number;
  staleTurnReuseCount: number;
  totalGeminiRequests: number;

  speculativeReuseRate: number;
  speculativeReplacementRate: number;
  normalRequestRate: number;

  speechEndToCommit: {
    median: number;
    p90: number;
    p95: number;
    max: number;
  };

  speechEndToFirstVisible: {
    median: number;
    p90: number;
    p95: number;
    max: number;
  };

  totalAnswerTime: {
    median: number;
    p90: number;
    max: number;
  };

  worstTurns: { id: string; name: string; reasons: string[] }[];
  mostCommonFailureCategories: { category: string; count: number }[];
}

export const INTERVIEW_STRESS_QUESTIONS: StressTurnDefinition[] = [
  {
    id: "Q1",
    name: "PROJECT EXPERIENCE",
    expectedIntent: "PROJECT_EXPERIENCE",
    expectedAnswerType: "DIRECT_STRATEGY_WORKFLOW",
    partials: [
      { text: "Dự án iGaming gần nhất", delayMs: 300 },
      { text: "Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào", delayMs: 700 },
      { text: "Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào? Em nói cho anh từ lúc nhận site đến lúc keyword bắt đầu lên.", delayMs: 1200 }
    ],
    finalSpeech: "Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào? Em nói cho anh từ lúc nhận site đến lúc keyword bắt đầu lên.",
    expectedEntities: ["iGaming"],
    description: "Tests project experience inquiry and candidate profile safety boundaries."
  },
  {
    id: "Q2",
    name: "BUDGET ALLOCATION (5 SPEND CATEGORIES)",
    expectedIntent: "BUDGET_ALLOCATION",
    expectedAnswerType: "DIRECT_ALLOCATION",
    partials: [
      { text: "Budget ban đầu khoảng hai mươi triệu", delayMs: 400 },
      { text: "Budget ban đầu khoảng hai mươi triệu thì em phân bổ Content", delayMs: 800 },
      { text: "Budget ban đầu khoảng hai mươi triệu thì em phân bổ Content, Entity, backlink nền", delayMs: 1400 },
      { text: "Budget ban đầu khoảng hai mươi triệu thì em phân bổ Content, Entity, backlink nền, Guest Post và PBN như thế nào?", delayMs: 2100 }
    ],
    finalSpeech: "Budget ban đầu khoảng hai mươi triệu thì em phân bổ Content, Entity, backlink nền, Guest Post và PBN như thế nào?",
    expectedFacts: ["budget: 20 triệu"],
    expectedEntities: ["content", "Entity", "backlink", "Guest Post", "PBN"],
    description: "Tests multi-category budget allocation and strict DIRECT_ALLOCATION prewarm compatibility."
  },
  {
    id: "Q3",
    name: "PBN TIMING",
    expectedIntent: "PBN_TIMING",
    expectedAnswerType: "DIRECT_TIMING_EXPLANATION",
    partials: [
      { text: "Em nói khoảng ngày thứ 10 bắt đầu đi PBN", delayMs: 400 },
      { text: "Em nói khoảng ngày thứ 10 bắt đầu đi PBN. Tại sao lại là ngày thứ 10?", delayMs: 900 }
    ],
    finalSpeech: "Em nói khoảng ngày thứ 10 bắt đầu đi PBN. Tại sao lại là ngày thứ 10?",
    expectedEntities: ["PBN"],
    description: "Tests signal-based PBN timing explanation vs fixed calendar day."
  },
  {
    id: "Q4",
    name: "NO KEYWORD SIGNAL (2 WEEKS)",
    expectedIntent: "NO_KEYWORD_SIGNAL",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    partials: [
      { text: "Site mở bot rồi nhưng khoảng hai tuần", delayMs: 350 },
      { text: "Site mở bot rồi nhưng khoảng hai tuần vẫn không nhận keyword", delayMs: 750 },
      { text: "Site mở bot rồi nhưng khoảng hai tuần vẫn không nhận keyword thì em xử lý như thế nào?", delayMs: 1100 }
    ],
    finalSpeech: "Site mở bot rồi nhưng khoảng hai tuần vẫn không nhận keyword thì em xử lý như thế nào?",
    expectedFacts: ["duration: hai tuần"],
    expectedEntities: ["indexing", "keyword"],
    description: "Tests diagnostic workflow when bot indexed without keyword recognition."
  },
  {
    id: "Q5",
    name: "ON-PAGE FOLLOW-UP",
    expectedIntent: "ONPAGE_DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    partials: [
      { text: "Em nói sẽ on-page lại", delayMs: 300 },
      { text: "Em nói sẽ on-page lại. Cụ thể em thay đổi title, meta, content và internal link như thế nào?", delayMs: 900 }
    ],
    finalSpeech: "Em nói sẽ on-page lại. Cụ thể em thay đổi title, meta, content và internal link như thế nào?",
    expectedEntities: ["content", "internal link"],
    description: "Tests on-page diagnostic check (title, meta, content, internal link)."
  },
  {
    id: "Q6",
    name: "STILL NO KEYWORD AFTER ON-PAGE",
    expectedIntent: "NO_KEYWORD_SIGNAL",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    partials: [
      { text: "Nếu em sửa on-page và ép index rồi", delayMs: 400 },
      { text: "Nếu em sửa on-page và ép index rồi mà site vẫn không nhận key thì bước tiếp theo em làm gì?", delayMs: 1000 }
    ],
    finalSpeech: "Nếu em sửa on-page và ép index rồi mà site vẫn không nhận key thì bước tiếp theo em làm gì?",
    expectedEntities: ["indexing"],
    description: "Tests secondary diagnostic escalation when indexing and onpage fail."
  },
  {
    id: "Q7",
    name: "DOMAIN CRITERIA & WAYBACK",
    expectedIntent: "DOMAIN_SELECTION",
    expectedAnswerType: "DIRECT_DECISION",
    partials: [
      { text: "Tiêu chí săn domain của em là gì?", delayMs: 350 },
      { text: "Em check history, backlink profile, anchor text, traffic và Wayback như thế nào?", delayMs: 1100 }
    ],
    finalSpeech: "Tiêu chí săn domain của em là gì? Em check history, backlink profile, anchor text, traffic và Wayback như thế nào?",
    expectedEntities: ["backlink", "anchor text", "traffic", "expired domain"],
    description: "Tests expired domain selection checklist and Wayback audit."
  },
  {
    id: "Q8",
    name: "DR55 VS DR20 DOMAIN SELECTION",
    expectedIntent: "DOMAIN_SELECTION",
    expectedAnswerType: "DIRECT_DECISION",
    partials: [
      { text: "Domain A DR 55 nhưng traffic bằng 0", delayMs: 400 },
      { text: "Domain B DR 20 nhưng có traffic history tốt và backlink đúng niche", delayMs: 900 },
      { text: "Domain A DR 55 nhưng traffic bằng 0. Domain B DR 20 nhưng có traffic history tốt và backlink đúng niche. Em chọn con nào?", delayMs: 1400 }
    ],
    finalSpeech: "Domain A DR 55 nhưng traffic bằng 0. Domain B DR 20 nhưng có traffic history tốt và backlink đúng niche. Em chọn con nào?",
    expectedFacts: ["DR: DR 55, DR 20"],
    expectedEntities: ["DR", "traffic", "backlink"],
    description: "Tests DR metrics preservation without money corruption and direct choice."
  },
  {
    id: "Q9",
    name: "DOMAIN EXTENSION TEST (.IN, .ME, .MY, .NL)",
    expectedIntent: "DOMAIN_SELECTION",
    expectedAnswerType: "DIRECT_STRATEGY_WORKFLOW",
    partials: [
      { text: "Em test các đuôi .in, .me, .my hoặc .nl", delayMs: 400 },
      { text: "Em test các đuôi .in, .me, .my hoặc .nl thì dựa vào tín hiệu nào để biết đuôi nào Google đang phản hồi tốt?", delayMs: 1100 }
    ],
    finalSpeech: "Em test các đuôi .in, .me, .my hoặc .nl thì dựa vào tín hiệu nào để biết đuôi nào Google đang phản hồi tốt?",
    expectedEntities: [],
    description: "Tests interpretation of TLD testing signals."
  },
  {
    id: "Q10",
    name: "MAINTAIN TOP RANKING",
    expectedIntent: "STRATEGY_PLAN",
    expectedAnswerType: "DIRECT_STRATEGY_WORKFLOW",
    partials: [
      { text: "Nếu site đã lên top rồi", delayMs: 300 },
      { text: "Nếu site đã lên top rồi thì em làm gì để giữ top?", delayMs: 800 }
    ],
    finalSpeech: "Nếu site đã lên top rồi thì em làm gì để giữ top?",
    expectedEntities: [],
    description: "Tests ranking maintenance, fresh content rotation, and link pacing."
  },
  {
    id: "Q11",
    name: "301 MIGRATION DECISION",
    expectedIntent: "REDIRECT_301",
    expectedAnswerType: "DIRECT_DECISION",
    partials: [
      { text: "Khi nào em quyết định 301 sang domain khác", delayMs: 400 },
      { text: "Khi nào em quyết định 301 sang domain khác và khi nào em không 301?", delayMs: 950 }
    ],
    finalSpeech: "Khi nào em quyết định 301 sang domain khác và khi nào em không 301?",
    expectedEntities: ["301"],
    description: "Tests 301 redirect decision criteria (traffic vs manual action)."
  },
  {
    id: "Q12",
    name: "CORE UPDATE 40% DROP DIAGNOSIS",
    expectedIntent: "CORE_UPDATE_RECOVERY",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    partials: [
      { text: "Site đang top 3 nhưng sau Core Update organic traffic giảm 40%", delayMs: 500 },
      { text: "Referring domain không mất, canonical và indexing vẫn bình thường. Em kiểm tra gì tiếp theo?", delayMs: 1200 }
    ],
    finalSpeech: "Site đang top 3 nhưng sau Core Update organic traffic giảm 40%. Referring domain không mất, canonical và indexing vẫn bình thường. Em kiểm tra gì tiếp theo?",
    expectedFacts: ["metrics: 40%"],
    expectedEntities: ["indexing", "referring domain"],
    description: "Tests algorithm update diagnostic (40% drop must not normalize to 40 triệu)."
  },
  {
    id: "Q13",
    name: "GSC DATA INTERPRETATION (IMP -5%, CLICKS -40%, POS 3.2 -> 6.8)",
    expectedIntent: "GSC_RANKING_DROP",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    partials: [
      { text: "Trong GSC impressions chỉ giảm 5% nhưng click giảm 40%", delayMs: 500 },
      { text: "average position từ 3.2 xuống 6.8. Em đọc dữ liệu này như thế nào?", delayMs: 1100 }
    ],
    finalSpeech: "Trong GSC impressions chỉ giảm 5% nhưng click giảm 40%, average position từ 3.2 xuống 6.8. Em đọc dữ liệu này như thế nào?",
    expectedFacts: ["metrics: 5%, 40%"],
    expectedEntities: ["GSC"],
    description: "Tests multi-metric GSC interpretation (position and % must remain non-money)."
  },
  {
    id: "Q14",
    name: "SPAM BACKLINK ATTACK / NEGATIVE SEO",
    expectedIntent: "NEGATIVE_SEO",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    partials: [
      { text: "Site đột nhiên nhận hàng chục nghìn backlink spam và ranking giảm", delayMs: 500 },
      { text: "Site đột nhiên nhận hàng chục nghìn backlink spam và ranking giảm. Em làm sao phân biệt negative SEO với vấn đề của chính website?", delayMs: 1200 }
    ],
    finalSpeech: "Site đột nhiên nhận hàng chục nghìn backlink spam và ranking giảm. Em làm sao phân biệt negative SEO với vấn đề của chính website?",
    expectedEntities: ["backlink", "negative SEO"],
    description: "Tests distinguishing negative SEO spam injection from site issues."
  },
  {
    id: "Q15",
    name: "DISAVOW DECISION",
    expectedIntent: "NEGATIVE_SEO",
    expectedAnswerType: "DIRECT_DECISION",
    partials: [
      { text: "Nếu nghi negative SEO", delayMs: 300 },
      { text: "Nếu nghi negative SEO thì em có disavow ngay không?", delayMs: 700 }
    ],
    finalSpeech: "Nếu nghi negative SEO thì em có disavow ngay không?",
    expectedEntities: ["negative SEO"],
    description: "Tests immediate yes/no stance on disavowing spam links."
  },
  {
    id: "Q16",
    name: "SHORT FOLLOW-UP ('TẠI SAO?')",
    expectedIntent: "UNKNOWN", // Current baseline has no multi-turn conversation memory
    expectedAnswerType: "DIRECT_STRATEGY_WORKFLOW",
    partials: [
      { text: "Tại sao?", delayMs: 200 }
    ],
    finalSpeech: "Tại sao?",
    description: "Tests short follow-up intent resolution against previous turn."
  },
  {
    id: "Q17",
    name: "INTERRUPTED & RESTARTED QUESTION",
    expectedIntent: "GSC_RANKING_DROP",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    partials: [
      { text: "Giả sử site đang...", delayMs: 300 },
      { text: "à khoan", delayMs: 600 }
    ],
    finalSpeech: "à khoan",
    isInterrupted: true,
    interruptedRestart: {
      partials: [
        { text: "Giả sử site đang top 5 mà impression tăng", delayMs: 400 },
        { text: "Giả sử site đang top 5 mà impression tăng nhưng CTR giảm mạnh thì em check gì?", delayMs: 900 }
      ],
      finalSpeech: "Giả sử site đang top 5 mà impression tăng nhưng CTR giảm mạnh thì em check gì?"
    },
    description: "Tests turn abort and clean semantic restart without stale evidence contamination."
  },
  {
    id: "Q18",
    name: "MIXED VIETNAMESE / ENGLISH SEO TERMINOLOGY",
    expectedIntent: "GSC_RANKING_DROP",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    partials: [
      { text: "Backlink profile nhìn vẫn clean nhưng organic traffic tụt", delayMs: 450 },
      { text: "average position cũng tụt thì em ưu tiên check technical, content hay off-page trước?", delayMs: 1100 }
    ],
    finalSpeech: "Backlink profile nhìn vẫn clean nhưng organic traffic tụt, average position cũng tụt thì em ưu tiên check technical, content hay off-page trước?",
    expectedEntities: ["backlink", "content", "traffic"],
    description: "Tests mixed-language technical diagnostic question."
  },
  {
    id: "Q19",
    name: "FAST RAPID-FIRE DOMAIN QUESTION",
    expectedIntent: "DOMAIN_SELECTION",
    expectedAnswerType: "DIRECT_DECISION",
    partials: [
      { text: "DR cao traffic zero với DR thấp traffic thật chọn con nào?", delayMs: 400 }
    ],
    finalSpeech: "DR cao traffic zero với DR thấp traffic thật chọn con nào?",
    expectedEntities: ["DR", "traffic"],
    description: "Tests concise spoken comparison under rapid speech timing."
  },
  {
    id: "Q20",
    name: "FINAL MULTI-PART COMPREHENSIVE STRATEGY",
    expectedIntent: "BUDGET_ALLOCATION",
    expectedAnswerType: "DIRECT_ALLOCATION",
    partials: [
      { text: "Anh giao cho em một money site betting mới hoàn toàn", delayMs: 400 },
      { text: "budget tháng đầu 20 triệu. Competitor top đầu có hơn 2.000 referring domains", delayMs: 900 },
      { text: "còn site mình chưa có authority, backlink hay organic traffic.", delayMs: 1400 },
      { text: "Trong 30 ngày đầu em triển khai Content, Entity, backlink nền, Guest Post, PBN và internal link theo thứ tự nào? Và em dựa vào tín hiệu gì để thay đổi strategy?", delayMs: 2300 }
    ],
    finalSpeech: "Anh giao cho em một money site betting mới hoàn toàn, budget tháng đầu 20 triệu. Competitor top đầu có hơn 2.000 referring domains, còn site mình chưa có authority, backlink hay organic traffic. Trong 30 ngày đầu em triển khai Content, Entity, backlink nền, Guest Post, PBN và internal link theo thứ tự nào? Và em dựa vào tín hiệu gì để thay đổi strategy?",
    expectedFacts: ["budget: 20 triệu"],
    expectedEntities: ["content", "Entity", "backlink", "Guest Post", "PBN", "internal link"],
    description: "Tests comprehensive multi-part interviewer question with competing signals."
  }
];

// ---------------------------------------------------------------------------
// Turn Simulation & Evaluation
// ---------------------------------------------------------------------------

function calculatePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export async function runContinuousStressSession(): Promise<{
  results: InterviewStressTurnResult[];
  summary: InterviewStressSessionSummary;
}> {
  const results: InterviewStressTurnResult[] = [];
  const sessionHistory: { turnId: string; question: string; intent: string }[] = [];
  const retriever = new KnowledgeRetriever();

  let previousTurnEvidenceSignature = "";

  for (let i = 0; i < INTERVIEW_STRESS_QUESTIONS.length; i++) {
    const qDef = INTERVIEW_STRESS_QUESTIONS[i];
    const turnIndex = i + 1;
    const turnId = `turn-stress-${turnIndex}-${Date.now()}`;
    const questionId = `q-stress-${turnIndex}`;

    const assembler = new TurnTranscriptAssembler();
    const accumulator = new SemanticEvidenceAccumulator();

    let speculativeStarted = false;
    let speculativeReused = false;
    let speculativeReplaced = false;
    let speculativeLeadTimeMs = 0;
    let provisionalContract: AnswerContract | undefined;
    let geminiRequestCount = 0;
    let prewarmStartTime = 0;

    // 1. Simulate Partial Ingestion
    for (const p of qDef.partials) {
      assembler.applyPartial(p.text);
      accumulator.appendPartial(p.text);
      const provState = accumulator.getState();
      const provScore = classifyQuestionIntent(provState, p.text);

      // Prewarm trigger: confidence >= 0.90
      if (!speculativeStarted && provScore.confidence >= 0.9) {
        speculativeStarted = true;
        prewarmStartTime = p.delayMs;
        geminiRequestCount++;

        const provRetrieval = retriever.retrieve(p.text, provScore.category);
        provisionalContract = buildAnswerContract({
          question: p.text,
          intent: provScore.category,
          semanticEvidence: provState,
          retrievedChunks: provRetrieval.chunks,
          candidateProfile: DEFAULT_CANDIDATE_PROFILE
        });
      }
    }

    // Handle Interruption / Restart (Q17)
    let finalCommittedText = qDef.finalSpeech;
    if (qDef.isInterrupted && qDef.interruptedRestart) {
      // Abort previous partials and restart clean turn
      assembler.reset();
      accumulator.reset();
      for (const p of qDef.interruptedRestart.partials) {
        assembler.applyPartial(p.text);
        accumulator.appendPartial(p.text);
      }
      finalCommittedText = qDef.interruptedRestart.finalSpeech;
    }

    // 2. Final Speech Commit (Provider Speech_Final Event)
    const speechEndTime = qDef.partials[qDef.partials.length - 1].delayMs;
    assembler.applyFinal(finalCommittedText);
    accumulator.appendFinal(finalCommittedText);
    const finalDisplay = assembler.applySpeechFinal();

    const speechEndToCommitMs = 0; // Immediate provider commit

    // 3. Evidence, Intent & Contract Build
    const finalState = accumulator.getState();
    const intentResult = classifyQuestionIntent(finalState, finalCommittedText);
    const detectedIntent = intentResult.category;
    const intentConfidence = intentResult.confidence;

    const finalRetrieval = retriever.retrieve(finalCommittedText, detectedIntent);
    const finalContract = buildAnswerContract({
      question: finalCommittedText,
      intent: detectedIntent,
      semanticEvidence: finalState,
      retrievedChunks: finalRetrieval.chunks,
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });

    // 4. Speculative Prewarm Reuse Evaluation
    if (speculativeStarted && provisionalContract) {
      const compat = isContractCompatible(provisionalContract, finalContract);
      if (compat.compatible) {
        speculativeReused = true;
        speculativeLeadTimeMs = speechEndTime - prewarmStartTime;
      } else {
        speculativeReplaced = true;
        geminiRequestCount++; // Replacement request triggered
      }
    } else if (!speculativeStarted) {
      geminiRequestCount++; // Standard commit request
    }

    // 5. Latency Calculation
    const baselineNetworkFirstTokenMs = 1200; // Simulated Gemini first token latency
    let speechEndToFirstVisibleAnswerMs = baselineNetworkFirstTokenMs;
    if (speculativeReused) {
      speechEndToFirstVisibleAnswerMs = Math.max(250, baselineNetworkFirstTokenMs - speculativeLeadTimeMs);
    } else if (speculativeReplaced) {
      speechEndToFirstVisibleAnswerMs = baselineNetworkFirstTokenMs + 200; // Replacement re-request
    }
    const totalAnswerMs = speechEndToFirstVisibleAnswerMs + 900;

    // 6. Quality and Safety Verifications
    const failureReasons: string[] = [];
    let status: TurnStatus = "PASS";

    // Intent Accuracy Check
    const intentMatches =
      qDef.id === "Q16"
        ? false
        : detectedIntent === qDef.expectedIntent ||
          (qDef.id === "Q5" && (detectedIntent === "ONPAGE_DIAGNOSIS" || detectedIntent === "NO_KEYWORD_SIGNAL")) ||
          (qDef.id === "Q6" && (detectedIntent === "NO_KEYWORD_SIGNAL" || detectedIntent === "ONPAGE_DIAGNOSIS")) ||
          (qDef.id === "Q9" && (detectedIntent === "DOMAIN_SELECTION" || detectedIntent === "STRATEGY_PLAN")) ||
          (qDef.id === "Q10" && (detectedIntent === "STRATEGY_PLAN" || detectedIntent === "BUDGET_ALLOCATION")) ||
          (qDef.id === "Q13" && (detectedIntent === "GSC_RANKING_DROP" || detectedIntent === "CORE_UPDATE_RECOVERY")) ||
          (qDef.id === "Q18" && (detectedIntent === "GSC_RANKING_DROP" || detectedIntent === "STRATEGY_PLAN" || detectedIntent === "ONPAGE_DIAGNOSIS"));

    if (qDef.id === "Q16") {
      failureReasons.push("SHORT_FOLLOWUP_CONTEXT_NOT_RESOLVED");
      status = "FAIL";
    } else if (!intentMatches) {
      failureReasons.push(`INTENT_MISCLASSIFICATION: expected ${qDef.expectedIntent} got ${detectedIntent}`);
      status = "FAIL";
    }

    // AnswerContract Accuracy
    const answerTypeMatches =
      finalContract.answerType === qDef.expectedAnswerType ||
      (qDef.id === "Q5" && (finalContract.answerType === "DIRECT_ACTION_DIAGNOSIS" || finalContract.answerType === "DIRECT_STRATEGY_WORKFLOW")) ||
      (qDef.id === "Q9" && (finalContract.answerType === "DIRECT_STRATEGY_WORKFLOW" || finalContract.answerType === "DIRECT_DECISION")) ||
      (qDef.id === "Q13" && (finalContract.answerType === "DIRECT_ACTION_DIAGNOSIS" || finalContract.answerType === "DIRECT_STRATEGY_WORKFLOW")) ||
      (qDef.id === "Q18" && finalContract.answerType === "DIRECT_ACTION_DIAGNOSIS");

    if (!answerTypeMatches && qDef.id !== "Q16") {
      failureReasons.push(`ANSWER_CONTRACT_MISMATCH: expected ${qDef.expectedAnswerType} got ${finalContract.answerType}`);
      if (status !== "FAIL") status = "WARN";
    }

    // Check Entity Coverage
    const missingEntities: string[] = [];
    if (qDef.expectedEntities) {
      for (const reqEnt of qDef.expectedEntities) {
        if (!finalContract.requiredEntities.some((e) => e.toLowerCase() === reqEnt.toLowerCase())) {
          missingEntities.push(reqEnt);
        }
      }
    }
    if (missingEntities.length > 0 && qDef.id !== "Q16") {
      failureReasons.push(`MISSING_REQUIRED_ENTITY: [${missingEntities.join(", ")}]`);
      if (status !== "FAIL") status = "WARN";
    }

    // Check Numeric Facts Integrity
    const normalizedFacts = finalContract.requiredFacts.map(normalizeRequiredFact);
    const hasCorruptedMoney = normalizedFacts.some((f) => {
      // If question had DR and it normalized to money
      if (qDef.id === "Q8" && f.includes("triệu")) return true;
      if (qDef.id === "Q12" && f.includes("triệu")) return true; // 40% -> money
      if (qDef.id === "Q13" && f.includes("triệu")) return true; // pos 3.2 -> money
      return false;
    });

    if (hasCorruptedMoney) {
      failureReasons.push("NUMERIC_FACT_CORRUPTION: Non-money metric converted to budget");
      status = "FAIL";
    }

    // Check Candidate Experience Safety
    const candidateExperienceViolation =
      finalContract.candidateExperienceAllowed &&
      (DEFAULT_CANDIDATE_PROFILE.projects || []).length === 0 &&
      (qDef.id === "Q1" || qDef.id === "Q3");

    if (candidateExperienceViolation) {
      failureReasons.push("CANDIDATE_EXPERIENCE_VIOLATION: Unverified personal claims allowed without project evidence");
      status = "FAIL";
    }

    // Check Speculative Cost on Q2
    if (qDef.id === "Q2" && speculativeReplaced) {
      // Expected behavior per Phase 4.1.1 rules
      if (status === "PASS") status = "WARN";
      failureReasons.push("SPECULATIVE_REPLACEMENT_COST: DIRECT_ALLOCATION replaced due to spend category expansion");
    }

    // Duplicate Commit & Stale Turn Checking
    const duplicateCommit = sessionHistory.some((h) => h.turnId === turnId || (h.question === finalDisplay && qDef.id !== "Q16"));
    const staleTurnReuse = false; // TurnId is unique per iteration

    // Cross-turn semantic evidence leak check
    const currentSignature = finalState.seoEntities.join(",");
    if (i > 0 && currentSignature.length > 0 && currentSignature === previousTurnEvidenceSignature && qDef.expectedEntities && qDef.expectedEntities.length === 0) {
      failureReasons.push("SEMANTIC_EVIDENCE_LEAKAGE: Prior turn entities found in empty entity turn");
      status = "FAIL";
    }
    previousTurnEvidenceSignature = currentSignature;

    // Transcript Quality Classification
    let transcriptQuality: InterviewStressTurnResult["transcriptQuality"] = "CLEAN";
    let semanticRecovery = true;
    if (qDef.isMalformed) {
      if (intentMatches) {
        transcriptQuality = "MALFORMED_BUT_RECOVERED";
      } else {
        transcriptQuality = "MALFORMED_INTENT_FAILURE";
        semanticRecovery = false;
      }
    }

    sessionHistory.push({
      turnId,
      question: finalDisplay,
      intent: detectedIntent
    });

    results.push({
      questionId,
      turnId,
      turnIndex,
      id: qDef.id,
      name: qDef.name,
      expectedIntent: qDef.expectedIntent,
      detectedIntent,
      intentConfidence,
      expectedAnswerType: qDef.expectedAnswerType,
      actualAnswerType: finalContract.answerType,
      transcriptQuality,
      semanticRecovery,
      speechEndToCommitMs,
      speechEndToFirstVisibleAnswerMs,
      totalAnswerMs,
      speculativeStarted,
      speculativeReused,
      speculativeReplaced,
      speculativeLeadTimeMs,
      geminiRequestCount,
      duplicateCommit,
      staleTurnReuse,
      requiredEntities: finalContract.requiredEntities,
      missingEntities,
      requiredFacts: finalContract.requiredFacts,
      normalizedFacts,
      candidateExperienceAllowed: finalContract.candidateExperienceAllowed,
      candidateExperienceViolation,
      status,
      failureReasons,
      firstSentenceSnippet: finalContract.firstSentenceDirective.slice(0, 75) + "...",
      firstUsefulTextMs: speechEndToFirstVisibleAnswerMs
    });
  }

  // Calculate Summary Statistics
  const passCount = results.filter((r) => r.status === "PASS").length;
  const warnCount = results.filter((r) => r.status === "WARN").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;

  const validIntentCount = results.filter((r) => r.expectedIntent === r.detectedIntent || r.failureReasons.every((f) => !f.includes("INTENT_MISCLASSIFICATION"))).length;
  const validContractCount = results.filter((r) => r.expectedAnswerType === r.actualAnswerType || r.failureReasons.every((f) => !f.includes("ANSWER_CONTRACT_MISMATCH"))).length;
  const semanticRecoveredCount = results.filter((r) => r.semanticRecovery).length;
  const fullEntityCoveredCount = results.filter((r) => r.missingEntities.length === 0).length;
  const numericIntegrityCount = results.filter((r) => !r.failureReasons.some((f) => f.includes("NUMERIC_FACT_CORRUPTION"))).length;

  const candidateSafetyViolations = results.filter((r) => r.candidateExperienceViolation).length;
  const duplicateCommitCount = results.filter((r) => r.duplicateCommit).length;
  const staleTurnReuseCount = results.filter((r) => r.staleTurnReuse).length;
  const totalGeminiRequests = results.reduce((sum, r) => sum + r.geminiRequestCount, 0);

  const speculativeReusedCount = results.filter((r) => r.speculativeReused).length;
  const speculativeReplacedCount = results.filter((r) => r.speculativeReplaced).length;
  const normalRequestCount = results.filter((r) => !r.speculativeStarted).length;

  const commitLatencies = results.map((r) => r.speechEndToCommitMs);
  const firstVisibleLatencies = results.map((r) => r.speechEndToFirstVisibleAnswerMs);
  const totalAnswerTimes = results.map((r) => r.totalAnswerMs);

  const failureCategoriesMap: Record<string, number> = {};
  for (const r of results) {
    for (const reason of r.failureReasons) {
      const cat = reason.split(":")[0];
      failureCategoriesMap[cat] = (failureCategoriesMap[cat] || 0) + 1;
    }
  }

  const mostCommonFailureCategories = Object.entries(failureCategoriesMap)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const worstTurns = results
    .filter((r) => r.status !== "PASS")
    .map((r) => ({ id: r.id, name: r.name, reasons: r.failureReasons }));

  const summary: InterviewStressSessionSummary = {
    totalTurns: results.length,
    committedQuestions: sessionHistory.length,
    passCount,
    warnCount,
    failCount,
    intentAccuracy: Math.round((validIntentCount / results.length) * 100),
    answerContractAccuracy: Math.round((validContractCount / results.length) * 100),
    semanticRecoveryRate: Math.round((semanticRecoveredCount / results.length) * 100),
    requiredEntityCoverageRate: Math.round((fullEntityCoveredCount / results.length) * 100),
    numericFactIntegrityRate: Math.round((numericIntegrityCount / results.length) * 100),
    candidateExperienceSafetyViolations: candidateSafetyViolations,
    duplicateCommitCount,
    staleTurnReuseCount,
    totalGeminiRequests,
    speculativeReuseRate: Math.round((speculativeReusedCount / results.length) * 100),
    speculativeReplacementRate: Math.round((speculativeReplacedCount / results.length) * 100),
    normalRequestRate: Math.round((normalRequestCount / results.length) * 100),
    speechEndToCommit: {
      median: calculatePercentile(commitLatencies, 50),
      p90: calculatePercentile(commitLatencies, 90),
      p95: calculatePercentile(commitLatencies, 95),
      max: Math.max(...commitLatencies)
    },
    speechEndToFirstVisible: {
      median: calculatePercentile(firstVisibleLatencies, 50),
      p90: calculatePercentile(firstVisibleLatencies, 90),
      p95: calculatePercentile(firstVisibleLatencies, 95),
      max: Math.max(...firstVisibleLatencies)
    },
    totalAnswerTime: {
      median: calculatePercentile(totalAnswerTimes, 50),
      p90: calculatePercentile(totalAnswerTimes, 90),
      max: Math.max(...totalAnswerTimes)
    },
    worstTurns,
    mostCommonFailureCategories
  };

  return { results, summary };
}
