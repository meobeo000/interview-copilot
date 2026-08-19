import { performance } from "perf_hooks";
import { getPractitionerReferenceRetriever } from "../knowledge/practitionerReferenceRetriever";
import { SEEDED_PRACTITIONER_REFERENCES } from "../knowledge/practitionerInterviewReference";
import { buildAnswerKnowledgeContext } from "../knowledge/answerKnowledgeContextBuilder";
import { buildAnswerContract } from "../llm/answerContract";
import { buildFastSeoInterviewPrompt } from "../llm/prompts/fastSeoInterviewPrompt";
import { validateSpokenAnswerStyle } from "../llm/spokenAnswerStyle";
import type { CandidateProfile } from "../shared/candidateProfile";
import type { QuestionIntentCategory } from "../question-detector/intentClassifier";
import type { ResolvedFollowUpContext } from "../question-detector/interviewTurnContext";

interface PlaybookDiagnosticTestCase {
  id: string;
  name: string;
  category:
    | "DOMAIN"
    | "DOMAIN_NEGATIVE"
    | "DOMAIN_FOLLOWUP"
    | "PBN_TIMING"
    | "NO_KEYWORD"
    | "REDIRECT_301"
    | "SAFETY"
    | "VERIFIED"
    | "ACRONYM_STYLE"
    | "NEGATIVE_CONTROL"
    | "ANTI_TEMPLATE";
  question: string;
  intent: QuestionIntentCategory;
  followUpContext?: ResolvedFollowUpContext;
  profile?: CandidateProfile;
  expectedRefIds: string[];
  forbiddenRefIds?: string[];
  sampleGeneratedAnswer?: string;
  validateContract?: (contract: ReturnType<typeof buildAnswerContract>) => { pass: boolean; reason?: string };
  validatePrompt?: (prompt: string) => { pass: boolean; reason?: string };
}

const EMPTY_PROFILE: CandidateProfile = {
  fullName: "Ứng viên A",
  role: "SEO Specialist",
  background: "",
  skills: [],
  seoSkills: [],
  tools: [],
  projects: [],
  markets: [],
  strengths: [],
  experienceNotes: ""
};

const VERIFIED_PROFILE: CandidateProfile = {
  fullName: "Ứng viên B",
  role: "Senior SEO Specialist",
  background: "3 năm kinh nghiệm SEO tổng thể.",
  skills: ["SEO Strategy", "Technical SEO"],
  seoSkills: ["PBN", "Expired Domain", "Core Update Recovery"],
  tools: ["Ahrefs", "GSC", "Screaming Frog"],
  projects: [
    {
      name: "Dự án Alpha iGaming",
      role: "SEO Lead",
      description: "Xây dựng hệ thống PBN và phục hồi site sau Core Update.",
      metrics: "Traffic 50k/tháng, top 3 từ khóa chính"
    }
  ],
  markets: ["Việt Nam"],
  strengths: ["PBN building", "Domain hunting"],
  experienceNotes: "Thực chiến 3 năm."
};

const PLAYBOOK_TEST_CASES: PlaybookDiagnosticTestCase[] = [
  // 1. Domain Hunting & Evaluation
  {
    id: "pb-dom-01",
    name: "Tiêu chí săn domain iGaming",
    category: "DOMAIN",
    question: "Tiêu chí săn domain của em là gì?",
    intent: "DOMAIN_SELECTION",
    expectedRefIds: ["ref:domain-hunting-evaluation"],
    forbiddenRefIds: ["ref:new-site-pbn-timing", "ref:ranking-maintenance-301"]
  },
  {
    id: "pb-dom-02",
    name: "DR cao vs Traffic thật",
    category: "DOMAIN",
    question: "Domain A DR 55 traffic 0 vs Domain B DR 20 traffic thật chọn con nào?",
    intent: "DOMAIN_SELECTION",
    expectedRefIds: ["ref:domain-hunting-evaluation"]
  },
  {
    id: "pb-dom-03",
    name: "Wayback Machine check",
    category: "DOMAIN",
    question: "Wayback sạch nhưng anchor profile từng spam thì em có mua không?",
    intent: "DOMAIN_SELECTION",
    expectedRefIds: ["ref:domain-hunting-evaluation"]
  },
  {
    id: "pb-dom-04",
    name: "TLD Testing .in, .me, .my",
    category: "DOMAIN",
    question: "Em test .in và .me như thế nào?",
    intent: "DOMAIN_SELECTION",
    expectedRefIds: ["ref:tld-testing-experimentation"]
  },
  {
    id: "pb-dom-neg-01",
    name: "Domain authority drop must NOT match domain hunting",
    category: "DOMAIN_NEGATIVE",
    question: "Domain authority của site giảm nhưng traffic vẫn ổn.",
    intent: "GSC_RANKING_DROP",
    expectedRefIds: [],
    forbiddenRefIds: ["ref:domain-hunting-evaluation"]
  },
  {
    id: "pb-dom-neg-02",
    name: "Domain backlink profile drop must NOT match domain hunting",
    category: "DOMAIN_NEGATIVE",
    question: "Domain backlink profile đang mất referring domains.",
    intent: "GSC_RANKING_DROP",
    expectedRefIds: [],
    forbiddenRefIds: ["ref:domain-hunting-evaluation"]
  },

  // 2. Follow-Up Continuity
  {
    id: "pb-fup-01",
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
    expectedRefIds: ["ref:tld-testing-experimentation"]
  },
  {
    id: "pb-fup-02",
    name: "Follow-up 'Tại sao ngày 10?'",
    category: "PBN_TIMING",
    question: "Tại sao ngày 10?",
    intent: "PBN_TIMING",
    followUpContext: {
      followUpType: "WHY",
      contextResolved: true,
      currentUtterance: "Tại sao ngày 10?",
      previousQuestion: "Em thường cân nhắc PBN khoảng ngày thứ 10.",
      targetEntity: "ngày thứ 10",
      inheritedIntent: "PBN_TIMING",
      inheritedEntities: ["PBN", "ngày thứ 10"],
      inheritedNumericFacts: [],
      resolutionMs: 0.1,
      resolvedMeaning: "Tại sao lại chọn mốc thời gian khoảng ngày thứ 10 để đi PBN?"
    },
    expectedRefIds: ["ref:new-site-pbn-timing"]
  },

  // 3. PBN Timing & Heuristics
  {
    id: "pb-pbn-01",
    name: "Khi nào bắt đầu đi link PBN",
    category: "PBN_TIMING",
    question: "Khi nào mới bắt đầu đi link PBN cho site mới?",
    intent: "PBN_TIMING",
    expectedRefIds: ["ref:new-site-pbn-timing"]
  },

  // 4. No Keyword Signal Troubleshooting
  {
    id: "pb-nokey-01",
    name: "Site index 2 tuần chưa nhận key",
    category: "NO_KEYWORD",
    question: "Site index rồi nhưng hai tuần vẫn không nhận key, em làm gì?",
    intent: "NO_KEYWORD_SIGNAL",
    expectedRefIds: ["ref:no-keyword-signal-troubleshooting"]
  },

  // 5. 301 & Top Maintenance
  {
    id: "pb-301-01",
    name: "Duy trì top & chuẩn bị domain 301",
    category: "REDIRECT_301",
    question: "Site đang top tại sao em chuẩn bị domain 301?",
    intent: "REDIRECT_301",
    expectedRefIds: ["ref:ranking-maintenance-301"]
  },

  // 6. Candidate Safety & Isolation
  {
    id: "pb-safe-01",
    name: "Empty profile MUST NOT claim UU88",
    category: "SAFETY",
    question: "Dự án gần nhất em làm là dự án nào?",
    intent: "PROJECT_EXPERIENCE",
    profile: EMPTY_PROFILE,
    expectedRefIds: [],
    validatePrompt: (prompt) => {
      const safe = prompt.includes("Không có thông tin cá nhân nào được xác thực");
      const noUU88 = !prompt.includes("Dự án thật: UU88");
      return { pass: safe && noUU88, reason: "Must not claim UU88 for empty candidate." };
    }
  },
  {
    id: "pb-safe-02",
    name: "Empty profile MUST NOT claim spent 20m",
    category: "SAFETY",
    question: "Ở dự án UU88 em đã chi 20 triệu chia thế nào?",
    intent: "BUDGET_ALLOCATION",
    profile: EMPTY_PROFILE,
    expectedRefIds: ["ref:project-initial-execution"],
    validateContract: (contract) => {
      return {
        pass: contract.candidateExperience.allowed === false,
        reason: "Contract MUST NOT authorize personal claims for empty profile."
      };
    },
    validatePrompt: (prompt) => {
      const forbidsUU88 = prompt.includes("NEVER claim 'Ở dự án UU88") || prompt.includes("NEVER claim practitioner projects");
      return { pass: forbidsUU88, reason: "Prompt must explicitly forbid claiming UU88." };
    }
  },

  // 7. Verified Profile Positive Control
  {
    id: "pb-ver-01",
    name: "Verified candidate project authorizes first-person within verified scope",
    category: "VERIFIED",
    question: "Em từng triển khai PBN và xử lý Core Update thế nào?",
    intent: "PROJECT_EXPERIENCE",
    profile: VERIFIED_PROFILE,
    expectedRefIds: ["ref:new-site-pbn-timing"],
    validateContract: (contract) => {
      return {
        pass: contract.candidateExperience.allowed === true && contract.candidateExperience.supportingProjectIds.includes("Dự án Alpha iGaming"),
        reason: "Verified project must authorize experience within scope."
      };
    }
  },

  // 8. Acronym First-Mention Style Tests
  {
    id: "pb-style-01",
    name: "GSC first mention expansion validator",
    category: "ACRONYM_STYLE",
    question: "GSC em nhìn chỉ số nào?",
    intent: "ONPAGE_DIAGNOSIS",
    expectedRefIds: [],
    sampleGeneratedAnswer: "Em theo dõi Google Search Console (GSC) để quan sát indexing và impression. Khi GSC ổn định em mới đi tiếp.",
    validatePrompt: (prompt) => {
      const hasGscRule = prompt.includes('GSC -> "Google Search Console (GSC)"');
      return { pass: hasGscRule, reason: "Prompt must contain GSC expansion directive." };
    }
  },
  {
    id: "pb-style-02",
    name: "PBN and DR first mention expansion validator",
    category: "ACRONYM_STYLE",
    question: "DR cao có nên đi PBN không?",
    intent: "PBN_TIMING",
    expectedRefIds: ["ref:new-site-pbn-timing"],
    sampleGeneratedAnswer: "Với case này em ưu tiên Domain Rating (DR) thật kết hợp Private Blog Network (PBN). Sau đó PBN được duy trì đều đặn.",
    validatePrompt: (prompt) => {
      const hasPbnRule = prompt.includes('PBN -> "Private Blog Network (PBN)"');
      const hasDrRule = prompt.includes('DR  -> "Domain Rating (DR)"');
      return { pass: hasPbnRule && hasDrRule, reason: "Prompt must contain PBN & DR expansion directives." };
    }
  },

  // 9. Negative Controls & Boundaries
  {
    id: "pb-neg-01",
    name: "Canonical tag question returns ZERO practitioner playbooks",
    category: "NEGATIVE_CONTROL",
    question: "Canonical tag đặt thế nào để chuẩn technical SEO?",
    intent: "ONPAGE_DIAGNOSIS",
    expectedRefIds: []
  },
  {
    id: "pb-neg-02",
    name: "CTR drop without domain question returns ZERO domain playbooks",
    category: "NEGATIVE_CONTROL",
    question: "CTR giảm 30% nhưng position giữ nguyên thì check gì?",
    intent: "GSC_RANKING_DROP",
    expectedRefIds: [],
    forbiddenRefIds: ["ref:domain-hunting-evaluation", "ref:tld-testing-experimentation"]
  }
];

export async function runPractitionerPlaybookDiagnostic(): Promise<boolean> {
  console.log("================================================================================");
  console.log("PHASE 6.6: PRACTITIONER PLAYBOOK INGESTION & SPOKEN STYLE DIAGNOSTIC");
  console.log("================================================================================\n");

  const retriever = getPractitionerReferenceRetriever();
  // Warm up
  retriever.retrieve({ question: "warmup query", intent: "DOMAIN_SELECTION" });

  const totalEntriesExtracted = SEEDED_PRACTITIONER_REFERENCES.length;
  const totalTests = PLAYBOOK_TEST_CASES.length;
  let passedTests = 0;

  let totalRetrievalLatency = 0;
  let totalReferencesInjected = 0;

  let domainPositiveCount = 0;
  let domainPositivePassed = 0;
  let domainNegativeCount = 0;
  let domainNegativePassed = 0;

  let followUpCount = 0;
  let followUpPassed = 0;

  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0;

  let candidateSafetyViolations = 0;
  let universalizationViolations = 0;
  let crossTopicLeakageCount = 0;
  let acronymContractPassed = 0;
  let acronymContractTotal = 0;

  for (const tc of PLAYBOOK_TEST_CASES) {
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
    let retrievalMatch = true;
    if (tc.expectedRefIds.length === 0) {
      if (retrievedIds.length === 0) {
        trueNegatives++;
      } else {
        falsePositives++;
        retrievalMatch = false;
      }
    } else {
      const allFound = tc.expectedRefIds.every((id) => retrievedIds.includes(id));
      if (allFound) {
        truePositives++;
      } else {
        falseNegatives++;
        retrievalMatch = false;
      }
    }

    // Check forbidden references
    if (tc.forbiddenRefIds) {
      for (const fId of tc.forbiddenRefIds) {
        if (retrievedIds.includes(fId)) {
          crossTopicLeakageCount++;
          retrievalMatch = false;
        }
      }
    }

    // 2. Domain Tracking
    if (tc.category === "DOMAIN") {
      domainPositiveCount++;
      if (retrievalMatch) domainPositivePassed++;
    }
    if (tc.category === "DOMAIN_NEGATIVE") {
      domainNegativeCount++;
      if (!retrievedIds.includes("ref:domain-hunting-evaluation") && !retrievedIds.includes("ref:tld-testing-experimentation")) {
        domainNegativePassed++;
      }
    }

    // 3. Follow-up Tracking
    if (tc.category === "DOMAIN_FOLLOWUP" || tc.category === "PBN_TIMING" && tc.followUpContext) {
      followUpCount++;
      if (retrievalMatch) followUpPassed++;
    }

    // 4. Contract & Context Generation
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
        if (tc.category === "SAFETY") candidateSafetyViolations++;
      }
    }

    // 6. Prompt Validation
    let promptCheck: { pass: boolean; reason?: string } = { pass: true, reason: "" };
    if (tc.validatePrompt) {
      promptCheck = tc.validatePrompt(prompt);
      if (!promptCheck.pass) universalizationViolations++;
    }

    // 7. Acronym Style Validation
    let styleCheckPassed = true;
    if (tc.category === "ACRONYM_STYLE" && tc.sampleGeneratedAnswer) {
      acronymContractTotal++;
      const styleValidation = validateSpokenAnswerStyle(tc.sampleGeneratedAnswer);
      if (styleValidation.valid) {
        acronymContractPassed++;
      } else {
        styleCheckPassed = false;
      }
    }

    const testPassed = retrievalMatch && contractCheck.pass && promptCheck.pass && styleCheckPassed;

    if (testPassed) {
      passedTests++;
      console.log(`[PASS] ${tc.id.padEnd(16)} ${tc.name} (${latency.toFixed(2)}ms, refs: [${retrievedIds.join(", ")}])`);
    } else {
      console.error(`[FAIL] ${tc.id.padEnd(16)} ${tc.name}`);
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
  const passRate = (passedTests / totalTests) * 100;
  const precision = (truePositives + trueNegatives) / (truePositives + trueNegatives + falsePositives || 1);
  const recall = truePositives / (truePositives + falseNegatives || 1);
  const domainPrecision =
    domainPositiveCount + domainNegativeCount > 0
      ? ((domainPositivePassed + domainNegativePassed) / (domainPositiveCount + domainNegativeCount)) * 100
      : 100;
  const followUpAccuracy = followUpCount > 0 ? (followUpPassed / followUpCount) * 100 : 100;
  const acronymContractAccuracy = acronymContractTotal > 0 ? (acronymContractPassed / acronymContractTotal) * 100 : 100;

  console.log("\n================================================================================");
  console.log("PHASE 6.6 DIAGNOSTIC METRICS SUMMARY");
  console.log("================================================================================");
  console.log(`- Playbook Entries Extracted:   ${totalEntriesExtracted} (Target: >= 10)`);
  console.log(`- Total Diagnostic Tests:       ${totalTests}`);
  console.log(`- Overall Test Pass Rate:       ${passRate.toFixed(1)}% (Target: >= 95%)`);
  console.log(`- Practitioner Precision:       ${(precision * 100).toFixed(1)}% (Target: >= 95%)`);
  console.log(`- Practitioner Recall:          ${(recall * 100).toFixed(1)}% (Target: >= 90%)`);
  console.log(`- Domain Retrieval Precision:   ${domainPrecision.toFixed(1)}% (Target: 100%)`);
  console.log(`- Follow-up Grounding Accuracy: ${followUpAccuracy.toFixed(1)}% (Target: >= 95%)`);
  console.log(`- Candidate Safety Violations:  ${candidateSafetyViolations} (Target: 0)`);
  console.log(`- Universalization Violations:  ${universalizationViolations} (Target: 0)`);
  console.log(`- Acronym Style Contract Acc:   ${acronymContractAccuracy.toFixed(1)}% (Target: 100%)`);
  console.log(`- Cross-Topic Leakage Count:    ${crossTopicLeakageCount} (Target: <= 1)`);
  console.log(`- Average References Injected:  ${avgRefs.toFixed(2)} (Target: <= 2)`);
  console.log(`- Average Retrieval Latency:    ${avgLatencyMs.toFixed(3)} ms (Target: < 5ms)`);

  const allTargetsMet =
    totalEntriesExtracted >= 10 &&
    passRate >= 95 &&
    precision >= 0.95 &&
    recall >= 0.90 &&
    domainPrecision === 100 &&
    followUpAccuracy >= 95 &&
    candidateSafetyViolations === 0 &&
    universalizationViolations === 0 &&
    acronymContractAccuracy === 100 &&
    crossTopicLeakageCount <= 1 &&
    avgRefs <= 2.0 &&
    avgLatencyMs < 5.0;

  if (allTargetsMet) {
    console.log("\n>>> ALL PHASE 6.6 PLAYBOOK & SPOKEN STYLE TARGETS MET SUCCESSFULLY <<<");
  } else {
    console.error("\n>>> SOME DIAGNOSTIC TARGETS FAILED <<<");
  }

  return allTargetsMet;
}

if (process.argv[1]?.includes("practitionerPlaybookDiagnostic")) {
  runPractitionerPlaybookDiagnostic()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error("Diagnostic execution error:", err);
      process.exit(1);
    });
}
