import { runContinuousStressSession } from "./interviewStressHarness";

async function runDiagnostic() {
  console.log("\n============================================================");
  console.log("PHASE 5: REAL INTERVIEW STRESS TEST & OBSERVABILITY");
  console.log("============================================================\n");

  const { results, summary } = await runContinuousStressSession();

  console.log("---------------------------------------------------------------------------------------------------------------------------------");
  console.log("| Q   | Intent                 | Contract               | STT       | Commit | First Answer | Speculative | Status | Failures");
  console.log("---------------------------------------------------------------------------------------------------------------------------------");

  for (const r of results) {
    const qPad = r.id.padEnd(3);
    const intentPad = r.detectedIntent.slice(0, 22).padEnd(22);
    const contractPad = r.actualAnswerType.slice(0, 22).padEnd(22);
    const sttPad = r.transcriptQuality.slice(0, 9).padEnd(9);
    const commitPad = `${r.speechEndToCommitMs}ms`.padEnd(6);
    const firstPad = `${r.speechEndToFirstVisibleAnswerMs}ms`.padEnd(12);
    const specPad = (r.speculativeReused ? "REUSED" : r.speculativeReplaced ? "REPLACED" : "NONE").padEnd(11);
    const statusPad = r.status.padEnd(6);
    const failures = r.failureReasons.length > 0 ? r.failureReasons.join("; ") : "None";

    console.log(`| ${qPad} | ${intentPad} | ${contractPad} | ${sttPad} | ${commitPad} | ${firstPad} | ${specPad} | ${statusPad} | ${failures}`);
  }

  console.log("---------------------------------------------------------------------------------------------------------------------------------\n");

  console.log("========================================");
  console.log("REAL INTERVIEW STRESS TEST SUMMARY");
  console.log("========================================");
  console.log(`Total turns: ${summary.totalTurns}`);
  console.log(`Committed questions: ${summary.committedQuestions}`);
  console.log(`PASS: ${summary.passCount}`);
  console.log(`WARN: ${summary.warnCount}`);
  console.log(`FAIL: ${summary.failCount}`);
  console.log(`Intent accuracy: ${summary.intentAccuracy}%`);
  console.log(`AnswerContract accuracy: ${summary.answerContractAccuracy}%`);
  console.log(`Semantic recovery rate: ${summary.semanticRecoveryRate}%`);
  console.log(`Required entity coverage: ${summary.requiredEntityCoverageRate}%`);
  console.log(`Numeric fact integrity: ${summary.numericFactIntegrityRate}%`);
  console.log(`Candidate experience safety violations: ${summary.candidateExperienceSafetyViolations}`);
  console.log(`Duplicate commits: ${summary.duplicateCommitCount}`);
  console.log(`Stale turn reuse: ${summary.staleTurnReuseCount}`);
  console.log(`Gemini requests: ${summary.totalGeminiRequests}`);
  console.log(`Speculative reuse rate: ${summary.speculativeReuseRate}%`);
  console.log(`Speculative replacement rate: ${summary.speculativeReplacementRate}%`);
  console.log(`Median speech-end → commit: ${summary.speechEndToCommit.median}ms`);
  console.log(`P95 speech-end → commit: ${summary.speechEndToCommit.p95}ms`);
  console.log(`Median speech-end → first visible: ${summary.speechEndToFirstVisible.median}ms`);
  console.log(`P90 speech-end → first visible: ${summary.speechEndToFirstVisible.p90}ms`);
  console.log(`P95 speech-end → first visible: ${summary.speechEndToFirstVisible.p95}ms`);
  console.log(`Worst turns: ${summary.worstTurns.length > 0 ? summary.worstTurns.map((w) => `${w.id} (${w.reasons.join(", ")})`).join("; ") : "None"}`);
  console.log(`Most common failure category: ${summary.mostCommonFailureCategories.length > 0 ? `${summary.mostCommonFailureCategories[0].category} (${summary.mostCommonFailureCategories[0].count})` : "None"}`);
  console.log("========================================\n");
}

void runDiagnostic();
