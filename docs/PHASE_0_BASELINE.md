# Phase 0: Baseline Freeze & Regression Gate Specification

> **Source of Truth**: `interview_copilot_master_roadmap.docx`  
> **Status**: ACTIVE & MANDATORY FOR ALL SUBSEQUENT PHASES  

---

## 1. Protected Engine Invariants (Non-Negotiable)

1. **Turn Immutability**: `CommittedInterviewTurn` remains immutable once `COMMIT_FINAL` is issued (`src/question-detector/questionCommitGate.ts`).
2. **Unique Turn Identity**: Every committed turn has a unique `turnId`.
3. **Response Ownership**: Every answer request and stream belongs to exactly one `turnId` and `requestId` (`src/llm/answerContract.ts`).
4. **Late Response Protection**: Late responses/tokens cannot overwrite or leak into another active turn.
5. **Manual Answer Safety**: Manual Answer (`Alt+Enter` or click) resolves the immutable committed-turn snapshot.
6. **Transcript Leakage Prevention**: Future raw transcript segments must never leak into an earlier answer request.
7. **Explicit Follow-up Inheritance**: Follow-up inheritance is strictly explicit (`src/question-detector/followUpDetector.ts`); unrelated topic switches clear scenario context.

---

## 2. Test & Diagnostics Baseline Inventory

As of Phase 0 completion, the verified baseline metrics are:

- **TypeScript Typecheck**: `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json` (0 errors)
- **ESLint**: `eslint .` (0 errors, 0 warnings)
- **Unit & Integration Tests**: 49 Vitest test files, 395 unit tests passing (0 failures)
- **Production Build**: `tsc -p tsconfig.node.json && vite build` (Clean production bundle)
- **Deterministic Diagnostics**:
  1. `src/diagnostics/turnAssemblyDiagnostic.ts` — Multi-segment speech assembly & duplicate token prevention.
  2. `src/diagnostics/answerContractDiagnostic.ts` — Structured answer contracts & contract compatibility.
  3. `src/diagnostics/pipelineCorrectnessDiagnostic.ts` — End-to-end question detection and context handoff.
  4. `src/diagnostics/followUpContextDiagnostic.ts` — Multi-turn context resolution, pronouns & topic switches.
  5. `src/diagnostics/intentRoutingDiagnostic.ts` — SEO & technical interview intent classification.
  6. `src/diagnostics/fallbackSafetyDiagnostic.ts` — Candidate fact safety, ungrounded claim prevention.
  7. `src/diagnostics/practitionerGroundingDiagnostic.ts` — Practitioner vs personal candidate claim boundary.
  8. `src/diagnostics/practitionerPlaybookDiagnostic.ts` — Playbook knowledge retrieval & chunk verification.

---

## 3. Mandatory Phase Regression Command

Before any phase (Phase 1 → Phase 7) can be declared COMPLETE or committed, the following unified command **MUST** pass with zero errors:

```bash
npm run regression:gate
```

### Individual Sub-Commands:
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run diagnostic:deterministic`

---

## 4. Protected Subsystems ("DO NOT TOUCH" Rules)

Unless a failing regression test specifically proves an invariant violation, agents working on subsequent phases must **NOT** modify:
- STT provider implementations (`src/electron/stt/*`)
- Core LLM answer prompts (`src/llm/prompts/*`)
- Knowledge retrieval scoring algorithms (`src/knowledge/*`)
- Core Turn Isolation architecture (`src/question-detector/questionCommitGate.ts`, `src/transcription/turnTranscriptAssembler.ts`)
