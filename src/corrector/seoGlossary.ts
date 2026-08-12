/**
 * Centralized reference glossary of SEO and iGaming terminology.
 *
 * NOTE: Active phonetic correction heuristics in ContextAwareTranscriptCorrector
 * are currently implemented for high-frequency STT misrecognitions including:
 * - "site" (e.g. "nhận sai" -> "nhận site")
 * - "Ahrefs" (e.g. "ai rép", "ai ref", "ah ref")
 * - "PBN" (e.g. "pi bi en", "p b n")
 * - "GSC" (e.g. "gi ét xi", "g s c")
 * - "Core Update" (e.g. "co update")
 * - "iGaming" (e.g. "i gaming")
 * - "Guest Post" (e.g. "guestpost")
 */
export const SEO_IGAMING_GLOSSARY = [
  "site",
  "website",
  "iGaming",
  "keyword",
  "GSC",
  "Google Search Console",
  "GA4",
  "Ahrefs",
  "Semrush",
  "Core Update",
  "PBN",
  "Guest Post",
  "Entity",
  "backlink",
  "referring domain",
  "anchor text",
  "expired domain",
  "301 redirect",
  "canonical",
  "robots.txt",
  "sitemap",
  "indexing",
  "search intent",
  "internal link",
  "DR",
  "UR",
  "organic traffic",
  "money site",
  "negative SEO",
  "disavow",
  "Wayback",
  "casino",
  "betting",
  "sports betting",
  "crawl",
  "bot",
  "SERP",
  "CTR",
  "impression",
  "position",
  "traffic"
] as const;
