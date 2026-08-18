/**
 * Unicode-Safe Semantic Text & Token Matcher
 *
 * Prevents regex word-boundary collisions on Vietnamese text with diacritics.
 * Standard ASCII `\b` fails in JavaScript because characters like 'ắ', 'ầ', 'ệ'
 * are treated as non-word characters, causing "site b" to match inside "site bắt đầu".
 */

/**
 * Normalizes text for consistent matching:
 * - Trims and replaces multiple whitespaces with a single space
 * - Preserves case or lowercases based on options
 * - Normalizes Unicode combining characters (NFC)
 */
export function normalizeSemanticText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

const tokenRegexCache = new Map<string, RegExp>();
const phraseRegexCache = new Map<string, RegExp>();

/**
 * Tests if `text` contains `token` as an isolated word/token, respecting Unicode word boundaries.
 * `token` must not be a substring of a larger word (e.g., 'DR' in 'address', or 'b' in 'bắt').
 */
export function hasUnicodeToken(text: string, token: string, caseInsensitive = true): boolean {
  if (!text || !token) return false;
  const cacheKey = `${caseInsensitive ? "i:" : "s:"}${token}`;
  let regex = tokenRegexCache.get(cacheKey);
  if (!regex) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = caseInsensitive ? "gui" : "gu";
    regex = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags);
    tokenRegexCache.set(cacheKey, regex);
  }
  regex.lastIndex = 0;
  return regex.test(text.normalize("NFC"));
}

/**
 * Tests if `text` contains `phrase` with Unicode boundaries at start and end.
 */
export function hasUnicodePhrase(text: string, phrase: string, caseInsensitive = true): boolean {
  if (!text || !phrase) return false;
  const cacheKey = `${caseInsensitive ? "i:" : "s:"}${phrase}`;
  let regex = phraseRegexCache.get(cacheKey);
  if (!regex) {
    const normalizedPhrase = normalizeSemanticText(phrase);
    // Match whitespace flexibilities between words in phrase
    const escaped = normalizedPhrase
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");

    const flags = caseInsensitive ? "gui" : "gu";
    regex = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags);
    phraseRegexCache.set(cacheKey, regex);
  }
  regex.lastIndex = 0;
  return regex.test(text.normalize("NFC"));
}

/**
 * Matches patterns against text using Unicode letter/number boundaries.
 */
export function matchUnicodePattern(text: string, patternString: string, caseInsensitive = true): RegExpMatchArray | null {
  if (!text || !patternString) return null;
  const flags = caseInsensitive ? "gui" : "gu";
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])(?:${patternString})(?![\\p{L}\\p{N}])`, flags);
  return text.normalize("NFC").match(regex);
}

/**
 * Checks if a specific target concept is explicitly negated in the local context window.
 * Looks for negation operators within 1-5 words before or after the concept.
 */
export function isConceptNegated(text: string, conceptKeywords: string[]): { isNegated: boolean; snippet?: string } {
  if (!text || conceptKeywords.length === 0) return { isNegated: false };

  const norm = normalizeSemanticText(text).toLowerCase();

  // Common Vietnamese negation patterns
  const negationPrefixes = [
    "không có",
    "không bị",
    "không phải",
    "không mất",
    "không giảm",
    "không tụt",
    "không thay đổi",
    "không dính",
    "chưa có",
    "chưa bị",
    "chưa phải",
    "loại trừ",
    "loại bỏ",
    "không",
    "chưa"
  ];

  const positiveStatusSuffixes = [
    "vẫn bình thường",
    "vẫn ổn",
    "vẫn giữ",
    "đều bình thường",
    "không có vấn đề",
    "không vấn đề gì",
    "không mất",
    "không thay đổi",
    "không giảm",
    "bình thường"
  ];

  for (const keyword of conceptKeywords) {
    const kw = keyword.toLowerCase();
    const kwIndex = norm.indexOf(kw);
    if (kwIndex === -1) continue;

    // Check prefix negation within ~40 characters before keyword
    const prefixWindow = norm.slice(Math.max(0, kwIndex - 45), kwIndex);
    for (const neg of negationPrefixes) {
      if (hasUnicodePhrase(prefixWindow, neg)) {
        return {
          isNegated: true,
          snippet: `${neg} ${kw}`
        };
      }
    }

    // Check suffix stability/normal affirmation within ~40 characters after keyword
    const kwEnd = kwIndex + kw.length;
    const suffixWindow = norm.slice(kwEnd, Math.min(norm.length, kwEnd + 45));
    for (const posSuffix of positiveStatusSuffixes) {
      if (hasUnicodePhrase(suffixWindow, posSuffix)) {
        return {
          isNegated: true,
          snippet: `${kw} ${posSuffix}`
        };
      }
    }
  }

  return { isNegated: false };
}
