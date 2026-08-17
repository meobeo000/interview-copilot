/**
 * TurnTranscriptAssembler
 *
 * Maintains the STT transcript state for an interviewer turn:
 * - Stable committed segments (finalized STT chunks, deduplicated across boundaries)
 * - Single current unfinalized partial hypothesis (replaces prior hypothesis, never appends)
 * - Unified display and semantic transcripts
 */

export interface TurnTranscriptState {
  turnId: string;
  committedSegments: string[];
  currentPartial: string;
  displayTranscript: string;
  updatedAt: number;
}

/**
 * Finds the maximum word-overlap suffix of `target` that matches the prefix of `incoming`.
 * Returns the index in incoming words where new content begins.
 */
export function findWordOverlapOffset(existingText: string, incomingText: string, maxOverlapWords = 8): number {
  const tWords = existingText.trim().split(/\s+/).filter(Boolean);
  const iWords = incomingText.trim().split(/\s+/).filter(Boolean);

  if (tWords.length === 0 || iWords.length === 0) {
    return 0;
  }

  const clean = (w: string) => w.toLowerCase().replace(/^[.,?!:;]+|[.,?!:;]+$/g, "");

  const maxCheck = Math.min(tWords.length, iWords.length, maxOverlapWords);

  // Check from longest possible overlap down to 1 word
  for (let len = maxCheck; len >= 1; len--) {
    const tSuffix = tWords.slice(tWords.length - len).map(clean);
    const iPrefix = iWords.slice(0, len).map(clean);

    let match = true;
    for (let k = 0; k < len; k++) {
      if (tSuffix[k] !== iPrefix[k]) {
        match = false;
        break;
      }
    }

    if (match) {
      return len;
    }
  }

  return 0;
}

export function mergeSegmentWithOverlap(existingSegments: string[], incomingText: string): string[] {
  const trimmed = incomingText.trim();
  if (!trimmed) {
    return existingSegments;
  }

  if (existingSegments.length === 0) {
    return [trimmed];
  }

  const fullCommitted = existingSegments.join(" ");

  // 1. Exact duplicate or subset check
  if (fullCommitted.toLowerCase().endsWith(trimmed.toLowerCase())) {
    return existingSegments;
  }

  // 2. If incoming starts with entire existing committed text, replace with incoming
  if (trimmed.toLowerCase().startsWith(fullCommitted.toLowerCase())) {
    return [trimmed];
  }

  // 3. Overlap deduplication against the last committed segment (or combined tail)
  const tailText = existingSegments.slice(-2).join(" ");
  const overlapOffset = findWordOverlapOffset(tailText, trimmed);

  if (overlapOffset > 0) {
    const incomingWords = trimmed.split(/\s+/).filter(Boolean);
    const remainderWords = incomingWords.slice(overlapOffset);
    if (remainderWords.length > 0) {
      return [...existingSegments, remainderWords.join(" ")];
    }
    return existingSegments;
  }

  return [...existingSegments, trimmed];
}

export class TurnTranscriptAssembler {
  private turnId: string;
  private committedSegments: string[] = [];
  private currentPartial = "";
  private updatedAt = Date.now();

  constructor(turnId?: string) {
    this.turnId = turnId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `turn-${Date.now()}`);
  }

  /**
   * Starts a clean new interviewer turn.
   */
  startTurn(turnId?: string): void {
    this.turnId = turnId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `turn-${Date.now()}`);
    this.committedSegments = [];
    this.currentPartial = "";
    this.updatedAt = Date.now();
  }

  /**
   * Clears all turn state.
   */
  reset(): void {
    this.startTurn();
  }

  /**
   * Applies an interim/partial hypothesis.
   * REPLACES the current unfinalized partial (never appends to it).
   */
  applyPartial(text: string): string {
    const trimmed = text.trim();
    this.currentPartial = trimmed;
    this.updatedAt = Date.now();
    this.logDebug("partial");
    return this.getDisplayTranscript();
  }

  /**
   * Commits a finalized STT segment.
   * Merges with existing committed segments using overlap deduplication and clears current partial.
   */
  applyFinal(text: string): string {
    const trimmed = text.trim();
    if (trimmed) {
      this.committedSegments = mergeSegmentWithOverlap(this.committedSegments, trimmed);
    }
    this.currentPartial = "";
    this.updatedAt = Date.now();
    this.logDebug("final");
    return this.getDisplayTranscript();
  }

  /**
   * Signals a provider speech_final / endpoint event.
   * If an unfinalized partial exists, commits it once.
   */
  applySpeechFinal(): string {
    if (this.currentPartial.trim()) {
      this.applyFinal(this.currentPartial);
    }
    this.logDebug("speech_final");
    return this.getDisplayTranscript();
  }

  /**
   * Returns the clean assembled display transcript:
   * stable committed segments + current partial.
   */
  getDisplayTranscript(): string {
    const committed = this.committedSegments.join(" ").trim();
    const partial = this.currentPartial.trim();

    if (committed && partial) {
      // Check if partial overlaps with end of committed text
      const overlapOffset = findWordOverlapOffset(committed, partial);
      if (overlapOffset > 0) {
        const partialWords = partial.split(/\s+/).filter(Boolean);
        const remainder = partialWords.slice(overlapOffset).join(" ");
        return remainder ? `${committed} ${remainder}` : committed;
      }
      return `${committed} ${partial}`;
    }

    return committed || partial || "";
  }

  /**
   * Semantic transcript for intent scoring and knowledge retrieval.
   */
  getSemanticTranscript(): string {
    return this.getDisplayTranscript();
  }

  /**
   * Returns current committed segments text only.
   */
  getCommittedTranscript(): string {
    return this.committedSegments.join(" ").trim();
  }

  /**
   * Returns unfinalized partial hypothesis text.
   */
  getCurrentPartial(): string {
    return this.currentPartial.trim();
  }

  getState(): TurnTranscriptState {
    return {
      turnId: this.turnId,
      committedSegments: [...this.committedSegments],
      currentPartial: this.currentPartial,
      displayTranscript: this.getDisplayTranscript(),
      updatedAt: this.updatedAt
    };
  }

  private logDebug(event: "partial" | "final" | "speech_final"): void {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
      return;
    }
    // Only log if verbose STT logging enabled or in dev mode
    if (typeof process !== "undefined" && process.env?.DEBUG_STT_ASSEMBLY === "true") {
      console.log(`[TURN ASSEMBLY] event: ${event} | committed: "${this.getCommittedTranscript()}" | partial: "${this.currentPartial}" | display: "${this.getDisplayTranscript()}"`);
    }
  }
}
