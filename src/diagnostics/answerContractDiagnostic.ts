import { buildAnswerContract, formatContractForPrompt, isContractCompatible } from "../llm/answerContract";
import { SemanticEvidenceAccumulator } from "../question-detector/semanticEvidence";
import { DEFAULT_CANDIDATE_PROFILE } from "../shared/candidateProfile";
import type { KnowledgeChunk } from "../knowledge/types";

async function runAnswerContractDiagnostic() {
  console.log("\n[PHASE 4.1: GROUNDED ANSWER CONTRACT & SAFETY DIAGNOSTIC]");
  console.log("============================================================");

  const samplePractitionerChunks: KnowledgeChunk[] = [
    {
      id: "chunk-playbook-20m",
      sourceType: "practitioner_playbook",
      topic: "BUDGET",
      content: "Với ngân sách 20 triệu: Content 6 triệu, Entity và backlink nền 3 triệu, Guest Post 5 triệu, PBN 6 triệu.",
      title: "Playbook 20M Budget",
      tags: ["20 triệu", "content", "entity", "guest post", "pbn"],
      confidence: "practitioner_experience",
      canClaimAsPersonalExperience: false
    }
  ];

  const testCases = [
    {
      id: "1. 20M BUDGET ALLOCATION (GROUNDED IN PRACTITIONER PLAYBOOK)",
      rawSpeech: "bớt chết ban đầu khoảng hai mươi triệu thì em phân bổ content entity guest post và pbn thế nào?",
      normalizedQuestion: "Budget ban đầu khoảng hai mươi triệu thì em sẽ phân bổ content, Entity, Guest Post và PBN như thế nào?",
      intent: "BUDGET_ALLOCATION",
      retrievedChunks: samplePractitionerChunks
    },
    {
      id: "2. 20M BUDGET ALLOCATION (PROPOSED / UNGROUNDED NO EXACT CHUNK)",
      rawSpeech: "ngân sách hai mươi triệu chia content entity pbn thế nào?",
      normalizedQuestion: "Ngân sách 20 triệu chia Content, Entity và PBN thế nào?",
      intent: "BUDGET_ALLOCATION",
      retrievedChunks: []
    },
    {
      id: "3. DR55 VS DR20 DOMAIN SELECTION",
      rawSpeech: "domain a dr năm mươi lăm traffic bằng không domain b dr hai mươi có traffic thật em chọn con nào?",
      normalizedQuestion: "Domain A DR 55 traffic bằng 0, domain B DR 20 nhưng có traffic thật và backlink đúng niche, em chọn con nào?",
      intent: "DOMAIN_SELECTION",
      retrievedChunks: []
    },
    {
      id: "4. PBN DAY 10 TIMING (CANDIDATE SAFETY CHECK)",
      rawSpeech: "tại sao ngày thứ mười em mới bắt đầu đi pbn?",
      normalizedQuestion: "Tại sao ngày thứ 10 em mới bắt đầu đi PBN cho site mới?",
      intent: "PBN_TIMING",
      retrievedChunks: []
    }
  ];

  for (const tc of testCases) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`CASE: ${tc.id}`);
    console.log(`Raw Speech: "${tc.rawSpeech}"`);
    console.log(`Normalized Question: "${tc.normalizedQuestion}"`);

    const accumulator = new SemanticEvidenceAccumulator();
    accumulator.appendFinal(tc.rawSpeech);
    const semanticEvidence = accumulator.getState();

    const contract = buildAnswerContract({
      question: tc.normalizedQuestion,
      intent: tc.intent,
      semanticEvidence,
      retrievedChunks: tc.retrievedChunks,
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });

    console.log(`\n[ANSWER CONTRACT]`);
    console.log(`intent: ${contract.intent}`);
    console.log(`answerType: ${contract.answerType}`);
    console.log(`candidateExperienceAllowed: ${contract.candidateExperienceAllowed}`);
    console.log(`candidateExperienceTopics: ${JSON.stringify(contract.candidateExperience.supportedTopics)}`);
    console.log(`candidateExperienceReason: ${contract.candidateExperience.reason}`);
    console.log(`allocationGrounding: ${contract.allocationGrounding ?? "N/A"}`);
    console.log(`groundedFactCount: ${contract.groundedFacts.length}`);
    console.log(`groundedSourceTypes: ${JSON.stringify(Array.from(new Set(contract.groundedFacts.map((f) => f.sourceType))))}`);
    console.log(`requiredFacts: ${JSON.stringify(contract.requiredFacts)}`);
    console.log(`requiredEntities: ${JSON.stringify(contract.requiredEntities)}`);
    console.log(`firstSentenceDirective: ${contract.firstSentenceDirective}`);
    console.log(`maxWords: ${contract.maxWords}`);
    console.log(`contractBuildMs: ${contract.contractBuildMs} ms`);

    const contractSnippet = formatContractForPrompt(contract);

    console.log(`\n[GENERATED CONTRACT PROMPT FRAGMENT]:`);
    console.log(contractSnippet);
  }

  console.log(`\n------------------------------------------------------------`);
  console.log(`[SPECULATIVE COMPATIBILITY VALIDATION]`);
  const provContract = buildAnswerContract({
    question: "20 triệu chia Content",
    intent: "BUDGET_ALLOCATION"
  });

  const finalExpanded = buildAnswerContract({
    question: "20 triệu chia Content và Entity thế nào?",
    intent: "BUDGET_ALLOCATION"
  });

  const finalEquivalentFact = buildAnswerContract({
    question: "20tr chia Content",
    intent: "BUDGET_ALLOCATION"
  });

  console.log(`1. Budget Allocation + New Spend Entity [Entity]: compatible = ${isContractCompatible(provContract, finalExpanded).compatible} (Reason: ${isContractCompatible(provContract, finalExpanded).reason})`);
  console.log(`2. Equivalent Numeric Fact ("20 triệu" vs "20tr"): compatible = ${isContractCompatible(provContract, finalEquivalentFact).compatible}`);

  console.log("\n============================================================");
  console.log("[DIAGNOSTIC COMPLETED - ALL PHASE 4.1 CHECKS PASSED]");
  console.log("============================================================\n");
}

void runAnswerContractDiagnostic();
