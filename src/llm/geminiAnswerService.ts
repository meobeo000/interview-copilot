import type { AnswerDelta, AnswerRequest, AnswerService } from "./types";
import type { SuggestedAnswer } from "../shared/types";
import { calculatePipelineMetrics, extractFirstUsefulAnswer, formatPipelineMetricsLog } from "../shared/telemetry";
import { buildFastSeoInterviewPrompt } from "./prompts/fastSeoInterviewPrompt";
import { parseStreamingAnswer } from "./parseAnswerJson";
import { AnswerTraceLogger } from "../shared/answerTrace";
import { getKnowledgeRetriever } from "../knowledge/knowledgeRetriever";
import { buildAnswerKnowledgeContext } from "../knowledge/answerKnowledgeContextBuilder";
import { buildAnswerContract } from "./answerContract";

export interface GeminiAnswerConfig {
  apiKey: string;
  model: string;
}

export function readGeminiAnswerConfig(env: Record<string, string | undefined> = process.env): GeminiAnswerConfig {
  const apiKey = (env.GEMINI_API_KEY || process.env.GEMINI_API_KEY)?.trim() ?? "";
  const model = (env.GEMINI_ANSWER_MODEL || process.env.GEMINI_ANSWER_MODEL)?.trim() || "gemini-3.1-flash-lite";

  return { apiKey, model };
}

export class GeminiAnswerService implements AnswerService {
  readonly providerName = "gemini";
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(
    config: GeminiAnswerConfig = readGeminiAnswerConfig(),
    fetchFn: typeof fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : fetch
  ) {
    this.apiKey = config.apiKey;
    this.modelName = config.model;
    this.fetchFn = fetchFn;
  }

  async *streamAnswer(request: AnswerRequest): AsyncGenerator<AnswerDelta, SuggestedAnswer, void> {
    if (!this.apiKey) {
      throw new Error("Gemini Answer configuration error: GEMINI_API_KEY is missing. Check .env file.");
    }

    const geminiRequestStartedAt = Date.now();
    const questionCommittedAt = request.questionCommittedAt ?? geminiRequestStartedAt;
    const speechLastActivityAt = request.speechLastActivityAt ?? questionCommittedAt;
    const speechEndedAt = request.speechEndedAt ?? speechLastActivityAt;
    const questionIntentReadyAt = request.questionIntentReadyAt ?? questionCommittedAt;

    let firstAnswerTokenAt: number | undefined;
    let firstUsefulAnswerAt: number | undefined;
    let answerCompletedAt: number | undefined;

    // Grounded Knowledge Retrieval (< 5ms local in-memory operation)
    const retrievalStart = Date.now();
    const retrieved = request.retrievedChunks
      ? { chunks: request.retrievedChunks, retrievalElapsedMs: 0 }
      : getKnowledgeRetriever().retrieve(request.question, request.intent);
    const retrievalElapsedMs = Math.max(0, Date.now() - retrievalStart);

    // 1. Build AnswerContract describing WHAT Gemini must answer (< 5ms)
    const contract =
      request.contract ||
      buildAnswerContract({
        question: request.question,
        intent: request.intent,
        semanticEvidence: request.semanticEvidence,
        retrievedChunks: retrieved.chunks,
        candidateProfile: request.profile,
        followUpContext: request.followUpContext
      });

    const contextBuildStart = Date.now();
    const knowledgeContext =
      request.knowledgeContext ||
      buildAnswerKnowledgeContext({
        question: request.question,
        intent: request.intent || contract.intent,
        entities: contract.requiredEntities,
        numericFacts: contract.requiredFacts,
        followUpContext: contract.followUpContext || request.followUpContext,
        scenarioConstraints: contract.scenarioConstraints || request.semanticEvidence?.scenarioConstraints,
        candidateProfile: request.profile,
        retrievedChunks: retrieved.chunks
      });
    const contextBuildElapsedMs = Math.max(0, Date.now() - contextBuildStart);

    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "test") {
      console.log(
        `[ANSWER CONTRACT]\nquestionId: ${request.questionId}\nintent: ${contract.intent}\nanswerType: ${contract.answerType}\ncandidateExperienceAllowed: ${contract.candidateExperienceAllowed}\ncandidateExperienceTopics: ${JSON.stringify(contract.candidateExperience.supportedTopics)}\nallocationGrounding: ${contract.allocationGrounding ?? "N/A"}\ngroundedFactCount: ${contract.groundedFacts.length}\ngroundedSourceTypes: ${JSON.stringify(Array.from(new Set(contract.groundedFacts.map((f) => f.sourceType))))}\nrequiredEntities: ${JSON.stringify(contract.requiredEntities)}\ncontractBuildMs: ${contract.contractBuildMs} ms`
      );
    }

    // Fast streaming prompt removes JSON syntax overhead so token 1 is readable Vietnamese text
    const promptText = buildFastSeoInterviewPrompt(request.profile, knowledgeContext, contract);
    const userContentText =
      contract.followUpContext && contract.followUpContext.contextResolved
        ? `[INTERVIEW FOLLOW-UP CONTEXT]:\nFollow-up Type: ${contract.followUpContext.followUpType}\nCurrent Spoken Question: "${request.question}"\nPrevious Question: "${contract.followUpContext.previousQuestion || "N/A"}"\nInherited Intent: ${contract.intent}\nResolved Directive: ${contract.followUpContext.resolvedMeaning || "Answer in context."}`
        : contract.requiredFacts.length > 0 || contract.requiredEntities.length > 0
        ? `[INTERVIEW QUESTION & STRUCTURED FACTS]:\nIntent: ${contract.intent}\nFacts: ${contract.requiredFacts.join("; ") || "Standard"}\nEntities: ${contract.requiredEntities.join(", ") || "Standard"}\nSpoken Transcript: "${request.question}"`
        : `Interviewer Question:\n"${request.question}"`;

    const payload = {
      system_instruction: {
        parts: [{ text: promptText }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userContentText }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 250
      }
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.modelName)}:streamGenerateContent?alt=sse`;

    AnswerTraceLogger.record(request.questionId, {
      requestSent: Date.now(),
      provider: "gemini",
      model: this.modelName,
      knowledge: {
        intent: typeof request.intent === "string" ? request.intent : request.intent?.category,
        selectedChunks: retrieved.chunks.map((c) => c.id),
        sourceTypes: Array.from(new Set(retrieved.chunks.map((c) => c.sourceType))),
        topics: Array.from(new Set(retrieved.chunks.map((c) => c.topic))),
        retrievalMs: retrievalElapsedMs,
        contextBuildMs: contextBuildElapsedMs
      }
    });

    let response: Response;
    try {
      response = await this.fetchFn(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify(payload),
        signal: request.signal
      });
    } catch (err) {
      if (request.signal?.aborted) {
        throw new Error("Gemini request cancelled");
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Gemini Network error: ${msg.replace(this.apiKey, "[REDACTED]")}`);
    }

    AnswerTraceLogger.record(request.questionId, {
      httpResponse: { status: response.status, time: Date.now() }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let detail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const parsed = JSON.parse(errorText) as { error?: { message?: string } };
        if (parsed.error?.message) {
          detail = parsed.error.message;
        }
      } catch {
        if (errorText) {
          detail = errorText.slice(0, 150);
        }
      }

      const cleanDetail = detail.replace(this.apiKey, "[REDACTED]");

      if (response.status === 401 || response.status === 403) {
        throw new Error(`Gemini Authentication error (HTTP ${response.status}): ${cleanDetail}`);
      }
      if (response.status === 429) {
        throw new Error(`Gemini Quota error (HTTP 429): ${cleanDetail}`);
      }
      if (response.status === 404) {
        throw new Error(`Gemini Model error (HTTP 404): Model '${this.modelName}' is unavailable or not found.`);
      }
      if (response.status >= 500) {
        throw new Error(`Gemini Server error (HTTP ${response.status}): ${cleanDetail}`);
      }
      throw new Error(`Gemini API error (${response.status}): ${cleanDetail}`);
    }

    if (!response.body) {
      throw new Error("Gemini API error: response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulatedText = "";
    let buffer = "";

    while (true) {
      if (request.signal?.aborted) {
        await reader.cancel().catch(() => {});
        throw new Error("Gemini request cancelled");
      }

      const { done, value } = await reader.read();
      if (done) {
        answerCompletedAt = Date.now();
        break;
      }

      if (firstAnswerTokenAt === undefined) {
        firstAnswerTokenAt = Date.now();
        AnswerTraceLogger.record(request.questionId, {
          firstNetworkChunk: firstAnswerTokenAt
        });
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) {
          continue;
        }

        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr) as {
              candidates?: Array<{
                content?: {
                  parts?: Array<{ text?: string }>;
                };
              }>;
            };
            const parts = parsed.candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (part.text) {
                  accumulatedText += part.text;

                  // Audit first useful answer: must not be raw JSON syntax/keys/whitespace
                  if (firstUsefulAnswerAt === undefined) {
                    const parsedPartial = parseStreamingAnswer(accumulatedText);
                    const useful = extractFirstUsefulAnswer(parsedPartial) || extractFirstUsefulAnswer(accumulatedText);
                    if (useful) {
                      firstUsefulAnswerAt = Date.now();
                      AnswerTraceLogger.record(request.questionId, {
                        firstParsedText: { text: useful, time: firstUsefulAnswerAt }
                      });
                    }
                  }

                  // Yield progressive accumulatedText chunk
                  yield { type: "chunk", accumulatedText };
                }
              }
            }
          } catch {
            // Ignore partial SSE json parsing
          }
        }
      }
    }

    answerCompletedAt = answerCompletedAt ?? Date.now();
    firstAnswerTokenAt = firstAnswerTokenAt ?? answerCompletedAt;
    firstUsefulAnswerAt = firstUsefulAnswerAt ?? answerCompletedAt;

    const metrics = calculatePipelineMetrics({
      speechLastActivityAt,
      speechEndedAt,
      questionIntentReadyAt,
      questionCommittedAt,
      answerRequestStartedAt: geminiRequestStartedAt,
      firstAnswerTokenAt,
      firstUsefulAnswerAt,
      answerCompletedAt
    });

    console.log(formatPipelineMetricsLog(metrics));

    const finalAnswer = parseStreamingAnswer(accumulatedText);

    // Yield final structured answer payload
    yield { type: "finalAnswer", answer: finalAnswer };

    return finalAnswer;
  }
}
