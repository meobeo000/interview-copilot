/**
 * Spoken Answer Style Policy & Professional Terminology Utilities
 * Phase 6.6 — Interview Copilot
 */

export interface AcronymDefinition {
  acronym: string;
  fullName: string;
  expandedFirstMention: string;
  category: "TOOL" | "METRIC" | "TACTIC" | "INFRASTRUCTURE";
}

export const ACRONYM_DEFINITIONS: Record<string, AcronymDefinition> = {
  GSC: {
    acronym: "GSC",
    fullName: "Google Search Console",
    expandedFirstMention: "Google Search Console (GSC)",
    category: "TOOL"
  },
  CTR: {
    acronym: "CTR",
    fullName: "Click Through Rate",
    expandedFirstMention: "Click Through Rate (CTR)",
    category: "METRIC"
  },
  DR: {
    acronym: "DR",
    fullName: "Domain Rating",
    expandedFirstMention: "Domain Rating (DR)",
    category: "METRIC"
  },
  RD: {
    acronym: "RD",
    fullName: "Referring Domain",
    expandedFirstMention: "Referring Domain (RD)",
    category: "METRIC"
  },
  PBN: {
    acronym: "PBN",
    fullName: "Private Blog Network",
    expandedFirstMention: "Private Blog Network (PBN)",
    category: "TACTIC"
  },
  GP: {
    acronym: "GP",
    fullName: "Guest Post",
    expandedFirstMention: "Guest Post (GP)",
    category: "TACTIC"
  },
  TLD: {
    acronym: "TLD",
    fullName: "Top-Level Domain",
    expandedFirstMention: "Top-Level Domain (TLD)",
    category: "INFRASTRUCTURE"
  },
  GA4: {
    acronym: "GA4",
    fullName: "Google Analytics 4",
    expandedFirstMention: "Google Analytics 4 (GA4)",
    category: "TOOL"
  }
};

/**
 * Non-expandable brands and tools (must remain as-is, never artificially expanded).
 */
export const NON_EXPANDABLE_BRANDS = [
  "Ahrefs",
  "Semrush",
  "Screaming Frog",
  "WordPress",
  "Cloudflare",
  "Wayback Machine"
];

/**
 * Undesirable colloquial slang shorthand patterns to flag in formal interview style.
 */
export const INFORMAL_SLANG_PATTERNS = [
  { pattern: /\bsoi\s+RD\b/i, suggested: "phân tích Referring Domains trên Ahrefs" },
  { pattern: /\bbơm\s+PBN\b/i, suggested: "triển khai link Private Blog Network (PBN)" },
  { pattern: /\bđập\s+site\b/i, suggested: "tái cấu trúc lại website" },
  { pattern: /\bbắn\s+link\s+ồ\s+ạt\b/i, suggested: "tăng link đột ngột" }
];

export interface SpokenStyleValidationResult {
  valid: boolean;
  violations: string[];
  expandedAcronyms: string[];
  unexpandedFirstMentions: string[];
}

/**
 * Lightweight validator for generated answers.
 * Checks for acronym first-mention expansion and flags informal slang.
 */
export function validateSpokenAnswerStyle(text: string): SpokenStyleValidationResult {
  const violations: string[] = [];
  const expandedAcronyms: string[] = [];
  const unexpandedFirstMentions: string[] = [];

  if (!text || text.trim().length === 0) {
    return { valid: true, violations: [], expandedAcronyms: [], unexpandedFirstMentions: [] };
  }

  for (const [key, def] of Object.entries(ACRONYM_DEFINITIONS)) {
    const acronymRegex = new RegExp(`(?<![\\p{L}\\p{N}])${def.acronym}(?![\\p{L}\\p{N}])`, "gui");
    const fullExpandedRegex = new RegExp(
      def.expandedFirstMention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gui"
    );

    const hasAcronym = acronymRegex.test(text);
    const hasExpanded = fullExpandedRegex.test(text);

    if (hasExpanded) {
      expandedAcronyms.push(key);
    } else if (hasAcronym && !hasExpanded) {
      // Mentioned acronym standalone without first-mention expansion
      // (Unless full name was used without abbreviation)
      const fullNameRegex = new RegExp(def.fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gui");
      if (!fullNameRegex.test(text)) {
        unexpandedFirstMentions.push(key);
        violations.push(`Acronym ${def.acronym} was used without first-mention expansion (${def.expandedFirstMention}).`);
      }
    }
  }

  // Check informal slang
  for (const slang of INFORMAL_SLANG_PATTERNS) {
    if (slang.pattern.test(text)) {
      violations.push(`Informal shorthand detected: '${slang.pattern.source}'. Recommended: '${slang.suggested}'.`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    expandedAcronyms,
    unexpandedFirstMentions
  };
}

/**
 * Formats acronym guidance directives for prompt injection.
 */
export function formatSpokenStyleDirectives(): string {
  return `
PROFESSIONAL SPOKEN STYLE & ACRONYM EXPANSION RULES:
1. Primary language: Vietnamese with natural SEO English terminology (e.g. "Google Search Console", "indexing", "impression", "keyword", "referring domains", "backlink profile", "search intent").
2. ACRONYM FIRST-MENTION RULE:
   - On the FIRST mention in each answer, expand important acronyms:
     * GSC -> "Google Search Console (GSC)"
     * CTR -> "Click Through Rate (CTR)"
     * DR  -> "Domain Rating (DR)"
     * RD  -> "Referring Domain (RD)"
     * PBN -> "Private Blog Network (PBN)"
     * GP  -> "Guest Post (GP)"
     * TLD -> "Top-Level Domain (TLD)"
     * GA4 -> "Google Analytics 4 (GA4)"
   - After the first expansion in the SAME answer, use the short acronym normally (do NOT re-expand).
   - Brands like "Ahrefs", "WordPress", "Cloudflare" are NEVER expanded.
3. SPOKEN NATURALNESS (15–30 SECONDS):
   - Sentence 1: Direct decision / answer.
   - Sentence 2: Specific check or action using professional terms.
   - Sentence 3: Decision signal or technical reasoning.
   - Sentence 4 (optional): Contingency or risk.
   - Use varied conversational transitions ("Với case này...", "Em sẽ ưu tiên...", "Điểm em nhìn trước là...", "Nếu dữ liệu cho thấy...", "Chỉ khi...").
   - AVOID excessive bulleted listing ("Đầu tiên... thứ hai... thứ ba...").
`.trim();
}
