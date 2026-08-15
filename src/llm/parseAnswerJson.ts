import type { SuggestedAnswer } from "../shared/types";

/**
 * Parses clean streaming text protocol from fast LLM answers:
 * Line 1: Direct opening line
 * Lines 2+: - Action bullet
 *
 * Also falls back transparently to JSON if the response is formatted as JSON.
 */
export function parseStreamingAnswer(rawText: string): SuggestedAnswer {
  if (!rawText || !rawText.trim()) {
    return {
      openingLine: "",
      bullets: [],
      keywords: [],
      confidence: 0.95
    };
  }

  const trimmed = rawText.trim();

  // If payload appears to be JSON, use JSON partial parser
  if (trimmed.startsWith("{") || trimmed.includes('"openingLine"')) {
    return parsePartialAnswerJson(rawText);
  }

  // Parse text streaming format
  const rawLines = rawText.split("\n");
  let openingLine = "";
  const bullets: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) {
      continue;
    }

    // Check if line is a bullet item
    if (/^[-*•\d.]+\s+/.test(line)) {
      const cleanBullet = line.replace(/^[-*•\d.]+\s+/, "").trim();
      if (cleanBullet) {
        bullets.push(cleanBullet);
      }
    } else if (!openingLine) {
      // First non-bullet line is the opening line
      openingLine = line.replace(/^[#>*"\s]+/, "").replace(/["\s]+$/, "");
    } else if (bullets.length === 0) {
      // Continuation of opening line before bullets start
      openingLine += " " + line;
    } else {
      // Continuation or un-bulleted remark
      bullets.push(line);
    }
  }

  // Extract any obvious SEO keywords for tags metadata
  const keywords: string[] = [];
  const keywordMatches = rawText.match(/\b(GSC|GA4|Ahrefs|PBN|Guest Post|Entity|Core Update|301|DR|backlink|keyword|traffic)\b/gi);
  if (keywordMatches) {
    for (const kw of keywordMatches) {
      const normalizedKw = kw.toUpperCase() === "GSC" || kw.toUpperCase() === "PBN" || kw.toUpperCase() === "GA4" || kw.toUpperCase() === "DR"
        ? kw.toUpperCase()
        : kw;
      if (!keywords.some((k) => k.toLowerCase() === normalizedKw.toLowerCase()) && keywords.length < 4) {
        keywords.push(normalizedKw);
      }
    }
  }

  return {
    openingLine: openingLine || (bullets[0] ? "" : trimmed),
    bullets,
    keywords: keywords.length > 0 ? keywords : ["SEO", "Live"],
    confidence: 0.95
  };
}

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
    return parseStreamingAnswer(rawJsonText);
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
