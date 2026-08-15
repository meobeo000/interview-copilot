export type QuestionIntentCategory =
  | "PROJECT_EXPERIENCE"
  | "BUDGET_ALLOCATION"
  | "NO_KEYWORD_SIGNAL"
  | "ONPAGE_DIAGNOSIS"
  | "PBN_TIMING"
  | "DOMAIN_SELECTION"
  | "CORE_UPDATE_RECOVERY"
  | "GSC_RANKING_DROP"
  | "NEGATIVE_SEO"
  | "REDIRECT_301"
  | "STRATEGY_PLAN"
  | "UNKNOWN";

export interface QuestionIntent {
  category: QuestionIntentCategory;
  confidence: number;
  normalizedQuestion: string;
  evidence: string[];
  rawTranscript?: string;
}

interface PatternRule {
  category: QuestionIntentCategory;
  patterns: RegExp[];
  keywords: string[];
  minConfidence: number;
}

const INTENT_RULES: PatternRule[] = [
  {
    category: "PROJECT_EXPERIENCE",
    patterns: [
      /\b(dự án|project|case study|kinh nghiệm)\b.+\b(gần nhất|từng làm|làm là|đã làm|thành công)\b/i,
      /\b(làm qua|từng làm)\b.+\b(igaming|casino|betting|crypto|site|dự án)\b/i,
      /\b(xây dựng|triển khai|làm|setup|set up)\b.+\b(hệ thống|site vệ tinh|dự án)\b.+\b(igaming|casino|betting)\b/i
    ],
    keywords: ["dự án", "igaming", "kinh nghiệm", "gần nhất", "từng làm", "site vệ tinh"],
    minConfidence: 0.90
  },
  {
    category: "BUDGET_ALLOCATION",
    patterns: [
      /\b(budget|ngân sách|chi phí|tiền|chi tiêu)\b.+\b(chia|phân bổ|tối ưu|bao nhiêu|thế nào)\b/i,
      /\b(guest post|pbn|backlink)\b.+\b(chia\s+budget|phân bổ\s+budget|tỷ lệ|phần trăm)\b/i,
      /\b(chia|phân bổ)\b.+\b(budget|ngân sách)\b/i
    ],
    keywords: ["budget", "ngân sách", "chia budget", "phân bổ", "guest post", "pbn"],
    minConfidence: 0.92
  },
  {
    category: "NO_KEYWORD_SIGNAL",
    patterns: [
      /\b(chưa|không|vẫn chưa|mãi không)\s+(nhận|lên|vào)\s+(keyword|key word|key|cây|từ khóa)\b/i,
      /\b(mở bot|mở\s+cổng|crawl|index)\b.+\b(chưa|không)\s+(nhận|lên|index|keyword)\b/i,
      /\b(site|web|domain)\b.+\b(chưa nhận keyword|không nhận key|không index|không có traffic)\b/i
    ],
    keywords: ["chưa nhận keyword", "mở bot", "nhận key", "không nhận keyword", "crawl bot"],
    minConfidence: 0.90
  },
  {
    category: "PBN_TIMING",
    patterns: [
      /\b(ngày thứ|thời điểm|khi nào|bao lâu|mấy ngày)\b.+\b(bắt đầu|mới|đi|bắn|triển khai)\s+(pbn|vệ tinh)\b/i,
      /\b(pbn)\b.+\b(ngày thứ|khi nào|bao lâu|thời điểm nào)\b/i,
      /\b(tại sao|vì sao)\b.+\b(mới bắt đầu|mới đi|mới bắn)\s+(pbn|link)\b/i
    ],
    keywords: ["pbn", "ngày thứ", "thời điểm", "khi nào đi pbn", "bắt đầu pbn"],
    minConfidence: 0.92
  },
  {
    category: "DOMAIN_SELECTION",
    patterns: [
      /\b(domain|tên miền|expired domain)\b.+\b(dr cao|traffic|chọn|mua|lấy không|đánh giá|check)\b/i,
      /\b(wayback|backlink profile|dr|ur|organic traffic)\b.+\b(kiểm tra|check|lấy không|thế nào)\b/i,
      /\b(dr cao nhưng|traffic bằng 0|organic traffic = 0)\b/i
    ],
    keywords: ["domain", "dr cao", "organic traffic", "wayback", "backlink profile", "expired domain"],
    minConfidence: 0.90
  },
  {
    category: "CORE_UPDATE_RECOVERY",
    patterns: [
      /\b(core update|update của google|thuật toán|google update)\b/i,
      /\b(ảnh hưởng|tụt dốc|mất traffic|bị phạt|khắc phục)\b.+\b(sau update|core update|thuật toán)\b/i
    ],
    keywords: ["core update", "thuật toán", "ảnh hưởng sau core update", "recovery", "tụt sau update"],
    minConfidence: 0.92
  },
  {
    category: "GSC_RANKING_DROP",
    patterns: [
      /\b(gsc|google search console)\b.+\b(tụt|giảm|drop|mất|rớt)\b/i,
      /\b(impression|click|thứ hạng|ranking)\b.+\b(tụt|giảm|drop|mất)\b/i,
      /\b(check gsc|kiểm tra gsc)\b.+\b(tụt traffic|ranking drop)\b/i
    ],
    keywords: ["gsc", "ranking drop", "tụt impression", "tụt click", "giảm thứ hạng"],
    minConfidence: 0.88
  },
  {
    category: "NEGATIVE_SEO",
    patterns: [
      /\b(negative seo|bắn link bẩn|spam link|link bẩn|đối thủ chơi xấu|bị dính link xấu|disavow)\b/i,
      /\b(xử lý|khắc phục)\b.+\b(link bẩn|spam backlink|bắn link)\b/i
    ],
    keywords: ["negative seo", "link bẩn", "spam link", "disavow", "bắn link xấu"],
    minConfidence: 0.92
  },
  {
    category: "REDIRECT_301",
    patterns: [
      /\b(301|redirect 301|chuyển hướng 301|redirect domain|chuyển domain)\b/i,
      /\b(giữ link juice|giữ juice|chuyển hướng)\b.+\b(domain cũ|domain mới)\b/i
    ],
    keywords: ["301 redirect", "chuyển hướng", "redirect", "domain cũ sang mới", "juice"],
    minConfidence: 0.92
  },
  {
    category: "ONPAGE_DIAGNOSIS",
    patterns: [
      /\b(onpage|on-page|on page)\b.+\b(check|kiểm tra|trước hay|audit|tối ưu)\b/i,
      /\b(check|kiểm tra)\b.+\b(gsc|ahrefs)\b.+\b(trước hay on-page|onpage trước)\b/i,
      /\b(technical|audit|cấu trúc|schema|heading|sitemap|robots\.txt|canonical)\b/i
    ],
    keywords: ["onpage", "on-page", "gsc với ahrefs", "check trước", "audit onpage"],
    minConfidence: 0.88
  },
  {
    category: "STRATEGY_PLAN",
    patterns: [
      /\b(internal link|money page|anchor text|entity|cấu trúc silo|topic cluster|kế hoạch|chiến lược)\b/i,
      /\b(guest post|outreach|tiêu chí)\b.+\b(chọn site|chất lượng|là gì|thế nào|tiêu chí)\b/i,
      /\b(đi link|xây dựng link|triển khai link|tối ưu)\b.+\b(thế nào|như thế nào|ra sao|chiến lược)\b/i,
      /\b(referring domain|anchor text)\b.+\b(kiểm tra|tối ưu|phân bổ)\b/i
    ],
    keywords: ["internal link", "money page", "anchor text", "entity", "referring domain", "chiến lược", "guest post", "tiêu chí"],
    minConfidence: 0.85
  }
];

/**
 * Lightweight semantic intent classifier for SEO interview questions.
 * Robust against minor Vietnamese STT phonetic corruptions and English SEO terms.
 */
export function classifyQuestionIntent(
  normalizedText: string,
  rawTranscript?: string
): QuestionIntent {
  const text = normalizedText.trim();
  if (!text) {
    return {
      category: "UNKNOWN",
      confidence: 0,
      normalizedQuestion: "",
      evidence: [],
      rawTranscript
    };
  }

  const lower = text.toLowerCase();

  for (const rule of INTENT_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(lower)) {
        const matchingEvidence = rule.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
        return {
          category: rule.category,
          confidence: rule.minConfidence,
          normalizedQuestion: text,
          evidence: matchingEvidence.length > 0 ? matchingEvidence : [rule.category],
          rawTranscript
        };
      }
    }
  }

  // Check keyword matches as fallback
  for (const rule of INTENT_RULES) {
    const matchedKeywords = rule.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
    if (matchedKeywords.length >= 2) {
      return {
        category: rule.category,
        confidence: Math.max(0.75, rule.minConfidence - 0.1),
        normalizedQuestion: text,
        evidence: matchedKeywords,
        rawTranscript
      };
    }
  }

  return {
    category: "UNKNOWN",
    confidence: 0.2,
    normalizedQuestion: text,
    evidence: [],
    rawTranscript
  };
}
