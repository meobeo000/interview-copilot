export interface AnswerTraceEvent {
  questionId: string;
  mode?: "speculative" | "committed" | "manual";
  provider: string;
  model: string;
  requestCreated?: number;
  requestSent?: number;
  httpResponse?: { status: number; time: number };
  firstNetworkChunk?: number;
  firstParsedText?: { text: string; time: number };
  ipcChunkSent?: number;
  rendererChunkReceived?: number;
  answerComplete?: { wordCount: number; time: number };
}

export class AnswerTraceLogger {
  private static traces = new Map<string, Partial<AnswerTraceEvent>>();

  static startTrace(questionId: string, initial: Partial<AnswerTraceEvent>) {
    this.traces.set(questionId, {
      ...initial,
      questionId,
      requestCreated: initial.requestCreated ?? Date.now()
    });
  }

  static record(questionId: string, update: Partial<AnswerTraceEvent>) {
    const existing = this.traces.get(questionId) || { questionId, requestCreated: Date.now() };
    const merged = { ...existing, ...update };
    this.traces.set(questionId, merged);
  }

  static completeTrace(questionId: string, update?: Partial<AnswerTraceEvent>) {
    const trace = { ...this.traces.get(questionId), ...update };
    this.traces.delete(questionId);

    const baseTime = trace.requestCreated ?? Date.now();
    const fmtRel = (t?: number) => (t !== undefined ? `+${Math.max(0, t - baseTime)} ms` : "N/A");

    const lines = [
      "[ANSWER TRACE]",
      `questionId: ${trace.questionId || questionId}`,
      `mode: ${trace.mode || "committed"}`,
      `provider: ${trace.provider || "gemini"}`,
      `model: ${trace.model || "gemini-3.1-flash-lite"}`,
      `requestCreated: +0 ms`,
      `requestSent: ${fmtRel(trace.requestSent)}`,
      `httpResponse: ${trace.httpResponse ? `${fmtRel(trace.httpResponse.time)} (HTTP ${trace.httpResponse.status})` : "N/A"}`,
      `firstNetworkChunk: ${fmtRel(trace.firstNetworkChunk)}`,
      `firstParsedText: ${trace.firstParsedText ? `${fmtRel(trace.firstParsedText.time)} ("${trace.firstParsedText.text.slice(0, 40)}...")` : "N/A"}`,
      `ipcChunkSent: ${fmtRel(trace.ipcChunkSent)}`,
      `rendererChunkReceived: ${fmtRel(trace.rendererChunkReceived)}`,
      `answerComplete: ${trace.answerComplete ? `${fmtRel(trace.answerComplete.time)} (${trace.answerComplete.wordCount} words)` : fmtRel(Date.now())}`
    ];

    if (typeof process === "undefined" || process.env?.NODE_ENV !== "production") {
      console.log(lines.join("\n"));
    }
  }
}
