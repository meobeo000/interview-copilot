import type {
  IngestionInput,
  KnowledgeChunk,
  KnowledgeSourceType,
  KnowledgeTopic
} from "./types";
import { validateAndEnforceSafety } from "./types";

export interface KnowledgeImporter {
  readonly formatName: string;
  import(input: IngestionInput): KnowledgeChunk[];
}

/**
 * Deterministic text parser for pasted / manual notes.
 * Splits notes by markdown headings, section markers "[Topic]", or multi-line paragraphs.
 * 0 AI calls, 0 network requests, 100% deterministic and fast.
 */
export class ManualTextImporter implements KnowledgeImporter {
  readonly formatName = "manual_text";

  import(input: IngestionInput): KnowledgeChunk[] {
    const rawText = input.text.trim();
    if (!rawText) return [];

    const defaultTopic: KnowledgeTopic = input.defaultTopic || "GENERAL";
    const sourceType: KnowledgeSourceType = input.sourceType || "practitioner_playbook";
    const sourceName = input.sourceName || "Manual Notes";

    // Split text into section blocks by markdown headers or double newlines with bullet grouping
    const rawSections = this.splitIntoSections(rawText);
    const chunks: KnowledgeChunk[] = [];
    const timestamp = new Date().toISOString();

    for (let i = 0; i < rawSections.length; i++) {
      const section = rawSections[i];
      if (!section.body.trim()) continue;

      const detectedTopic = this.inferTopicFromText(section.title + " " + section.body) || defaultTopic;
      const tags = Array.from(
        new Set([
          ...(input.tags || []),
          ...this.extractTags(section.title + " " + section.body)
        ])
      );

      const chunkId = `${sourceType}:${detectedTopic.toLowerCase()}:${Date.now()}-${i + 1}`;

      const validated = validateAndEnforceSafety({
        id: chunkId,
        sourceType,
        topic: detectedTopic,
        title: section.title || `${sourceName} - Phần ${i + 1}`,
        content: section.body.trim(),
        tags,
        sourceName,
        sourceFile: input.sourceFile,
        market: input.market || "iGaming",
        geo: input.geo || "VN",
        createdAt: timestamp
      });

      chunks.push(validated);
    }

    return chunks;
  }

  private splitIntoSections(text: string): Array<{ title?: string; body: string }> {
    const lines = text.split("\n");
    const sections: Array<{ title?: string; body: string }> = [];
    let currentTitle: string | undefined;
    let currentBodyLines: string[] = [];

    const flush = () => {
      const body = currentBodyLines.join("\n").trim();
      if (body) {
        sections.push({ title: currentTitle, body });
      }
      currentTitle = undefined;
      currentBodyLines = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      // Check for Markdown headers: #, ##, ### or [Section Title]
      if (/^#{1,4}\s+(.+)$/.test(trimmed)) {
        flush();
        currentTitle = trimmed.replace(/^#{1,4}\s+/, "").trim();
      } else if (/^\[([A-Z0-9_\-\s]+)\](?:\s*[:-]?\s*(.*))?$/i.test(trimmed) && trimmed.length < 80) {
        flush();
        currentTitle = trimmed;
      } else if (trimmed === "---" || trimmed === "===") {
        flush();
      } else {
        currentBodyLines.push(line);
      }
    }

    flush();

    // If no headings found and section is just 1 huge block, optionally chunk by double newlines
    if (sections.length === 1 && sections[0].body.length > 800) {
      const paragraphs = sections[0].body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (paragraphs.length > 1) {
        return paragraphs.map((p, idx) => ({
          title: `Đoạn ${idx + 1}`,
          body: p
        }));
      }
    }

    return sections;
  }

  private inferTopicFromText(text: string): KnowledgeTopic | undefined {
    const lower = text.toLowerCase();

    if (/\b(budget|ngân sách|chi phí|tiền|20 triệu|phân bổ)\b/i.test(lower)) return "BUDGET";
    if (/\b(pbn|pi bi en|bi bi en|vệ tinh)\b.+\b(ngày|thời điểm|khi nào|signal)\b/i.test(lower)) return "PBN_TIMING";
    if (/\b(pbn|vệ tinh)\b/i.test(lower)) return "PBN";
    if (/\b(domain|tên miền|tld|expired domain|\.in|\.me|\.my|\.nl|\.co\.in|wayback)\b/i.test(lower)) return "DOMAIN_SELECTION";
    if (/\b(chưa nhận key|chưa nhận keyword|không nhận key|mở bot|mở cổng|cây)\b/i.test(lower)) return "NO_KEYWORD_SIGNAL";
    if (/\b(core update|thuật toán|update của google)\b/i.test(lower)) return "CORE_UPDATE";
    if (/\b(negative seo|link bẩn|spam link|disavow)\b/i.test(lower)) return "NEGATIVE_SEO";
    if (/\b(301|redirect 301|chuyển hướng)\b/i.test(lower)) return "REDIRECT_301";
    if (/\b(entity|en ti ti|social trust|profile)\b/i.test(lower)) return "ENTITY";
    if (/\b(guest post|gét pót|guest port|outreach)\b/i.test(lower)) return "GUEST_POST";
    if (/\b(internal link|silo|cấu trúc site|on-page|onpage)\b/i.test(lower)) return "ONPAGE";
    if (/\b(technical|canonical|sitemap|robots\.txt|crawl)\b/i.test(lower)) return "TECHNICAL_SEO";
    if (/\b(gsc|search console|impression|click)\b/i.test(lower)) return "GSC";
    if (/\b(anchor text|an co text)\b/i.test(lower)) return "ANCHOR_TEXT";
    if (/\b(referring domain|backlink)\b/i.test(lower)) return "BACKLINK_FOUNDATION";

    return undefined;
  }

  private extractTags(text: string): string[] {
    const keywords = [
      "budget", "ngân sách", "pbn", "entity", "guest post", "domain",
      "expired domain", "tld", "indexing", "no keyword signal", "onpage",
      "internal link", "gsc", "core update", "negative seo", "301 redirect",
      "referring domain", "anchor text", "igaming"
    ];
    const lower = text.toLowerCase();
    return keywords.filter((kw) => lower.includes(kw));
  }
}

/**
 * Safe JSON array importer.
 */
export class JsonImporter implements KnowledgeImporter {
  readonly formatName = "json";

  import(input: IngestionInput): KnowledgeChunk[] {
    try {
      const parsed = JSON.parse(input.text);
      if (!Array.isArray(parsed)) {
        throw new Error("JSON payload must be an array of KnowledgeChunk objects");
      }
      return parsed.map((item) =>
        validateAndEnforceSafety({
          ...item,
          sourceType: input.sourceType || item.sourceType,
          sourceName: input.sourceName || item.sourceName
        })
      );
    } catch (err) {
      throw new Error(`JsonImporter failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
