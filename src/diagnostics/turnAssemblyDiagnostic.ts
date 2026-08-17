import { TurnTranscriptAssembler } from "../transcription/turnTranscriptAssembler";
import { SemanticEvidenceAccumulator } from "../question-detector/semanticEvidence";
import { SpeculativePrewarmPolicy } from "../question-detector/speculativePrewarmPolicy";

async function runTurnAssemblyDiagnostic() {
  console.log("\n[TURN ASSEMBLY DIAGNOSTIC - DEEPGRAM REAL-TIME SIMULATION]");
  console.log("==========================================================");

  const assembler = new TurnTranscriptAssembler();
  const accumulator = new SemanticEvidenceAccumulator();
  const prewarmPolicy = new SpeculativePrewarmPolicy();

  const events = [
    { type: "partial", text: "bất chất betting ban đầu khoảng hai mươi", delayMs: 250 },
    { type: "partial", text: "betting ban đầu khoảng hai mươi triệu thì em", delayMs: 600 },
    { type: "partial", text: "betting ban đầu khoảng hai mươi triệu thì em sẽ phân bổ như thế", delayMs: 950 },
    { type: "final", text: "Budget ban đầu khoảng hai mươi triệu", delayMs: 1300 },
    { type: "partial", text: "thì em sẽ phân bổ như thế nào cho content", delayMs: 1650 },
    { type: "partial", text: "thì em sẽ phân bổ như thế nào cho content Entity Guest Post", delayMs: 2000 },
    { type: "final", text: "thì em sẽ phân bổ như thế nào cho content, Entity, Guest Post và PBN?", delayMs: 2400 },
    { type: "speech_final", text: "", delayMs: 2600 }
  ];

  for (const ev of events) {
    let assembled = "";
    if (ev.type === "partial") {
      assembled = assembler.applyPartial(ev.text);
    } else if (ev.type === "final") {
      assembled = assembler.applyFinal(ev.text);
    } else {
      assembled = assembler.applySpeechFinal();
    }

    accumulator.appendPartial(assembled);
    const state = accumulator.getState();
    const eligibility = prewarmPolicy.evaluate(state);

    console.log(`\n+${ev.delayMs}ms [${ev.type.toUpperCase()}] Raw: "${ev.text}"`);
    console.log(`  -> Display Transcript: "${assembled}"`);
    console.log(`  -> Intent: ${state.bestIntent} (${(state.confidence * 100).toFixed(0)}%) | Prewarm: ${eligibility.eligible ? "ELIGIBLE" : "WAITING"}`);
    console.log(`  -> Evidence: Money: ${JSON.stringify(state.moneyAmounts)} | Entities: ${JSON.stringify(state.seoEntities)}`);
  }

  console.log("\n==========================================================");
  console.log("[TURN ASSEMBLY SUMMARY]");
  console.log(`Final Committed Transcript: "${assembler.getCommittedTranscript()}"`);
  console.log(`Final Display Transcript: "${assembler.getDisplayTranscript()}"`);
  console.log(`Final Intent: ${accumulator.getState().bestIntent}`);
  console.log(`Duplicate Words Detected: ${assembler.getDisplayTranscript().includes("ban đầu khoảng hai mươi triệu Budget") ? "YES (BUG)" : "NO (CLEAN)"}`);
  console.log("==========================================================\n");
}

void runTurnAssemblyDiagnostic();
