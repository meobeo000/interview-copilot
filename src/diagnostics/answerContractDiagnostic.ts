import { buildAnswerContract, formatContractForPrompt } from "../llm/answerContract";
import { buildFastSeoInterviewPrompt } from "../llm/prompts/fastSeoInterviewPrompt";
import { SemanticEvidenceAccumulator } from "../question-detector/semanticEvidence";
import { DEFAULT_CANDIDATE_PROFILE } from "../shared/candidateProfile";

async function runAnswerContractDiagnostic() {
  console.log("\n[PHASE 4: ANSWER CONTRACT & PRACTITIONER PROMPT DIAGNOSTIC]");
  console.log("============================================================");

  const testCases = [
    {
      id: "1. 20M BUDGET ALLOCATION",
      rawSpeech: "bớt chết ban đầu khoảng hai mươi triệu thì em phân bổ content entity guest post và pbn thế nào?",
      normalizedQuestion: "Budget ban đầu khoảng hai mươi triệu thì em sẽ phân bổ content, Entity, Guest Post và PBN như thế nào?",
      intent: "BUDGET_ALLOCATION"
    },
    {
      id: "2. DR55 VS DR20 DOMAIN SELECTION",
      rawSpeech: "domain a dr năm mươi lăm traffic bằng không domain b dr hai mươi có traffic thật em chọn con nào?",
      normalizedQuestion: "Domain A DR 55 traffic bằng 0, domain B DR 20 nhưng có traffic thật và backlink đúng niche, em chọn con nào?",
      intent: "DOMAIN_SELECTION"
    },
    {
      id: "3. SITE INDEXED 2 WEEKS NO KEYWORD DIAGNOSIS",
      rawSpeech: "site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý sao?",
      normalizedQuestion: "Site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý thế nào?",
      intent: "NO_KEYWORD_SIGNAL"
    },
    {
      id: "4. PBN DAY 10 TIMING QUESTION",
      rawSpeech: "tại sao ngày thứ mười em mới bắt đầu đi pbn?",
      normalizedQuestion: "Tại sao ngày thứ 10 em mới bắt đầu đi PBN cho site mới?",
      intent: "PBN_TIMING"
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
      candidateProfile: DEFAULT_CANDIDATE_PROFILE
    });

    console.log(`\n[ANSWER CONTRACT]`);
    console.log(`intent: ${contract.intent}`);
    console.log(`answerType: ${contract.answerType}`);
    console.log(`requiredFacts: ${JSON.stringify(contract.requiredFacts)}`);
    console.log(`requiredEntities: ${JSON.stringify(contract.requiredEntities)}`);
    console.log(`preferredStructure: ${contract.preferredStructure}`);
    console.log(`firstSentenceDirective: ${contract.firstSentenceDirective}`);
    console.log(`maxWords: ${contract.maxWords}`);
    console.log(`candidateExperienceAllowed: ${contract.candidateExperienceAllowed}`);
    console.log(`contractBuildMs: ${contract.contractBuildMs} ms`);

    const contractSnippet = formatContractForPrompt(contract);

    console.log(`\n[GENERATED CONTRACT PROMPT FRAGMENT]:`);
    console.log(contractSnippet);
    console.log(`\n[FULL PROMPT LENGTH]: ${buildFastSeoInterviewPrompt(DEFAULT_CANDIDATE_PROFILE, undefined, contract).length} characters`);
  }

  console.log("\n============================================================");
  console.log("[DIAGNOSTIC COMPLETED - ALL CONTRACTS BUILT SUCCESSFULLY]");
  console.log("============================================================\n");
}

void runAnswerContractDiagnostic();
