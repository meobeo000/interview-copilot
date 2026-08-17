import type { KnowledgeChunk, KnowledgeStoreInterface, RetrievalQuery, RetrievalResult } from "./types";
import { getKnowledgeStore } from "./knowledgeStore";
import { getTopicsForIntent } from "./topicMapping";
import type { QuestionIntent } from "../question-detector/intentClassifier";

export interface KnowledgeRetrieverOptions {
  store?: KnowledgeStoreInterface;
  defaultMaxChunks?: number;
}

export class KnowledgeRetriever {
  private store: KnowledgeStoreInterface;
  private defaultMaxChunks: number;

  constructor(options: KnowledgeRetrieverOptions = {}) {
    this.store = options.store || getKnowledgeStore();
    this.defaultMaxChunks = options.defaultMaxChunks || 4;
  }

  /**
   * Fast, deterministic local knowledge retrieval (< 10ms).
   */
  retrieve(
    queryOrQuestion: string | RetrievalQuery,
    intent?: QuestionIntent | string,
    maxChunksOverride?: number
  ): RetrievalResult {
    const startedAt = Date.now();

    const queryObj: RetrievalQuery =
      typeof queryOrQuestion === "string"
        ? {
            question: queryOrQuestion,
            intentCategory: typeof intent === "string" ? intent : intent?.category,
            maxChunks: maxChunksOverride ?? this.defaultMaxChunks
          }
        : {
            ...queryOrQuestion,
            maxChunks: queryOrQuestion.maxChunks ?? maxChunksOverride ?? this.defaultMaxChunks
          };

    const questionText = (queryObj.question || "").toLowerCase();
    const intentCategory = queryObj.intentCategory || (typeof intent === "object" ? intent?.category : undefined);
    const maxChunks = queryObj.maxChunks || this.defaultMaxChunks;

    const { primaryTopics, secondaryTopics } = getTopicsForIntent(intentCategory);
    const candidateChunks = this.store.listChunks();

    // Extract search tokens from question (length >= 2, skipping trivial noise)
    const tokens = questionText
      .split(/[\s,./?!;:"'()]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 2 && !["là", "có", "và", "cho", "em", "anh", "gì", "thế", "nào", "được", "hay", "với", "này"].includes(t));

    const scored: Array<{ chunk: KnowledgeChunk; score: number }> = [];

    for (const chunk of candidateChunks) {
      let score = 0;

      // 1. Topic Match
      if (primaryTopics.includes(chunk.topic)) {
        score += 5;
      } else if (secondaryTopics.includes(chunk.topic)) {
        score += 3;
      }

      // 2. Tag match with question
      const chunkTags = chunk.tags.map((t) => t.toLowerCase());
      for (const tag of chunkTags) {
        if (questionText.includes(tag)) {
          score += 2;
        }
      }

      // 3. Token match in title / content
      const titleLower = (chunk.title || "").toLowerCase();
      const contentLower = chunk.content.toLowerCase();
      for (const token of tokens) {
        if (titleLower.includes(token)) {
          score += 2;
        } else if (contentLower.includes(token)) {
          score += 1;
        }
      }

      // 4. Market affinity (iGaming)
      if (chunk.market?.toLowerCase() === "igaming" && (questionText.includes("igaming") || questionText.includes("betting") || questionText.includes("casino"))) {
        score += 2;
      }

      // 5. Confidence bonuses (both candidate facts and practitioner experience are valuable)
      if (chunk.confidence === "candidate_fact") {
        score += 1;
      } else if (chunk.confidence === "practitioner_experience") {
        score += 1;
      }

      // Filter out zero-score irrelevant chunks if topic mapping is active
      if (score > 0) {
        scored.push({ chunk, score });
      }
    }

    // Deterministic sort: highest score first; if equal, candidate facts first, then stable chunk ID
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.chunk.sourceType === "candidate_profile" && b.chunk.sourceType !== "candidate_profile") {
        return -1;
      }
      if (b.chunk.sourceType === "candidate_profile" && a.chunk.sourceType !== "candidate_profile") {
        return 1;
      }
      return a.chunk.id.localeCompare(b.chunk.id);
    });

    // Pick top maxChunks (usually 3-5)
    const selectedChunks = scored.slice(0, maxChunks).map((s) => s.chunk);

    const elapsedMs = Math.max(0, Date.now() - startedAt);

    const candidateCount = selectedChunks.filter((c) => c.sourceType === "candidate_profile").length;
    const practitionerCount = selectedChunks.filter((c) => c.sourceType === "practitioner_playbook").length;
    const generalCount = selectedChunks.filter((c) => c.sourceType === "general_note").length;

    if (typeof process === "undefined" || process.env?.NODE_ENV !== "production") {
      console.log(
        `[KNOWLEDGE RETRIEVAL]\nintent: ${intentCategory || "UNKNOWN"}\ncandidateChunks: ${candidateCount}\npractitionerChunks: ${practitionerCount}\ntotalCandidates: ${candidateChunks.length}\nselected: ${selectedChunks.length}\nelapsedMs: ${elapsedMs}`
      );
    }

    return {
      chunks: selectedChunks,
      candidateChunksCount: candidateCount,
      practitionerChunksCount: practitionerCount,
      generalChunksCount: generalCount,
      totalEvaluated: candidateChunks.length,
      retrievalElapsedMs: elapsedMs
    };
  }
}

let defaultRetriever: KnowledgeRetriever | undefined;

export function getKnowledgeRetriever(): KnowledgeRetriever {
  if (!defaultRetriever) {
    defaultRetriever = new KnowledgeRetriever();
  }
  return defaultRetriever;
}
