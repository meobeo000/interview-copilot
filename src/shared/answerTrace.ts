export interface AnswerKnowledgeTrace {
  intent?: string;
  selectedChunks?: string[];
  sourceTypes?: string[];
  topics?: string[];
  retrievalMs?: number;
  contextBuildMs?: number;
}

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
  knowledge?: AnswerKnowledgeTrace;
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
    const merged = {
      ...existing,
      ...update,
      knowledge: update.knowledge ? { ...existing.knowledge, ...update.knowledge } : existing.knowledge
    };
    this.traces.set(questionId, merged);
  }

  static completeTrace(questionId: string, update?: Partial<AnswerTraceEvent>) {
    const trace = {
      ...this.traces.get(questionId),
      ...update,
      knowledge: update?.knowledge
        ? { ...this.traces.get(questionId)?.knowledge, ...update.knowledge }
        : this.traces.get(questionId)?.knowledge
    };
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

    if (trace.knowledge) {
      lines.push(
        "[ANSWER KNOWLEDGE]",
        `questionId: ${trace.questionId || questionId}`,
        `intent: ${trace.knowledge.intent || "N/A"}`,
        `selectedChunks: ${JSON.stringify(trace.knowledge.selectedChunks || [])}`,
        `sourceTypes: ${JSON.stringify(trace.knowledge.sourceTypes || [])}`,
        `topics: ${JSON.stringify(trace.knowledge.topics || [])}`,
        `retrievalMs: ${trace.knowledge.retrievalMs !== undefined ? `${trace.knowledge.retrievalMs} ms` : "N/A"}`,
        `contextBuildMs: ${trace.knowledge.contextBuildMs !== undefined ? `${trace.knowledge.contextBuildMs} ms` : "N/A"}`
      );
    }

    if (typeof process === "undefined" || process.env?.NODE_ENV !== "production") {
      console.log(lines.join("\n"));
    }
  }
}
