import type {
  KnowledgeChunk,
  KnowledgeSourceType,
  KnowledgeStoreInterface,
  KnowledgeTopic
} from "./types";
import { validateAndEnforceSafety } from "./types";
import { DEFAULT_PRACTITIONER_PLAYBOOK_CHUNKS } from "./seedPlaybook";
import { candidateProfileToChunks, loadCandidateProfile } from "../shared/candidateProfile";

const STORE_STORAGE_KEY = "interview-copilot.knowledge-store.v1";

export class LocalKnowledgeStore implements KnowledgeStoreInterface {
  private chunks: Map<string, KnowledgeChunk> = new Map();
  private isLoadedFromStorage = false;

  constructor(autoLoad = true) {
    if (autoLoad) {
      this.init();
    }
  }

  private init(): void {
    if (this.isLoadedFromStorage) return;

    const loadedFromPersist = this.loadFromStorage();
    if (!loadedFromPersist || this.chunks.size === 0) {
      this.resetToDefault();
    }
    this.isLoadedFromStorage = true;
  }

  public resetToDefault(): void {
    this.chunks.clear();

    // 1. Seed practitioner playbook chunks (marked strictly canClaimAsPersonalExperience = false)
    for (const chunk of DEFAULT_PRACTITIONER_PLAYBOOK_CHUNKS) {
      this.chunks.set(chunk.id, chunk);
    }

    // 2. Add candidate profile facts
    try {
      const candidateChunks = candidateProfileToChunks(loadCandidateProfile());
      for (const chunk of candidateChunks) {
        this.chunks.set(chunk.id, chunk);
      }
    } catch {
      // ignore
    }

    this.saveToStorage();
  }

  public addChunk(chunk: KnowledgeChunk): KnowledgeChunk {
    const validated = validateAndEnforceSafety(chunk);
    this.chunks.set(validated.id, validated);
    this.saveToStorage();
    return validated;
  }

  public addChunks(chunks: KnowledgeChunk[]): KnowledgeChunk[] {
    const validatedList: KnowledgeChunk[] = [];
    for (const chunk of chunks) {
      const validated = validateAndEnforceSafety(chunk);
      this.chunks.set(validated.id, validated);
      validatedList.push(validated);
    }
    this.saveToStorage();
    return validatedList;
  }

  public getChunk(id: string): KnowledgeChunk | undefined {
    return this.chunks.get(id);
  }

  public listChunks(filter?: { sourceType?: KnowledgeSourceType; topic?: KnowledgeTopic }): KnowledgeChunk[] {
    let result = Array.from(this.chunks.values());
    if (filter?.sourceType) {
      result = result.filter((c) => c.sourceType === filter.sourceType);
    }
    if (filter?.topic) {
      result = result.filter((c) => c.topic === filter.topic);
    }
    return result;
  }

  public deleteChunk(id: string): boolean {
    const existed = this.chunks.delete(id);
    if (existed) {
      this.saveToStorage();
    }
    return existed;
  }

  public deleteChunksBySource(sourceName: string): number {
    let deletedCount = 0;
    const target = sourceName.trim().toLowerCase();
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.sourceName?.toLowerCase() === target) {
        this.chunks.delete(id);
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      this.saveToStorage();
    }
    return deletedCount;
  }

  public searchByTopic(topic: KnowledgeTopic): KnowledgeChunk[] {
    return Array.from(this.chunks.values()).filter((c) => c.topic === topic);
  }

  public searchByTags(tags: string[]): KnowledgeChunk[] {
    const normalized = tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (normalized.length === 0) return [];

    return Array.from(this.chunks.values()).filter((chunk) => {
      const chunkTags = chunk.tags.map((t) => t.toLowerCase());
      return normalized.some((reqTag) => chunkTags.includes(reqTag));
    });
  }

  public search(
    query: string,
    options?: { maxResults?: number; sourceType?: KnowledgeSourceType }
  ): KnowledgeChunk[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return this.listChunks(options ? { sourceType: options.sourceType } : undefined).slice(0, options?.maxResults ?? 20);
    }

    const tokens = q.split(/\s+/).filter(Boolean);
    const results: Array<{ chunk: KnowledgeChunk; score: number }> = [];

    for (const chunk of this.chunks.values()) {
      if (options?.sourceType && chunk.sourceType !== options.sourceType) {
        continue;
      }

      let score = 0;
      const titleLower = (chunk.title || "").toLowerCase();
      const contentLower = chunk.content.toLowerCase();
      const tagsLower = chunk.tags.map((t) => t.toLowerCase()).join(" ");

      if (titleLower.includes(q)) score += 10;
      if (contentLower.includes(q)) score += 5;

      for (const token of tokens) {
        if (titleLower.includes(token)) score += 3;
        if (tagsLower.includes(token)) score += 2;
        if (contentLower.includes(token)) score += 1;
      }

      if (score > 0) {
        results.push({ chunk, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const max = options?.maxResults ?? 20;
    return results.slice(0, max).map((r) => r.chunk);
  }

  public clear(): void {
    this.chunks.clear();
    this.saveToStorage();
  }

  public exportJson(): string {
    return JSON.stringify(Array.from(this.chunks.values()), null, 2);
  }

  public importJson(jsonStr: string): number {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        throw new Error("Import JSON must be an array of KnowledgeChunk objects");
      }
      const validatedList = parsed.map((item) => validateAndEnforceSafety(item));
      for (const chunk of validatedList) {
        this.chunks.set(chunk.id, chunk);
      }
      this.saveToStorage();
      return validatedList.length;
    } catch (err) {
      throw new Error(`Failed to import JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof globalThis !== "undefined" && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
        const payload = JSON.stringify(Array.from(this.chunks.values()));
        (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(STORE_STORAGE_KEY, payload);
      }
    } catch {
      // Storage unavailable or quota exceeded
    }
  }

  private loadFromStorage(): boolean {
    try {
      if (typeof globalThis !== "undefined" && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
        const raw = (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(STORE_STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const item of parsed) {
            try {
              const validated = validateAndEnforceSafety(item);
              this.chunks.set(validated.id, validated);
            } catch {
              // skip invalid saved chunk
            }
          }
          return this.chunks.size > 0;
        }
      }
    } catch {
      return false;
    }
    return false;
  }
}

let defaultStoreInstance: LocalKnowledgeStore | undefined;

export function getKnowledgeStore(): LocalKnowledgeStore {
  if (!defaultStoreInstance) {
    defaultStoreInstance = new LocalKnowledgeStore();
  }
  return defaultStoreInstance;
}
