import type { ChangeDetail, CorrectionResult, CorrectorContext, TranscriptCorrector } from "./types";

/**
 * Safe Lexical Normalizer for SEO domain terms.
 * Contains ONLY high-confidence, unambiguous transformations (compound spacing, capitalization).
 * Vietnamese phonetic guesses and ambiguous mappings are handled by the semantic intent classifier.
 */
export class ContextAwareTranscriptCorrector implements TranscriptCorrector {
  correct(input: string, context?: CorrectorContext): CorrectionResult {
    const rawText = input;
    if (!input || !input.trim()) {
      return {
        rawText,
        correctedText: input,
        changes: [],
        confidence: 1.0
      };
    }

    let currentText = input;
    const changes: ChangeDetail[] = [];

    // 1. Compound words: "back link" -> "backlink"
    currentText = currentText.replace(/\bback\s+link\b/gi, (match) => {
      changes.push({
        from: match,
        to: "backlink",
        reason: "Safe lexical compound normalization for backlink",
        confidence: 0.98
      });
      return "backlink";
    });

    // 2. Compound words: "key word" -> "keyword"
    currentText = currentText.replace(/\bkey\s+word\b/gi, (match) => {
      changes.push({
        from: match,
        to: "keyword",
        reason: "Safe lexical compound normalization for keyword",
        confidence: 0.98
      });
      return "keyword";
    });

    // 3. Terminology plural/spacing: "internal links" -> "internal link"
    currentText = currentText.replace(/\binternal\s+links\b/gi, (match) => {
      changes.push({
        from: match,
        to: "internal link",
        reason: "Safe lexical normalization for internal link",
        confidence: 0.95
      });
      return "internal link";
    });

    // 4. Standard Capitalization: "igaming" / "i gaming" -> "iGaming"
    currentText = currentText.replace(/\b(i\s+gaming|igaming)\b/gi, (match) => {
      changes.push({
        from: match,
        to: "iGaming",
        reason: "Safe brand capitalization for iGaming",
        confidence: 0.98
      });
      return "iGaming";
    });

    // 5. Standard Capitalization: "guestpost" -> "Guest Post"
    currentText = currentText.replace(/\bguestpost\b/gi, (match) => {
      changes.push({
        from: match,
        to: "Guest Post",
        reason: "Safe brand capitalization for Guest Post",
        confidence: 0.95
      });
      return "Guest Post";
    });

    const overallConfidence = changes.length > 0
      ? changes.reduce((sum, c) => sum + c.confidence, 0) / changes.length
      : 1.0;

    if (changes.length > 0 && (context?.domain || process.env.NODE_ENV !== "production")) {
      console.log("[SAFE LEXICAL NORMALIZATION]");
      for (const ch of changes) {
        console.log(`"${ch.from}" → "${ch.to}" (confidence: ${ch.confidence})`);
      }
    }

    return {
      rawText,
      displayTranscript: currentText,
      correctedText: currentText,
      changes,
      confidence: Math.round(overallConfidence * 100) / 100
    } as CorrectionResult;
  }
}
