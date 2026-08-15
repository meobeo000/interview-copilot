import type { ChangeDetail, CorrectionResult, CorrectorContext, TranscriptCorrector } from "./types";

const FALSE_POSITIVE_SAI_PATTERNS = [
  /\bnói\s+sai\b/i,
  /\blàm\s+sai\b/i,
  /\btính\s+sai\b/i,
  /\bviết\s+sai\b/i,
  /\bhiểu\s+sai\b/i,
  /\bchỉ\s+sai\b/i,
  /\bđánh\s+giá\s+sai\b/i,
  /\bxây\s+sai\b/i,
  /\bchạy\s+sai\b/i,
  /\bmở\s+sai\b/i,
  /\bchọn\s+sai\b/i,
  /\bsetup\s+sai\b/i,
  /\bcấu\s+hình\s+sai\b/i,
  /\bsai\s+chỗ\b/i,
  /\bsai\s+dữ\s+liệu\b/i,
  /\bsai\s+canonical\b/i,
  /\bsai\s+cấu\s+hình\b/i,
  /\bsai\s+thông\s+số\b/i,
  /\bsai\s+cấu\s+trúc\b/i,
  /\bsai\s+campaign\b/i,
  /\bsai\s+trang\b/i,
  /\bsai\s+domain\b/i,
  /\bsai\s+sót\b/i,
  /\bsai\s+lầm\b/i
];

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

    // 1. Ahrefs phonetics: "ai rép", "ai rep", "ai ref", "ah ref"
    currentText = currentText.replace(/\b(ai\s+rép|ai\s+rep|ai\s+ref|ah\s+ref)\b/gi, (match) => {
      changes.push({
        from: match,
        to: "Ahrefs",
        reason: "SEO domain phonetic matching for Ahrefs",
        confidence: 0.95
      });
      return "Ahrefs";
    });

    // 2. PBN phonetics: "pi bi en", "pi bi n", "p b n"
    currentText = currentText.replace(/\b(pi\s+bi\s+en|pi\s+bi\s+n|p\s+b\s+n)\b/gi, (match) => {
      changes.push({
        from: match,
        to: "PBN",
        reason: "SEO domain phonetic matching for PBN",
        confidence: 0.95
      });
      return "PBN";
    });

    // 3. GSC phonetics: "gi ét xi", "gi et xi", "g s c"
    currentText = currentText.replace(/\b(gi\s+ét\s+xi|gi\s+et\s+xi|g\s+s\s+c)\b/gi, (match) => {
      changes.push({
        from: match,
        to: "GSC",
        reason: "SEO domain phonetic matching for GSC",
        confidence: 0.95
      });
      return "GSC";
    });

    // 4. Core Update phonetics: "co update", "co up date", "core up date"
    currentText = currentText.replace(/\b(co\s+update|co\s+up\s+date|core\s+up\s+date)\b/gi, (match) => {
      changes.push({
        from: match,
        to: "Core Update",
        reason: "SEO domain phonetic matching for Core Update",
        confidence: 0.95
      });
      return "Core Update";
    });

    // 5. iGaming phonetics: "i gaming", "igaming", "in gaming"
    currentText = currentText.replace(/\b(i\s+gaming|igaming|in\s+gaming)\b/gi, (match) => {
      changes.push({
        from: match,
        to: "iGaming",
        reason: "SEO domain capitalization for iGaming",
        confidence: 0.95
      });
      return "iGaming";
    });

    // 6. Guest Post phonetics: "guestpost", "gét pót"
    currentText = currentText.replace(/\b(guestpost|gét\s+pót)\b/gi, (match) => {
      changes.push({
        from: match,
        to: "Guest Post",
        reason: "SEO domain capitalization for Guest Post",
        confidence: 0.90
      });
      return "Guest Post";
    });

    // 7. Tightened Context-Aware "sai" -> "site" with false-positive protection
    const hasForbiddenPattern = FALSE_POSITIVE_SAI_PATTERNS.some((pattern) => pattern.test(currentText));

    if (!hasForbiddenPattern) {
      // Specifically "nhận sai" -> "nhận site"
      currentText = currentText.replace(/\bnhận\s+sai\b/gi, (match) => {
        changes.push({
          from: match,
          to: "nhận site",
          reason: "SEO domain context (nhận sai -> nhận site)",
          confidence: 0.94
        });
        return "nhận site";
      });

      // Specifically "con sai này/đó/mới/đang/vệ tinh/money" -> "con site ..."
      currentText = currentText.replace(/\bcon\s+sai\s+(này|đó|mới|đang|vệ\s+tinh|money)\b/gi, (match, modifier: string) => {
        const replacement = `con site ${modifier}`;
        changes.push({
          from: match,
          to: replacement,
          reason: "SEO website noun phrase context (con sai -> con site)",
          confidence: 0.94
        });
        return replacement;
      });

      // Specifically "sai mới/vệ tinh/money" -> "site mới/..."
      currentText = currentText.replace(/\bsai\s+(mới|vệ\s+tinh|money)\b/gi, (match, modifier: string) => {
        const replacement = `site ${modifier}`;
        changes.push({
          from: match,
          to: replacement,
          reason: "SEO website modifier context (sai -> site)",
          confidence: 0.94
        });
        return replacement;
      });
    }

    const overallConfidence = changes.length > 0
      ? changes.reduce((sum, c) => sum + c.confidence, 0) / changes.length
      : 1.0;

    // Dev logging for active corrections
    if (changes.length > 0 && (context?.domain || process.env.NODE_ENV !== "production")) {
      console.log("[CORRECTION]");
      for (const ch of changes) {
        console.log(`"${ch.from}" → "${ch.to}" (confidence: ${ch.confidence})`);
      }
    }

    return {
      rawText,
      correctedText: currentText,
      changes,
      confidence: Math.round(overallConfidence * 100) / 100
    };
  }
}
