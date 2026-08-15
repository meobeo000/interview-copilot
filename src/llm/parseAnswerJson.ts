import type { SuggestedAnswer } from "../shared/types";

/**
 * Parses full or partial JSON text streamed from LLMs (Gemini / Groq / OpenAI).
 * Safely extracts openingLine, bullets, and keywords without throwing syntax errors
 * or leaking raw JSON structural tokens ({}, [], key names, quotes) onto the UI.
 */
export function parsePartialAnswerJson(rawJsonText: string): SuggestedAnswer {
  if (!rawJsonText || !rawJsonText.trim()) {
    return {
      openingLine: "",
      bullets: [],
      keywords: [],
      confidence: 0.95
    };
  }

  // 1. Try strict JSON parsing if complete
  try {
    const parsed = JSON.parse(rawJsonText) as {
      openingLine?: string;
      bullets?: string[];
      keywords?: string[];
    };
    if (parsed && typeof parsed === "object") {
      return {
        openingLine: typeof parsed.openingLine === "string" ? parsed.openingLine.trim() : "",
        bullets: Array.isArray(parsed.bullets)
          ? parsed.bullets.filter((b): b is string => typeof b === "string" && Boolean(b.trim()))
          : [],
        keywords: Array.isArray(parsed.keywords)
          ? parsed.keywords.filter((k): k is string => typeof k === "string" && Boolean(k.trim()))
          : [],
        confidence: 0.95
      };
    }
  } catch {
    // Continue to partial streaming extraction below
  }

  let openingLine = "";
  const bullets: string[] = [];
  const keywords: string[] = [];

  // 2. Extract openingLine: "openingLine": "..."
  const openingMatch = rawJsonText.match(/"openingLine"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"?/);
  if (openingMatch && openingMatch[1]) {
    openingLine = openingMatch[1].replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
  }

  // 3. Extract bullets array items: "bullets": [ ... ]
  const bulletsSectionMatch = rawJsonText.match(/"bullets"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
  if (bulletsSectionMatch && bulletsSectionMatch[1]) {
    const section = bulletsSectionMatch[1];
    const itemRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"?/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(section)) !== null) {
      const val = match[1].replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
      if (val && val !== ",") {
        bullets.push(val);
      }
    }
  }

  // 4. Extract keywords array items: "keywords": [ ... ]
  const keywordsSectionMatch = rawJsonText.match(/"keywords"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
  if (keywordsSectionMatch && keywordsSectionMatch[1]) {
    const section = keywordsSectionMatch[1];
    const itemRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"?/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(section)) !== null) {
      const val = match[1].replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
      if (val && val !== ",") {
        keywords.push(val);
      }
    }
  }

  // 5. Fallback for non-JSON plain text streaming
  if (!openingLine && bullets.length === 0 && !rawJsonText.trim().startsWith("{")) {
    const lines = rawJsonText
      .split("\n")
      .map((l) => l.trim().replace(/^[-*•\d.]+\s*/, ""))
      .filter(Boolean);
    openingLine = lines[0] || rawJsonText;
    bullets.push(...lines.slice(1));
  }

  return {
    openingLine,
    bullets,
    keywords,
    confidence: 0.90
  };
}

export function parseAnswerJson(rawJsonText: string): SuggestedAnswer {
  const result = parsePartialAnswerJson(rawJsonText);
  return {
    openingLine: result.openingLine || "Em xin trả lời câu hỏi của anh như sau:",
    bullets: result.bullets,
    keywords: result.keywords.length > 0 ? result.keywords : ["SEO", "Strategy"],
    confidence: result.confidence ?? 0.95
  };
}
