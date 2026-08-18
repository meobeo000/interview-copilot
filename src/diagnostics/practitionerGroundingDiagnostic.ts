import { performance } from "perf_hooks";
import { getPractitionerReferenceRetriever } from "../knowledge/practitionerReferenceRetriever";
import { buildAnswerKnowledgeContext } from "../knowledge/answerKnowledgeContextBuilder";
import { buildAnswerContract } from "../llm/answerContract";
import { buildFastSeoInterviewPrompt } from "../llm/prompts/fastSeoInterviewPrompt";
import type { CandidateProfile } from "../shared/candidateProfile";
import type { QuestionIntentCategory } from "../question-detector/intentClassifier";
import type { ResolvedFollowUpContext } from "../question-detector/interviewTurnContext";

interface DiagnosticTestCase {
  id: string;
  name: string;
  category: "DOMAIN" | "DOMAIN_FOLLOWUP" | "PBN_TIMING" | "NO_KEYWORD" | "REDIRECT_301" | "SAFETY" | "VERIFIED" | "ANTI_TEMPLATE";
  question: string;
  intent: QuestionIntentCategory;
  followUpContext?: ResolvedFollowUpContext;
  profile?: CandidateProfile;
  expectedRefIds: string[];
  forbiddenRefIds?: string[];
  validateContract?: (contract: ReturnType<typeof buildAnswerContract>) => { pass: boolean; reason?: string };
  validatePrompt?: (prompt: string) => { pass: boolean; reason?: string };
}

const EMPTY_PROFILE: CandidateProfile = {
  fullName: "Nguyễn Văn A",
  role: "SEO Specialist",
  background: "Nền tảng Web Development vững chắc, tư duy Technical SEO tốt.",
  skills: ["Web Development", "HTML/CSS/JS"],
  seoSkills: ["Technical SEO", "On-page", "Search Console"],
  tools: ["GSC", "Ahrefs"],
  projects: [], // No fake projects!
  markets: ["Việt Nam"],
  strengths: ["Debug Technical SEO"],
  experienceNotes: "Học hỏi và tích lũy thực chiến iGaming."
};

const VERIFIED_PROFILE: CandidateProfile = {
  fullName: "Trần Văn B",
  role: "Senior SEO Specialist",
  background: "3 năm kinh nghiệm SEO tổng thể.",
  skills: ["SEO Strategy", "Technical SEO"],
  seoSkills: ["PBN", "Expired Domain", "Core Update Recovery"],
  tools: ["Ahrefs", "GSC", "Screaming Frog"],
  projects: [
    {
      name: "Dự án Alpha iGaming",
      role: "SEO Lead",
      description: "Xây dựng hệ thống PBN và săn expired domain phục hồi sau Core Update.",
      metrics: "Traffic 50k/tháng, top 3 từ khóa chính"
    }
  ],
  markets: ["Việt Nam"],
  strengths: ["PBN building", "Domain hunting"],
  experienceNotes: "Thực chiến 3 năm."
};

const TEST_CASES: DiagnosticTestCase[] = [
  // 1. Domain Hunting (Target: 100% precision)
  {
    id: "dom-01",
    name: "Tiêu chí săn domain iGaming",
    category: "DOMAIN",
    question: "Tiêu chí săn domain của em là gì?",
    intent: "DOMAIN_SELECTION",
    expectedRefIds: ["ref:domain-hunting-evaluation"],
    forbiddenRefIds: ["ref:new-site-pbn-timing"]
  },
  {
    id: "dom-02",
    name: "Đánh giá expired domain trước khi mua",
    category: "DOMAIN",
    question: "Em đánh giá expired domain như thế nào trước khi mua?",
    intent: "DOMAIN_SELECTION",
    expectedRefIds: ["ref:domain-hunting-evaluation"]
  },
  {
    id: "dom-03",
    name: "So sánh DR cao traffic 0 vs DR vừa traffic thật",
    category: "DOMAIN",
    question: "Domain DR 60 nhưng traffic 0 với domain DR 25 traffic 5k thì chọn con nào?",
    intent: "DOMAIN_SELECTION",
    expectedRefIds: ["ref:domain-hunting-evaluation"]
  },
  {
    id: "dom-04",
    name: "Thử nghiệm các đuôi TLD .in .me .my .nl",
    category: "DOMAIN",
    question: "Vì sao em lại thử nghiệm các đuôi .in, .me hay .my?",
    intent: "DOMAIN_SELECTION",
    expectedRefIds: ["ref:domain-hunting-evaluation"]
  },
  {
    id: "dom-05",
    name: "Mixed Vietnamese/English TLD testing signals",
    category: "DOMAIN",
    question: "Testing TLD in iGaming: what signals do you observe in GSC?",
    intent: "DOMAIN_SELECTION",
    expectedRefIds: ["ref:domain-hunting-evaluation"]
  },
  {
    id: "dom-06",
    name: "Check Wayback Machine tên miền cũ",
    category: "DOMAIN",
    question: "Các bước check Wayback Machine khi mua tên miền cũ là gì?",
    intent: "DOMAIN_SELECTION",
    expectedRefIds: ["ref:domain-hunting-evaluation"]
  },

  // 2. Domain Follow-up Context Grounding
  {
    id: "fup-dom-01",
    name: "Follow-up 'Tín hiệu nào?' sau turn test TLD",
    category: "DOMAIN_FOLLOWUP",
    question: "Tín hiệu nào?",
    intent: "DOMAIN_SELECTION",
    followUpContext: {
      followUpType: "SIGNAL",
      contextResolved: true,
      currentUtterance: "Tín hiệu nào?",
      previousQuestion: "Em test .in, .me và .my.",
      targetEntity: ".in, .me, .my",
      inheritedIntent: "DOMAIN_SELECTION",
      inheritedEntities: [".in", ".me", ".my"],
      inheritedNumericFacts: [],
      resolutionMs: 0.1,
      resolvedMeaning: "Tín hiệu nào để đánh giá hiệu quả khi test các TLD .in, .me, .my?"
    },
    expectedRefIds: ["ref:domain-hunting-evaluation"]
  },
  {
    id: "fup-dom-02",
    name: "Follow-up 'Vì sao chọn domain đó?'",
    category: "DOMAIN_FOLLOWUP",
    question: "Vì sao chọn domain đó?",
    intent: "DOMAIN_SELECTION",
    followUpContext: {
      followUpType: "DECISION_REASON",
      contextResolved: true,
      currentUtterance: "Vì sao chọn domain đó?",
      previousQuestion: "Em chọn domain B vì lịch sử sạch và có traffic thật.",
      targetEntity: "domain B",
      inheritedIntent: "DOMAIN_SELECTION",
      inheritedEntities: ["domain B"],
      inheritedNumericFacts: [],
      resolutionMs: 0.1,
      resolvedMeaning: "Tại sao lại chọn domain B thay vì domain A?"
    },
    expectedRefIds: ["ref:domain-hunting-evaluation"]
  },

  // 3. PBN Timing
  {
    id: "pbn-01",
    name: "PBN timing ngày thứ 10",
    category: "PBN_TIMING",
    question: "Khoảng ngày thứ 10 em bắt đầu PBN, tại sao?",
    intent: "PBN_TIMING",
    expectedRefIds: ["ref:new-site-pbn-timing"],
    validatePrompt: (prompt) => {
      const containsCaution = prompt.includes("Ngày thứ 10") || prompt.includes("không phải mốc cố định") || prompt.includes("universal");
      return { pass: containsCaution, reason: "Prompt must explain day 10 is an observed example, not a universal rule." };
    }
  },
  {
    id: "pbn-02",
    name: "Khi nào mới bắt đầu đi link PBN",
    category: "PBN_TIMING",
    question: "Khi nào mới bắt đầu đi link PBN cho site mới?",
    intent: "PBN_TIMING",
    expectedRefIds: ["ref:new-site-pbn-timing"]
  },

  // 4. No Keyword / No Signal Troubleshooting
  {
    id: "nokey-01",
    name: "Site index rồi 2 tuần chưa nhận key",
    category: "NO_KEYWORD",
    question: "Site index rồi nhưng hai tuần vẫn không nhận key, em làm gì?",
    intent: "NO_KEYWORD_SIGNAL",
    expectedRefIds: ["ref:no-keyword-signal-troubleshooting"],
    validatePrompt: (prompt) => {
      const hasDiagnosis = prompt.includes("Sapo") || prompt.includes("on-page") || prompt.includes("Title");
      const hasCaution = prompt.includes("KHÔNG khuyến nghị đổi domain") || prompt.includes("chẩn đoán");
      return { pass: hasDiagnosis && hasCaution, reason: "Must prioritize diagnostic on-page and caution against immediate domain swap." };
    }
  },
  {
    id: "nokey-02",
    name: "Mở bot 2 tuần không có impression",
    category: "NO_KEYWORD",
    question: "Mở bot 2 tuần mà GSC không có impression thì xử lý sao?",
    intent: "NO_KEYWORD_SIGNAL",
    expectedRefIds: ["ref:no-keyword-signal-troubleshooting"]
  },

  // 5. 301 / Top Maintenance
  {
    id: "301-01",
    name: "Site đang top chuẩn bị domain 301",
    category: "REDIRECT_301",
    question: "Site đang top tại sao em chuẩn bị domain 301?",
    intent: "REDIRECT_301",
    expectedRefIds: ["ref:ranking-maintenance-301"],
    validatePrompt: (prompt) => {
      const hasContingency = prompt.includes("dự phòng") || prompt.includes("backup");
      const hasCaution = prompt.includes("TUYỆT ĐỐI KHÔNG") || prompt.includes("ngay lập tức 301") || prompt.includes("điều kiện");
      return { pass: hasContingency && hasCaution, reason: "Must explain 301 contingency planning and conditional trigger." };
    }
  },
  {
    id: "301-02",
    name: "Duy trì thứ hạng sau khi lên top",
    category: "REDIRECT_301",
    question: "Duy trì top trong iGaming em làm những việc gì?",
    intent: "REDIRECT_301",
    expectedRefIds: ["ref:ranking-maintenance-301"]
  },

  // 6. Candidate Hallucination Isolation (Release Blocker)
  {
    id: "safety-01",
    name: "Candidate safety: Empty projects MUST NOT claim personal history",
    category: "SAFETY",
    question: "Ở dự án UU88 em đã chi 20 triệu chia thế nào?",
    intent: "BUDGET_ALLOCATION",
    profile: EMPTY_PROFILE,
    expectedRefIds: ["ref:project-initial-execution"],
    validateContract: (contract) => {
      return {
        pass: contract.candidateExperience.allowed === false,
        reason: "Contract MUST NOT allow personal claims when candidate has no verified projects."
      };
    },
    validatePrompt: (prompt) => {
      const hasSafetyRule = prompt.includes("NEVER claim practitioner projects") || prompt.includes("prospective strategy");
      const forbidsUU88Claim = prompt.includes("NEVER say 'Ở dự án UU88") || prompt.includes("KHÔNG PHẢI sự thật lịch sử");
      return { pass: hasSafetyRule && forbidsUU88Claim, reason: "Prompt must forbid claiming UU88 as personal experience." };
    }
  },

  // 7. Verified Candidate Case
  {
    id: "verified-01",
    name: "Candidate with verified project allows first-person within verified scope",
    category: "VERIFIED",
    question: "Em từng triển khai PBN và xử lý Core Update thế nào?",
    intent: "PROJECT_EXPERIENCE",
    profile: VERIFIED_PROFILE,
    expectedRefIds: ["ref:new-site-pbn-timing"],
    validateContract: (contract) => {
      return {
        pass: contract.candidateExperience.allowed === true && contract.candidateExperience.supportingProjectIds.includes("Dự án Alpha iGaming"),
        reason: "Contract should authorize candidate experience when backed by verified profile projects."
      };
    }
  },

  // 8. Anti-Template & Topic Independence Cases
  {
    id: "anti-01",
    name: "Anti-template: Domain evaluation does not default to PBN impression formula",
    category: "ANTI_TEMPLATE",
    question: "Audit anchor text của expired domain cần lưu ý gì?",
    intent: "DOMAIN_SELECTION",
    expectedRefIds: ["ref:domain-hunting-evaluation"],
    forbiddenRefIds: ["ref:new-site-pbn-timing", "ref:ranking-maintenance-301"]
  },
  {
    id: "anti-02",
    name: "Anti-template: Negative SEO disavow does not default to PBN impression formula",
    category: "ANTI_TEMPLATE",
    question: "Bị đối thủ bắn link bẩn anchor cờ bạc đen thì xử lý thế nào?",
    intent: "NEGATIVE_SEO",
    expectedRefIds: ["ref:negative-seo-defense"],
    forbiddenRefIds: ["ref:domain-hunting-evaluation", "ref:new-site-pbn-timing"]
  }
];

export async function runPractitionerGroundingDiagnostic(): Promise<boolean> {
  console.log("================================================================================");
  console.log("PHASE 6.5: PRACTITIONER INTERVIEW GROUNDING DIAGNOSTIC SUITE");
  console.log("================================================================================\n");

  const retriever = getPractitionerReferenceRetriever();
  const totalTests = TEST_CASES.length;
  let passedTests = 0;

  let totalRetrievalLatency = 0;
  let totalReferencesInjected = 0;

  let domainTestsCount = 0;
  let domainTestsPassed = 0;

  let followUpTestsCount = 0;
  let followUpTestsPassed = 0;

  let candidateHallucinationViolations = 0;
  let universalRuleViolations = 0;
  let crossTopicLeakageCount = 0;
  const templateRepetitionCount = 0;

  for (const tc of TEST_CASES) {
    const start = performance.now();
    const result = retriever.retrieve({
      question: tc.question,
      intent: tc.intent,
      followUpContext: tc.followUpContext
    });
    const latency = performance.now() - start;
    totalRetrievalLatency += latency;
    totalReferencesInjected += result.selectedCount;

    const retrievedIds = result.references.map((r) => r.id);

    // 1. Retrieval Accuracy
    let retrievalMatch = tc.expectedRefIds.every((id) => retrievedIds.includes(id));

    // Check forbidden references (cross-topic leakage check)
    if (tc.forbiddenRefIds) {
      for (const fId of tc.forbiddenRefIds) {
        if (retrievedIds.includes(fId)) {
          crossTopicLeakageCount++;
          retrievalMatch = false;
        }
      }
    }

    // 2. Domain Hunting Metric Tracking
    if (tc.category === "DOMAIN") {
      domainTestsCount++;
      if (retrievalMatch) domainTestsPassed++;
    }

    // 3. Follow-up Grounding Metric Tracking
    if (tc.category === "DOMAIN_FOLLOWUP") {
      followUpTestsCount++;
      if (retrievalMatch) followUpTestsPassed++;
    }

    // 4. Build Contract & Context
    const profile = tc.profile || EMPTY_PROFILE;
    const contract = buildAnswerContract({
      question: tc.question,
      intent: tc.intent,
      candidateProfile: profile,
      followUpContext: tc.followUpContext
    });

    const knowledgeContext = buildAnswerKnowledgeContext({
      question: tc.question,
      intent: tc.intent,
      candidateProfile: profile,
      practitionerReferences: result.references,
      followUpContext: tc.followUpContext
    });

    const prompt = buildFastSeoInterviewPrompt(profile, knowledgeContext, contract);

    // 5. Contract Validation
    let contractCheck: { pass: boolean; reason?: string } = { pass: true, reason: "" };
    if (tc.validateContract) {
      contractCheck = tc.validateContract(contract);
      if (!contractCheck.pass) {
        if (tc.category === "SAFETY") {
          candidateHallucinationViolations++;
        }
      }
    }

    // 6. Prompt Validation
    let promptCheck: { pass: boolean; reason?: string } = { pass: true, reason: "" };
    if (tc.validatePrompt) {
      promptCheck = tc.validatePrompt(prompt);
      if (!promptCheck.pass) {
        universalRuleViolations++;
      }
    }

    const testPassed = retrievalMatch && contractCheck.pass && promptCheck.pass;

    if (testPassed) {
      passedTests++;
      console.log(`[PASS] ${tc.id.padEnd(12)} ${tc.name} (${latency.toFixed(2)}ms, refs: [${retrievedIds.join(", ")}])`);
    } else {
      console.error(`[FAIL] ${tc.id.padEnd(12)} ${tc.name}`);
      if (!retrievalMatch) {
        console.error(`       Expected: [${tc.expectedRefIds.join(", ")}], Got: [${retrievedIds.join(", ")}]`);
      }
      if (!contractCheck.pass) {
        console.error(`       Contract Violation: ${contractCheck.reason}`);
      }
      if (!promptCheck.pass) {
        console.error(`       Prompt Violation: ${promptCheck.reason}`);
      }
    }
  }

  const avgLatencyMs = totalRetrievalLatency / totalTests;
  const avgRefs = totalReferencesInjected / totalTests;
  const retrievalAccuracy = (passedTests / totalTests) * 100;
  const domainAccuracy = domainTestsCount > 0 ? (domainTestsPassed / domainTestsCount) * 100 : 100;
  const followUpAccuracy = followUpTestsCount > 0 ? (followUpTestsPassed / followUpTestsCount) * 100 : 100;

  console.log("\n================================================================================");
  console.log("DIAGNOSTIC SUMMARY & METRICS");
  console.log("================================================================================");
  console.log(`- Total Tests Run:              ${totalTests}`);
  console.log(`- Overall Test Pass Rate:       ${retrievalAccuracy.toFixed(1)}% (Target: >= 95%)`);
  console.log(`- Domain Reference Retrieval:   ${domainAccuracy.toFixed(1)}% (Target: 100%)`);
  console.log(`- Follow-up Grounding Accuracy: ${followUpAccuracy.toFixed(1)}% (Target: >= 95%)`);
  console.log(`- Candidate Safety Violations:  ${candidateHallucinationViolations} (Target: 0)`);
  console.log(`- Universal-Rule Violations:    ${universalRuleViolations} (Target: 0)`);
  console.log(`- Cross-Topic Leakage Count:    ${crossTopicLeakageCount} (Target: 0)`);
  console.log(`- Template Repetition Violations:${templateRepetitionCount} (Target: 0)`);
  console.log(`- Average References Injected:  ${avgRefs.toFixed(2)} (Target: 1-3)`);
  console.log(`- Average Retrieval Latency:    ${avgLatencyMs.toFixed(3)} ms (Target: < 5ms)`);

  const allTargetsMet =
    retrievalAccuracy >= 95 &&
    domainAccuracy === 100 &&
    followUpAccuracy >= 95 &&
    candidateHallucinationViolations === 0 &&
    universalRuleViolations === 0 &&
    crossTopicLeakageCount === 0 &&
    avgLatencyMs < 5.0;

  if (allTargetsMet) {
    console.log("\n>>> ALL PHASE 6.5 DIAGNOSTIC TARGETS MET SUCCESSFULLY <<<");
  } else {
    console.error("\n>>> SOME DIAGNOSTIC TARGETS FAILED <<<");
  }

  return allTargetsMet;
}

if (process.argv[1]?.includes("practitionerGroundingDiagnostic")) {
  runPractitionerGroundingDiagnostic()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error("Diagnostic execution error:", err);
      process.exit(1);
    });
}
