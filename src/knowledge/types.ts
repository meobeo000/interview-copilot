export type KnowledgeSourceType =
  | "candidate_profile"
  | "practitioner_playbook"
  | "general_note";

export type KnowledgeConfidence =
  | "candidate_fact"
  | "practitioner_experience"
  | "general_note";

export type KnowledgeTopic =
  | "PROJECT_EXPERIENCE"
  | "BUDGET"
  | "CONTENT"
  | "ENTITY"
  | "BACKLINK_FOUNDATION"
  | "GUEST_POST"
  | "PBN"
  | "PBN_TIMING"
  | "DOMAIN_SELECTION"
  | "EXPIRED_DOMAIN"
  | "TLD_TESTING"
  | "INDEXING"
  | "NO_KEYWORD_SIGNAL"
  | "ONPAGE"
  | "INTERNAL_LINK"
  | "TECHNICAL_SEO"
  | "GSC"
  | "CORE_UPDATE"
  | "NEGATIVE_SEO"
  | "REDIRECT_301"
  | "RANKING_MAINTENANCE"
  | "ANCHOR_TEXT"
  | "REFERRING_DOMAIN"
  | "GENERAL";

export interface KnowledgeChunk {
  id: string;
  sourceType: KnowledgeSourceType;
  topic: KnowledgeTopic;
  title?: string;
  content: string;
  tags: string[];

  sourceName?: string;
  sourceFile?: string;

  market?: string;
  geo?: string;

  confidence: KnowledgeConfidence;
  canClaimAsPersonalExperience: boolean;

  createdAt?: string;
}

export interface IngestionInput {
  sourceType: KnowledgeSourceType;
  sourceName?: string;
  sourceFile?: string;
  text: string;
  defaultTopic?: KnowledgeTopic;
  tags?: string[];
  market?: string;
  geo?: string;
}

export interface RetrievalQuery {
  question: string;
  intentCategory?: string;
  topics?: KnowledgeTopic[];
  tags?: string[];
  market?: string;
  maxChunks?: number;
}

export interface RetrievalResult {
  chunks: KnowledgeChunk[];
  candidateChunksCount: number;
  practitionerChunksCount: number;
  generalChunksCount: number;
  totalEvaluated: number;
  retrievalElapsedMs: number;
}

export interface KnowledgeStoreInterface {
  addChunk(chunk: KnowledgeChunk): KnowledgeChunk;
  addChunks(chunks: KnowledgeChunk[]): KnowledgeChunk[];
  getChunk(id: string): KnowledgeChunk | undefined;
  listChunks(filter?: { sourceType?: KnowledgeSourceType; topic?: KnowledgeTopic }): KnowledgeChunk[];
  deleteChunk(id: string): boolean;
  deleteChunksBySource(sourceName: string): number;
  searchByTopic(topic: KnowledgeTopic): KnowledgeChunk[];
  searchByTags(tags: string[]): KnowledgeChunk[];
  search(query: string, options?: { maxResults?: number; sourceType?: KnowledgeSourceType }): KnowledgeChunk[];
  clear(): void;
  resetToDefault(): void;
}

/**
 * HARD SAFETY BOUNDARY VALIDATOR:
 * Guarantees that practitioner or general knowledge can NEVER be flagged as personal experience.
 * candidate_profile -> canClaimAsPersonalExperience = true (or false if specified)
 * practitioner_playbook -> canClaimAsPersonalExperience MUST be false
 * general_note -> canClaimAsPersonalExperience MUST be false
 */
export function validateAndEnforceSafety(chunk: Partial<KnowledgeChunk>): KnowledgeChunk {
  if (!chunk.id || !chunk.content || !chunk.sourceType || !chunk.topic) {
    throw new Error(`Invalid KnowledgeChunk: id, content, sourceType, and topic are required. Received: ${JSON.stringify(chunk)}`);
  }

  let canClaimAsPersonalExperience = false;
  let confidence: KnowledgeConfidence = "general_note";

  if (chunk.sourceType === "candidate_profile") {
    canClaimAsPersonalExperience = chunk.canClaimAsPersonalExperience !== false;
    confidence = chunk.confidence === "candidate_fact" ? "candidate_fact" : "candidate_fact";
  } else if (chunk.sourceType === "practitioner_playbook") {
    // STRICT SAFETY RULE: practitioner playbook MUST NEVER be claimed as candidate experience
    canClaimAsPersonalExperience = false;
    confidence = "practitioner_experience";
  } else {
    canClaimAsPersonalExperience = false;
    confidence = "general_note";
  }

  return {
    id: chunk.id,
    sourceType: chunk.sourceType,
    topic: chunk.topic,
    title: chunk.title?.trim() || undefined,
    content: chunk.content.trim(),
    tags: Array.isArray(chunk.tags) ? Array.from(new Set(chunk.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))) : [],
    sourceName: chunk.sourceName?.trim() || undefined,
    sourceFile: chunk.sourceFile?.trim() || undefined,
    market: chunk.market?.trim() || "iGaming",
    geo: chunk.geo?.trim() || "VN",
    confidence,
    canClaimAsPersonalExperience,
    createdAt: chunk.createdAt || new Date().toISOString()
  };
}
