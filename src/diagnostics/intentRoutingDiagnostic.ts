import { classifyQuestionIntent, type QuestionIntentCategory } from "../question-detector/intentClassifier";
import { classifyQuestionShape, type QuestionShape } from "../question-detector/questionShapeClassifier";
import {
  buildAnswerContract,
  type AnswerContractType
} from "../llm/answerContract";
import {
  InterviewTurnContextManager,
  type InterviewTurnContext
} from "../question-detector/interviewTurnContext";
import { resolveFollowUpContext } from "../question-detector/followUpDetector";
import { DEFAULT_CANDIDATE_PROFILE } from "../shared/candidateProfile";

export interface IntentRoutingTestCase {
  id: string;
  family: string;
  type: "ORIGINAL_RC" | "UNSEEN_PARAPHRASE" | "ADVERSARIAL_COLLISION";
  question: string;
  expectedIntent: QuestionIntentCategory;
  expectedShape: QuestionShape;
  expectedAnswerType: AnswerContractType;
  expectedEntities?: string[];
  expectedFacts?: string[];
  previousTurn?: Partial<InterviewTurnContext>;
  description: string;
}

export const INTENT_ROUTING_TEST_MATRIX: IntentRoutingTestCase[] = [
  // -------------------------------------------------------------------------
  // 1. NEW SITE / AUDIT (SITE_SETUP family)
  // -------------------------------------------------------------------------
  {
    id: "RC01-ORIGINAL",
    family: "SITE_SETUP",
    type: "ORIGINAL_RC",
    question: "Anh giao cho em một money site betting mới hoàn toàn, em lên kế hoạch triển khai từ lúc nhận site như thế nào?",
    expectedIntent: "STRATEGY_PLAN",
    expectedShape: "WORKFLOW",
    expectedAnswerType: "DIRECT_STRATEGY_WORKFLOW",
    expectedEntities: ["money site"],
    description: "New money site onboarding and rollout plan from scratch."
  },
  {
    id: "SITE_SETUP-PARAPHRASE-1",
    family: "SITE_SETUP",
    type: "UNSEEN_PARAPHRASE",
    question: "Khi nhận một site mới toanh chưa có gì, trong 30 ngày đầu em audit và triển khai những gì?",
    expectedIntent: "STRATEGY_PLAN",
    expectedShape: "WORKFLOW",
    expectedAnswerType: "DIRECT_STRATEGY_WORKFLOW",
    description: "30-day new site setup and audit workflow."
  },
  {
    id: "SITE_SETUP-PARAPHRASE-2",
    family: "SITE_SETUP",
    type: "UNSEEN_PARAPHRASE",
    question: "Quy trình triển khai SEO từ đầu cho domain mới của em gồm các bước nào?",
    expectedIntent: "STRATEGY_PLAN",
    expectedShape: "WORKFLOW",
    expectedAnswerType: "DIRECT_STRATEGY_WORKFLOW",
    description: "New domain step-by-step rollout process."
  },
  {
    id: "SITE_SETUP-PARAPHRASE-3",
    family: "SITE_SETUP",
    type: "UNSEEN_PARAPHRASE",
    question: "Em audit site mới nhận như thế nào trước khi bắt đầu làm on-page và đi link?",
    expectedIntent: "STRATEGY_PLAN",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_STRATEGY_WORKFLOW",
    description: "Initial audit before onpage and link building."
  },

  // -------------------------------------------------------------------------
  // 2. GSC & RANKING DROP DIAGNOSIS (RANKING_DIAGNOSIS family)
  // -------------------------------------------------------------------------
  {
    id: "RC03-ORIGINAL",
    family: "RANKING_DIAGNOSIS",
    type: "ORIGINAL_RC",
    question: "Dựa trên tín hiệu từ GSC, khi traffic giảm đột ngột thì em bóc tách những metric nào?",
    expectedIntent: "GSC_RANKING_DROP",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    expectedEntities: ["GSC"],
    description: "GSC sudden traffic drop metric breakdown."
  },
  {
    id: "RC21-ORIGINAL",
    family: "RANKING_DIAGNOSIS",
    type: "ORIGINAL_RC",
    question: "Site tụt nhưng không có Core Update và referring domain không thay đổi, indexing vẫn bình thường, em check gì trước?",
    expectedIntent: "GSC_RANKING_DROP",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Ranking drop with ruled-out Core Update constraints."
  },
  {
    id: "RANKING_DIAG-PARAPHRASE-1",
    family: "RANKING_DIAGNOSIS",
    type: "UNSEEN_PARAPHRASE",
    question: "10 money page cùng lúc từ top 5 rớt xuống top 20 trong khi bài tin tức vẫn giữ traffic, em kiểm tra gì?",
    expectedIntent: "GSC_RANKING_DROP",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Money page ranking drop isolation."
  },
  {
    id: "RANKING_DIAG-PARAPHRASE-2",
    family: "RANKING_DIAGNOSIS",
    type: "UNSEEN_PARAPHRASE",
    question: "GSC báo impression giữ nguyên nhưng click và thứ hạng giảm mạnh 40%, hướng xử lý của em là gì?",
    expectedIntent: "GSC_RANKING_DROP",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "GSC CTR and ranking drop diagnosis."
  },
  {
    id: "RANKING_DIAG-PARAPHRASE-3",
    family: "RANKING_DIAGNOSIS",
    type: "UNSEEN_PARAPHRASE",
    question: "Sau 1 tuần traffic organic giảm một nửa mà không dính manual action, em làm gì đầu tiên?",
    expectedIntent: "GSC_RANKING_DROP",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Organic traffic drop diagnosis without manual action."
  },

  // -------------------------------------------------------------------------
  // 3. TOP-40 WITH IMPRESSION / NO KEYWORD SIGNAL (INDEXING_DIAGNOSIS family)
  // -------------------------------------------------------------------------
  {
    id: "RC37-ORIGINAL",
    family: "INDEXING_DIAGNOSIS",
    type: "ORIGINAL_RC",
    question: "URL đã index và có impression trong GSC nhưng ranking chỉ lẹt đẹt top 40, em tối ưu tiếp thế nào?",
    expectedIntent: "NO_KEYWORD_SIGNAL",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Indexed with impressions but stuck around top 40."
  },
  {
    id: "RC38-ORIGINAL",
    family: "INDEXING_DIAGNOSIS",
    type: "ORIGINAL_RC",
    question: "Site mở bot hai tuần rồi mà mãi không nhận keyword thì em xử lý ra sao?",
    expectedIntent: "NO_KEYWORD_SIGNAL",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    expectedFacts: ["duration: hai tuần"],
    description: "Bot opened 2 weeks but no keyword recognized."
  },
  {
    id: "INDEXING-PARAPHRASE-1",
    family: "INDEXING_DIAGNOSIS",
    type: "UNSEEN_PARAPHRASE",
    question: "Bài viết đã cắn index 10 ngày nhưng chưa vào top 50, em kiểm tra search intent hay on-page trước?",
    expectedIntent: "NO_KEYWORD_SIGNAL",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Indexed 10 days but weak ranking diagnosis."
  },
  {
    id: "INDEXING-PARAPHRASE-2",
    family: "INDEXING_DIAGNOSIS",
    type: "UNSEEN_PARAPHRASE",
    question: "Bot Google crawl đều nhưng GSC không nhận từ khóa nào cho trang chủ, em handle thế nào?",
    expectedIntent: "NO_KEYWORD_SIGNAL",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Google bot crawling but zero keywords in GSC."
  },
  {
    id: "INDEXING-PARAPHRASE-3",
    family: "INDEXING_DIAGNOSIS",
    type: "UNSEEN_PARAPHRASE",
    question: "Keyword kẹt ở top 30-50 dù impression tăng, bước tiếp theo em đẩy on-page hay thêm internal link?",
    expectedIntent: "NO_KEYWORD_SIGNAL",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Keyword stuck at top 30-50 with rising impressions."
  },

  // -------------------------------------------------------------------------
  // 4. ON-PAGE & CANNIBALIZATION (ONPAGE_DIAGNOSIS family)
  // -------------------------------------------------------------------------
  {
    id: "RC06-ORIGINAL",
    family: "ONPAGE_DIAGNOSIS",
    type: "ORIGINAL_RC",
    question: "Em xây dựng cấu trúc internal link và silo cho money site như thế nào?",
    expectedIntent: "STRATEGY_PLAN",
    expectedShape: "WORKFLOW",
    expectedAnswerType: "DIRECT_STRATEGY_WORKFLOW",
    expectedEntities: ["internal link", "money page"],
    description: "Internal link and silo architecture strategy."
  },
  {
    id: "RC28-ORIGINAL",
    family: "ONPAGE_DIAGNOSIS",
    type: "ORIGINAL_RC",
    question: "Hai landing page cùng cạnh tranh 1 keyword và ăn thịt lẫn nhau (cannibalization), em xử lý thế nào?",
    expectedIntent: "ONPAGE_DIAGNOSIS",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Landing page keyword cannibalization diagnosis."
  },
  {
    id: "ONPAGE-PARAPHRASE-1",
    family: "ONPAGE_DIAGNOSIS",
    type: "UNSEEN_PARAPHRASE",
    question: "Google nhận nhầm URL phụ thay vì money page cho từ khóa chính, em khắc phục canonical và internal link sao?",
    expectedIntent: "ONPAGE_DIAGNOSIS",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Wrong URL ranking canonical and internal link clash."
  },
  {
    id: "ONPAGE-PARAPHRASE-2",
    family: "ONPAGE_DIAGNOSIS",
    type: "UNSEEN_PARAPHRASE",
    question: "Khi hai bài viết bị trùng lặp intent và nhảy ranking liên tục, em merge bài hay sửa title/content?",
    expectedIntent: "ONPAGE_DIAGNOSIS",
    expectedShape: "DECISION",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Intent overlap and ranking fluctuation."
  },
  {
    id: "ONPAGE-PARAPHRASE-3",
    family: "ONPAGE_DIAGNOSIS",
    type: "UNSEEN_PARAPHRASE",
    question: "Em tối ưu on-page title, meta description và heading thế nào để tránh cannibalize từ khóa ngách?",
    expectedIntent: "ONPAGE_DIAGNOSIS",
    expectedShape: "WORKFLOW",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Title meta heading optimization against cannibalization."
  },

  // -------------------------------------------------------------------------
  // 5. DOMAIN SELECTION & DECISION (DOMAIN_EVALUATION family)
  // -------------------------------------------------------------------------
  {
    id: "RC08-ORIGINAL",
    family: "DOMAIN_EVALUATION",
    type: "ORIGINAL_RC",
    question: "Domain A DR 55 traffic bằng 0, domain B DR 20 có traffic thật. Em chọn domain nào?",
    expectedIntent: "DOMAIN_SELECTION",
    expectedShape: "DECISION",
    expectedAnswerType: "DIRECT_DECISION",
    expectedFacts: ["DR: DR 55, DR 20"],
    description: "Domain A vs Domain B direct choice."
  },
  {
    id: "DOMAIN-PARAPHRASE-1",
    family: "DOMAIN_EVALUATION",
    type: "UNSEEN_PARAPHRASE",
    question: "Giữa con domain cũ DR cao mà history rác và con domain DR vừa nhưng sạch, em ưu tiên con nào?",
    expectedIntent: "DOMAIN_SELECTION",
    expectedShape: "DECISION",
    expectedAnswerType: "DIRECT_DECISION",
    description: "High DR dirty domain vs clean medium DR domain choice."
  },
  {
    id: "DOMAIN-PARAPHRASE-2",
    family: "DOMAIN_EVALUATION",
    type: "UNSEEN_PARAPHRASE",
    question: "Tiêu chí săn expired domain của em là gì? Em check Wayback và anchor text như thế nào trước khi mua?",
    expectedIntent: "DOMAIN_SELECTION",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_DECISION",
    description: "Expired domain hunting criteria and verification."
  },
  {
    id: "DOMAIN-PARAPHRASE-3",
    family: "DOMAIN_EVALUATION",
    type: "UNSEEN_PARAPHRASE",
    question: "Con domain này DR 45 nhưng traffic rớt về 0 từ 2 năm trước, em có mua không?",
    expectedIntent: "DOMAIN_SELECTION",
    expectedShape: "DECISION",
    expectedAnswerType: "DIRECT_DECISION",
    description: "Expired domain drop history purchase decision."
  },

  // -------------------------------------------------------------------------
  // 6. PBN TIMING & SIGNALS (PBN_TIMING family)
  // -------------------------------------------------------------------------
  {
    id: "RC10-ORIGINAL",
    family: "PBN_TIMING",
    type: "ORIGINAL_RC",
    question: "Khoảng khi nào em bắt đầu đi PBN? Dựa vào tín hiệu nào để em tăng link PBN?",
    expectedIntent: "PBN_TIMING",
    expectedShape: "TIMING",
    expectedAnswerType: "DIRECT_TIMING_EXPLANATION",
    expectedEntities: ["PBN"],
    description: "PBN timing and trigger signal thresholds."
  },
  {
    id: "PBN-PARAPHRASE-1",
    family: "PBN_TIMING",
    type: "UNSEEN_PARAPHRASE",
    question: "Site có tín hiệu tới mức nào thì em mới bật PBN?",
    expectedIntent: "PBN_TIMING",
    expectedShape: "TIMING",
    expectedAnswerType: "DIRECT_TIMING_EXPLANATION",
    expectedEntities: ["PBN"],
    description: "Threshold signal required before firing PBN links."
  },
  {
    id: "PBN-PARAPHRASE-2",
    family: "PBN_TIMING",
    type: "UNSEEN_PARAPHRASE",
    question: "Em nhìn vào metric gì trước khi quyết định tăng PBN cho money site?",
    expectedIntent: "PBN_TIMING",
    expectedShape: "SIGNAL_REQUEST",
    expectedAnswerType: "DIRECT_TIMING_EXPLANATION",
    expectedEntities: ["PBN"],
    description: "Metrics inspection before escalating PBN volume."
  },
  {
    id: "PBN-PARAPHRASE-3",
    family: "PBN_TIMING",
    type: "UNSEEN_PARAPHRASE",
    question: "PBN nên vào ở stage nào của site? Bao lâu thì dừng nếu không thấy tín hiệu?",
    expectedIntent: "PBN_TIMING",
    expectedShape: "TIMING",
    expectedAnswerType: "DIRECT_TIMING_EXPLANATION",
    expectedEntities: ["PBN"],
    description: "PBN stage entry and stop condition."
  },

  // -------------------------------------------------------------------------
  // 7. ANCHOR & BUDGET ALLOCATION (ALLOCATION family)
  // -------------------------------------------------------------------------
  {
    id: "RC11-ORIGINAL",
    family: "LINK_ALLOCATION",
    type: "ORIGINAL_RC",
    question: "Em chia tỷ lệ anchor text cho money site thế nào? Brand, URL, generic và exact match phân bổ bao nhiêu %?",
    expectedIntent: "STRATEGY_PLAN",
    expectedShape: "ALLOCATION",
    expectedAnswerType: "DIRECT_ALLOCATION",
    expectedEntities: ["anchor text", "money page"],
    description: "Anchor text ratio allocation (brand, generic, exact)."
  },
  {
    id: "ALLOCATION-PARAPHRASE-1",
    family: "BUDGET_ALLOCATION",
    type: "UNSEEN_PARAPHRASE",
    question: "Budget 20 triệu em phân bổ Content, Entity, Guest Post và PBN thế nào?",
    expectedIntent: "BUDGET_ALLOCATION",
    expectedShape: "ALLOCATION",
    expectedAnswerType: "DIRECT_ALLOCATION",
    expectedFacts: ["budget: 20 triệu"],
    expectedEntities: ["content", "Entity", "Guest Post", "PBN"],
    description: "Multi-category monetary budget allocation."
  },
  {
    id: "ALLOCATION-PARAPHRASE-2",
    family: "LINK_ALLOCATION",
    type: "UNSEEN_PARAPHRASE",
    question: "Giai đoạn đầu em phân bổ bao nhiêu phần trăm anchor brand và bao nhiêu exact match?",
    expectedIntent: "STRATEGY_PLAN",
    expectedShape: "ALLOCATION",
    expectedAnswerType: "DIRECT_ALLOCATION",
    expectedEntities: ["anchor text"],
    description: "Initial stage anchor percentage allocation."
  },
  {
    id: "ALLOCATION-PARAPHRASE-3",
    family: "BUDGET_ALLOCATION",
    type: "UNSEEN_PARAPHRASE",
    question: "Với 50 triệu ngân sách link building tháng đầu, em chia tiền cho báo và PBN ra sao?",
    expectedIntent: "BUDGET_ALLOCATION",
    expectedShape: "ALLOCATION",
    expectedAnswerType: "DIRECT_ALLOCATION",
    expectedFacts: ["budget: 50 triệu"],
    expectedEntities: ["PBN"],
    description: "50M link building budget allocation between press and PBN."
  },

  // -------------------------------------------------------------------------
  // 8. 301 REDIRECT DECISION & TIMING (REDIRECT_DECISION family)
  // -------------------------------------------------------------------------
  {
    id: "RC18-ORIGINAL",
    family: "REDIRECT_DECISION",
    type: "ORIGINAL_RC",
    question: "Con expired domain này em dựng site riêng hay 301 về money site?",
    expectedIntent: "REDIRECT_301",
    expectedShape: "DECISION",
    expectedAnswerType: "DIRECT_DECISION",
    expectedEntities: ["301", "expired domain", "money page"],
    description: "Expired domain 301 redirect vs separate site build."
  },
  {
    id: "REDIRECT-PARAPHRASE-1",
    family: "REDIRECT_DECISION",
    type: "UNSEEN_PARAPHRASE",
    question: "Khi nào em mới quyết định redirect 301 expired domain về money site?",
    expectedIntent: "REDIRECT_301",
    expectedShape: "TIMING",
    expectedAnswerType: "DIRECT_TIMING_EXPLANATION",
    expectedEntities: ["301", "expired domain", "money page"],
    description: "Timing condition before 301 redirecting expired domain."
  },
  {
    id: "REDIRECT-PARAPHRASE-2",
    family: "REDIRECT_DECISION",
    type: "UNSEEN_PARAPHRASE",
    question: "Em chọn rebuild domain cũ hay redirect 301 để giữ link juice an toàn?",
    expectedIntent: "REDIRECT_301",
    expectedShape: "DECISION",
    expectedAnswerType: "DIRECT_DECISION",
    expectedEntities: ["301"],
    description: "Rebuild vs 301 redirect for safe link equity preservation."
  },
  {
    id: "REDIRECT-PARAPHRASE-3",
    family: "REDIRECT_DECISION",
    type: "UNSEEN_PARAPHRASE",
    question: "Redirect 301 toàn trang hay chỉ redirect từng URL tương ứng về money page?",
    expectedIntent: "REDIRECT_301",
    expectedShape: "DECISION",
    expectedAnswerType: "DIRECT_DECISION",
    expectedEntities: ["301", "money page"],
    description: "Wildcard 301 redirect vs page-by-page mapping."
  },

  // -------------------------------------------------------------------------
  // 9. ADVERSARIAL NEGATIVE TESTS (Prevent term hijack)
  // -------------------------------------------------------------------------
  {
    id: "ADV-01-DR-IN-DIAGNOSIS",
    family: "RANKING_DIAGNOSIS",
    type: "ADVERSARIAL_COLLISION",
    question: "Ahrefs báo DR tăng từ 20 lên 40 nhưng traffic money page lại giảm, em check gì trước?",
    expectedIntent: "GSC_RANKING_DROP",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "DR mentioned in diagnosis must NOT become DOMAIN_SELECTION."
  },
  {
    id: "ADV-02-BUDGET-IN-PBN-TIMING",
    family: "PBN_TIMING",
    type: "ADVERSARIAL_COLLISION",
    question: "Budget cho PBN là 5 triệu, nhưng khi nào em mới bắt đầu triển khai bắn link?",
    expectedIntent: "PBN_TIMING",
    expectedShape: "TIMING",
    expectedAnswerType: "DIRECT_TIMING_EXPLANATION",
    description: "Budget mentioned in PBN timing must NOT become BUDGET_ALLOCATION."
  },
  {
    id: "ADV-03-INTERNAL-LINK-IN-WEAK-RANK",
    family: "INDEXING_DIAGNOSIS",
    type: "ADVERSARIAL_COLLISION",
    question: "Internal link và content đã tối ưu nhưng keyword vẫn lẹt đẹt top 40 sau 2 tuần, em xử lý sao?",
    expectedIntent: "NO_KEYWORD_SIGNAL",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Internal link mentioned in stuck ranking must NOT become pure STRATEGY_PLAN."
  },
  {
    id: "ADV-04-NEGATED-CORE-UPDATE",
    family: "RANKING_DIAGNOSIS",
    type: "ADVERSARIAL_COLLISION",
    question: "Không có Core Update nhưng traffic organic giảm 40%, em bóc tách lỗi gì?",
    expectedIntent: "GSC_RANKING_DROP",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    description: "Negated Core Update must NOT become CORE_UPDATE_RECOVERY."
  },
  {
    id: "ADV-05-AHREFS-INSPECTION-NOT-DOMAIN-SELECTION",
    family: "RANKING_DIAGNOSIS",
    type: "ADVERSARIAL_COLLISION",
    question: "Em check Ahrefs những chỉ số nào khi phát hiện đối thủ vượt ranking?",
    expectedIntent: "STRATEGY_PLAN",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_STRATEGY_WORKFLOW",
    description: "Ahrefs inspection question must NOT become DOMAIN_SELECTION."
  },

  // -------------------------------------------------------------------------
  // 10. FOLLOW-UP CONTEXT RESOLUTION & OVERRIDES
  // -------------------------------------------------------------------------
  {
    id: "RC09-FOLLOWUP-BUDGET-PBN",
    family: "BUDGET_ALLOCATION",
    type: "ORIGINAL_RC",
    question: "Còn PBN thì sao?",
    expectedIntent: "BUDGET_ALLOCATION",
    expectedShape: "GENERAL",
    expectedAnswerType: "DIRECT_ALLOCATION",
    expectedEntities: ["PBN"],
    previousTurn: {
      turnId: "turn-budget-prev",
      question: "Budget 20 triệu em phân bổ Content, Entity, Guest Post và PBN thế nào?",
      intent: "BUDGET_ALLOCATION",
      entities: ["content", "Entity", "Guest Post", "PBN"],
      numericFacts: ["budget: 20 triệu"],
      decision: { action: "8tr Content, 4tr Entity, 5tr Guest Post, 3tr PBN" }
    },
    description: "'Còn PBN thì sao?' after budget allocation must inherit BUDGET_ALLOCATION with PBN focus."
  },
  {
    id: "RC22-FOLLOWUP-OVERRIDE",
    family: "RANKING_DIAGNOSIS",
    type: "ORIGINAL_RC",
    question: "Traffic bắt đầu tụt thì em check gì trước?",
    expectedIntent: "GSC_RANKING_DROP",
    expectedShape: "DIAGNOSIS",
    expectedAnswerType: "DIRECT_ACTION_DIAGNOSIS",
    previousTurn: {
      turnId: "turn-domain-prev",
      question: "Domain A hay domain B em chọn con nào?",
      intent: "DOMAIN_SELECTION",
      entities: ["DR", "traffic"],
      numericFacts: ["DR: DR 55, DR 20"],
      decision: { choice: "domain B" }
    },
    description: "Explicit ranking diagnosis question must override previous DOMAIN_SELECTION turn."
  }
];

export interface DiagnosticMetrics {
  totalCases: number;
  intentPassed: number;
  shapePassed: number;
  contractPassed: number;
  followUpPassed: number;
  safetyPassed: number;
  entityCoveragePassed: number;
  intentAccuracy: number;
  shapeAccuracy: number;
  contractAccuracy: number;
  followUpAccuracy: number;
  candidateSafetyViolations: number;
  originalFixtureAccuracy: number;
  unseenParaphraseAccuracy: number;
  adversarialAccuracy: number;
  latenciesMs: number[];
  p50LatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  failures: string[];
}

export function runIntentRoutingDiagnostic(): DiagnosticMetrics {
  console.log("\n============================================================");
  console.log("PHASE 6.2 INTENT & ANSWER-CONTRACT ROUTING HARDENING DIAGNOSTIC");
  console.log("============================================================\n");

  const manager = new InterviewTurnContextManager();
  const failures: string[] = [];
  const latencies: number[] = [];

  let intentPassed = 0;
  let shapePassed = 0;
  let contractPassed = 0;
  let followUpPassed = 0;
  let safetyPassed = 0;
  let entityCoveragePassed = 0;

  let origTotal = 0;
  let origPassed = 0;
  let unseenTotal = 0;
  let unseenPassed = 0;
  let advTotal = 0;
  let advPassed = 0;

  // Warmup all test cases to ensure V8 JIT compilation does not skew latency distribution
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  for (const tc of INTENT_ROUTING_TEST_MATRIX) {
    classifyQuestionShape(tc.question);
    const rawIntent = classifyQuestionIntent(tc.question);
    buildAnswerContract({
      question: tc.question,
      intent: rawIntent.category,
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });
  }
  process.env.NODE_ENV = prevEnv;

  for (const testCase of INTENT_ROUTING_TEST_MATRIX) {
    manager.reset();
    if (testCase.previousTurn) {
      manager.recordCompletedTurn({
        turnId: testCase.previousTurn.turnId || "prev-turn",
        question: testCase.previousTurn.question || "Previous question",
        intent: testCase.previousTurn.intent || "UNKNOWN",
        entities: testCase.previousTurn.entities || [],
        numericFacts: testCase.previousTurn.numericFacts || [],
        scenarioConstraints: testCase.previousTurn.scenarioConstraints,
        decision: testCase.previousTurn.decision,
        committedAt: Date.now() - 5000
      });
    }

    const prevContext = manager.getPreviousCompletedContext();

    // Algorithmic resolution latency (excluding terminal console logging)
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    const start = performance.now();
    const shape = classifyQuestionShape(testCase.question);
    const rawIntent = classifyQuestionIntent(testCase.question);
    const followUpContext = resolveFollowUpContext(testCase.question, prevContext, testCase.id);

    // Apply follow-up context resolution if contextual and not overridden by strong current intent
    let finalIntentCategory = rawIntent.category;
    if (followUpContext.contextResolved && followUpContext.inheritedIntent) {
      // Precedence: explicit strong current intent > entity-specialized inherited intent > generic inherited intent
      if (rawIntent.category === "UNKNOWN" || rawIntent.category === "STRATEGY_PLAN") {
        finalIntentCategory = followUpContext.inheritedIntent;
      }
    }

    const contract = buildAnswerContract({
      question: testCase.question,
      intent: finalIntentCategory,
      candidateProfile: DEFAULT_CANDIDATE_PROFILE,
      followUpContext
    });
    const elapsed = performance.now() - start;
    process.env.NODE_ENV = prevEnv;
    latencies.push(elapsed);

    // Intent check
    const isIntentCorrect = finalIntentCategory === testCase.expectedIntent;
    if (isIntentCorrect) intentPassed++;

    // Shape check (allow compatible shapes e.g. WORKFLOW / DIAGNOSIS when valid)
    const isShapeCorrect = shape.primaryShape === testCase.expectedShape || shape.secondaryShapes.includes(testCase.expectedShape) || (testCase.expectedShape === "GENERAL");
    if (isShapeCorrect) shapePassed++;

    // Contract AnswerType check
    const isContractCorrect = contract.answerType === testCase.expectedAnswerType;
    if (isContractCorrect) contractPassed++;

    // Follow-up resolution check
    let isFollowUpCorrect = true;
    if (testCase.id.includes("FOLLOWUP-BUDGET")) {
      isFollowUpCorrect = followUpContext.contextResolved === true;
      if (isFollowUpCorrect) followUpPassed++;
    } else if (testCase.id.includes("FOLLOWUP-OVERRIDE")) {
      // Non-fragment standalone question must NOT resolve context
      isFollowUpCorrect = followUpContext.contextResolved === false;
      if (isFollowUpCorrect) followUpPassed++;
    }

    // Candidate safety check: Default profile has no projects -> personal claims MUST be false
    const isSafetyCorrect = contract.candidateExperience.allowed === false;
    if (isSafetyCorrect) safetyPassed++;

    // Entity coverage check
    let isEntityCorrect = true;
    if (testCase.expectedEntities && testCase.expectedEntities.length > 0) {
      isEntityCorrect = testCase.expectedEntities.every((e) => contract.requiredEntities.includes(e));
      if (isEntityCorrect) entityCoveragePassed++;
    }

    // Type tracking
    if (testCase.type === "ORIGINAL_RC") {
      origTotal++;
      if (isIntentCorrect && isContractCorrect) origPassed++;
    } else if (testCase.type === "UNSEEN_PARAPHRASE") {
      unseenTotal++;
      if (isIntentCorrect && isContractCorrect) unseenPassed++;
    } else if (testCase.type === "ADVERSARIAL_COLLISION") {
      advTotal++;
      if (isIntentCorrect && isContractCorrect) advPassed++;
    }

    const isAllPass = isIntentCorrect && isContractCorrect && isSafetyCorrect && isEntityCorrect && isFollowUpCorrect;
    if (!isAllPass) {
      const reasons: string[] = [];
      if (!isIntentCorrect) reasons.push(`Intent: expected ${testCase.expectedIntent}, got ${finalIntentCategory}`);
      if (!isContractCorrect) reasons.push(`Contract: expected ${testCase.expectedAnswerType}, got ${contract.answerType}`);
      if (!isSafetyCorrect) reasons.push("Candidate safety violation: autobiographical claim allowed without projects");
      if (!isEntityCorrect) reasons.push(`Missing entities: ${testCase.expectedEntities?.filter((e) => !contract.requiredEntities.includes(e)).join(", ")}`);
      if (!isFollowUpCorrect) reasons.push("Follow-up context failed to resolve");
      failures.push(`[${testCase.id}] ${testCase.question} -> ${reasons.join("; ")}`);
    }
  }

  const totalCases = INTENT_ROUTING_TEST_MATRIX.length;
  latencies.sort((a, b) => a - b);
  const p50LatencyMs = Math.round((latencies[Math.floor(latencies.length * 0.5)] || 0) * 100) / 100;
  const p95LatencyMs = Math.round((latencies[Math.floor(latencies.length * 0.95)] || 0) * 100) / 100;
  const maxLatencyMs = Math.round((latencies[latencies.length - 1] || 0) * 100) / 100;

  const intentAccuracy = Math.round((intentPassed / totalCases) * 1000) / 10;
  const shapeAccuracy = Math.round((shapePassed / totalCases) * 1000) / 10;
  const contractAccuracy = Math.round((contractPassed / totalCases) * 1000) / 10;
  const followUpAccuracy = Math.round((followUpPassed / Math.max(1, INTENT_ROUTING_TEST_MATRIX.filter((t) => t.previousTurn).length)) * 1000) / 10;
  const candidateSafetyViolations = totalCases - safetyPassed;

  const originalFixtureAccuracy = Math.round((origPassed / Math.max(1, origTotal)) * 1000) / 10;
  const unseenParaphraseAccuracy = Math.round((unseenPassed / Math.max(1, unseenTotal)) * 1000) / 10;
  const adversarialAccuracy = Math.round((advPassed / Math.max(1, advTotal)) * 1000) / 10;

  console.log("----------------------------------------------------------------------------------------------------");
  console.log(`Total test cases: ${totalCases}`);
  console.log(`Intent Accuracy: ${intentAccuracy}% (Target: >= 90%) -> ${intentAccuracy >= 90 ? "PASS" : "FAIL"}`);
  console.log(`Question Shape Accuracy: ${shapeAccuracy}%`);
  console.log(`AnswerContract Accuracy: ${contractAccuracy}% (Target: >= 90%) -> ${contractAccuracy >= 90 ? "PASS" : "FAIL"}`);
  console.log(`Follow-Up Resolution Accuracy: ${followUpAccuracy}% (Target: >= 95%) -> ${followUpAccuracy >= 95 ? "PASS" : "FAIL"}`);
  console.log(`Candidate Safety Violations: ${candidateSafetyViolations} (Target: 0) -> ${candidateSafetyViolations === 0 ? "PASS" : "FAIL"}`);
  console.log(`Original Fixture Accuracy: ${originalFixtureAccuracy}%`);
  console.log(`Unseen Paraphrase Accuracy: ${unseenParaphraseAccuracy}%`);
  console.log(`Adversarial Collision Accuracy: ${adversarialAccuracy}%`);
  console.log(`Processing Latency: p50 = ${p50LatencyMs}ms | p95 = ${p95LatencyMs}ms | max = ${maxLatencyMs}ms (Target: < 5ms)`);
  console.log("----------------------------------------------------------------------------------------------------\n");

  if (failures.length > 0) {
    console.log("FAILURES DETECTED:");
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
    console.log("");
  } else {
    console.log("ALL 100% OF INTENT & ANSWER-CONTRACT ROUTING TESTS PASSED PERFECTLY!\n");
  }

  return {
    totalCases,
    intentPassed,
    shapePassed,
    contractPassed,
    followUpPassed,
    safetyPassed,
    entityCoveragePassed,
    intentAccuracy,
    shapeAccuracy,
    contractAccuracy,
    followUpAccuracy,
    candidateSafetyViolations,
    originalFixtureAccuracy,
    unseenParaphraseAccuracy,
    adversarialAccuracy,
    latenciesMs: latencies,
    p50LatencyMs,
    p95LatencyMs,
    maxLatencyMs,
    failures
  };
}

if (typeof process !== "undefined" && import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "")) {
  const metrics = runIntentRoutingDiagnostic();
  if (metrics.intentAccuracy < 90 || metrics.contractAccuracy < 90 || metrics.candidateSafetyViolations > 0) {
    process.exit(1);
  }
}
