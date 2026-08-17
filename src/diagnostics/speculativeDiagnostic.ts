import { SemanticEvidenceAccumulator } from "../question-detector/semanticEvidence";
import { SpeculativePrewarmPolicy } from "../question-detector/speculativePrewarmPolicy";

async function runSpeculativeDiagnostic() {
  console.log("\n[SPECULATIVE DIAGNOSTIC TIMELINE SIMULATION]");
  console.log("============================================");

  const accumulator = new SemanticEvidenceAccumulator();
  const prewarmPolicy = new SpeculativePrewarmPolicy();

  const partialSequence = [
    { text: "Budget tháng đầu khoảng hai mươi triệu", delayMs: 400 },
    { text: "Budget tháng đầu khoảng hai mươi triệu em phân bổ content", delayMs: 800 },
    { text: "Budget tháng đầu khoảng hai mươi triệu em phân bổ content Entity Guest Post", delayMs: 1400 },
    { text: "Budget tháng đầu khoảng hai mươi triệu em phân bổ content Entity Guest Post với PBN như thế nào?", delayMs: 2100 }
  ];

  let intentConfidentAt: number | undefined;
  let prewarmStartedAt: number | undefined;
  let simulatedGeminiFirstChunkAt: number | undefined;
  let speechEndedAt: number | undefined;
  let firstVisibleAnswerAt: number | undefined;

  let geminiRequests = 0;
  let speculativeReused = false;

  console.log("Timeline events:");
  for (let i = 0; i < partialSequence.length; i++) {
    const step = partialSequence[i];
    const isFinal = i === partialSequence.length - 1;

    if (isFinal) {
      accumulator.appendFinal(step.text);
      speechEndedAt = step.delayMs;
    } else {
      accumulator.appendPartial(step.text);
    }

    const state = accumulator.getState();
    const eligibility = prewarmPolicy.evaluate(state);

    console.log(`\n+${step.delayMs}ms Partial ${i + 1}: "${step.text}"`);
    console.log(`  -> Intent: ${state.bestIntent} (confidence: ${state.confidence.toFixed(2)})`);
    console.log(`  -> Prewarm Eligible: ${eligibility.eligible} (${eligibility.reason})`);

    if (eligibility.eligible && prewarmStartedAt === undefined) {
      prewarmStartedAt = step.delayMs;
      intentConfidentAt = step.delayMs;
      geminiRequests++;
      // Gemini TTFT is ~2000ms from request start
      simulatedGeminiFirstChunkAt = prewarmStartedAt + 2000;
      console.log(`  -> [GEMINI REQUEST #1 STARTED] at +${prewarmStartedAt}ms (background prewarm)`);
    }

    if (isFinal && speechEndedAt !== undefined) {
      if (prewarmStartedAt !== undefined && state.bestIntent === "BUDGET_ALLOCATION") {
        speculativeReused = true;
        // First visible answer is immediately when Gemini first chunk is available or speech ends
        firstVisibleAnswerAt = Math.max(speechEndedAt, simulatedGeminiFirstChunkAt ?? speechEndedAt);
      }
    }
  }

  const speechEndToFirstVisibleAnswerMs =
    firstVisibleAnswerAt !== undefined && speechEndedAt !== undefined
      ? Math.max(0, firstVisibleAnswerAt - speechEndedAt)
      : 0;

  console.log("\n============================================");
  console.log("[SPECULATIVE DIAGNOSTIC SUMMARY]");
  console.log(`intent: ${accumulator.getState().bestIntent}`);
  console.log(`intentConfidentAt: +${intentConfidentAt}ms`);
  console.log(`prewarmStartedAt: +${prewarmStartedAt}ms`);
  console.log(`geminiFirstChunkAt: +${simulatedGeminiFirstChunkAt}ms`);
  console.log(`speechEndedAt: +${speechEndedAt}ms`);
  console.log(`firstVisibleAnswerAt: +${firstVisibleAnswerAt}ms`);
  console.log(`speechEndToFirstVisibleAnswerMs: ${speechEndToFirstVisibleAnswerMs} ms`);
  console.log(`speculativeReused: ${speculativeReused}`);
  console.log(`geminiRequests: ${geminiRequests}`);
  console.log("============================================\n");
}

void runSpeculativeDiagnostic();
