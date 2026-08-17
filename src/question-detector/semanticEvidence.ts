import {
  calculateIntentScores,
  classifyQuestionIntent,
  type IntentSignalScore,
  type QuestionIntentCategory
} from "./intentClassifier";

// ---------------------------------------------------------------------------
// 1. Centralized Semantic SEO Lexicon
// ---------------------------------------------------------------------------

export const CENTRALIZED_SEO_LEXICON = [
  "content",
  "Entity",
  "Guest Post",
  "PBN",
  "GSC",
  "GA4",
  "Ahrefs",
  "backlink",
  "internal link",
  "anchor text",
  "referring domain",
  "expired domain",
  "DR",
  "UR",
  "Core Update",
  "301",
  "money site",
  "keyword",
  "traffic",
  "indexing",
  "canonical",
  "search intent"
] as const;

// ---------------------------------------------------------------------------
// 2. Semantic Evidence State Model
// ---------------------------------------------------------------------------

export interface SemanticEvidenceState {
  turnId: string;
  startedAt: number;
  updatedAt: number;
  rawPartials: string[];
  latestTranscript: string;

  // Structured numeric & metric evidence
  numbers: number[];
  percentages: number[];
  moneyAmounts: string[];
  durations: string[];
  positions: number[];
  drValues: number[];

  // Semantic signals & categories
  seoEntities: string[];
  actionSignals: string[];
  comparisonSignals: string[];
  allocationSignals: string[];
  rankingSignals: string[];
  indexingSignals: string[];

  // Intent inference results
  intentScores: IntentSignalScore[];
  bestIntent: QuestionIntentCategory;
  confidence: number;
}

export function createInitialEvidenceState(turnId?: string): SemanticEvidenceState {
  const now = Date.now();
  return {
    turnId: turnId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `turn-${now}`),
    startedAt: now,
    updatedAt: now,
    rawPartials: [],
    latestTranscript: "",
    numbers: [],
    percentages: [],
    moneyAmounts: [],
    durations: [],
    positions: [],
    drValues: [],
    seoEntities: [],
    actionSignals: [],
    comparisonSignals: [],
    allocationSignals: [],
    rankingSignals: [],
    indexingSignals: [],
    intentScores: [],
    bestIntent: "UNKNOWN",
    confidence: 0.2
  };
}

// ---------------------------------------------------------------------------
// 3. Evidence Extractors
// ---------------------------------------------------------------------------

const SPOKEN_NUMBER_MAP: Record<string, number> = {
  "một": 1,
  "hai": 2,
  "ba": 3,
  "bốn": 4,
  "năm": 5,
  "sáu": 6,
  "bảy": 7,
  "tám": 8,
  "chín": 9,
  "mười": 10,
  "hai mươi": 20,
  "ba mươi": 30,
  "bốn mươi": 40,
  "năm mươi": 50,
  "sáu mươi": 60,
  "bảy mươi": 70,
  "tám mươi": 80,
  "chín mươi": 90,
  "trăm": 100
};

export function extractMoneyEvidence(text: string): string[] {
  const results: string[] = [];
  // Direct patterns like "20 triệu", "hai mươi triệu", "50 củ", "30tr", "100k", "500 usd", "$1000"
  const pattern = /(?:^|\s)(\d+(?:\.\d+)?|hai mươi|ba mươi|bốn mươi|năm mươi|sáu mươi|bảy mươi|tám mươi|chín mươi|mười|trăm|\d+k|\d+m)\s*(triệu|tr|củ|nghìn|k|vnd|vnđ|usd|\$)(?=\s|$|[.,?!])/gi;
  const matches = Array.from(text.matchAll(pattern));
  if (matches.length > 0) {
    for (const m of matches) {
      const fullMatch = `${m[1]} ${m[2]}`.trim();
      let normalized = fullMatch;
      const sortedSpokenEntries = Object.entries(SPOKEN_NUMBER_MAP).sort((a, b) => b[0].length - a[0].length);
      for (const [spoken, num] of sortedSpokenEntries) {
        if (normalized.toLowerCase().startsWith(spoken)) {
          normalized = normalized.toLowerCase().replace(spoken, String(num));
          break;
        }
      }
      results.push(normalized);
    }
  }

  // Handle number followed closely by spend verbs
  const numNearSpend = text.match(/(?:^|\s)(20|30|50|100)\s*(?:triệu|tr|củ)?(?=\s|$|[.,?!])/gi);
  if (numNearSpend && (text.includes("triệu") || text.includes("chi") || text.includes("phân bổ") || text.includes("chia"))) {
    for (const n of numNearSpend) {
      const trimmed = n.trim();
      if (!results.some((r) => r.includes(trimmed))) {
        results.push(trimmed.includes("triệu") ? trimmed : `${trimmed} triệu`);
      }
    }
  }

  return Array.from(new Set(results));
}

export function extractDrValues(text: string): number[] {
  const values: number[] = [];
  const matches = text.matchAll(/(?:^|\s)(?:DR|dr)\s*(\d+)(?=\s|$|[.,?!])/gi);
  for (const m of matches) {
    const val = parseInt(m[1], 10);
    if (!isNaN(val)) {
      values.push(val);
    }
  }

  const spokenMatches = text.matchAll(/(?:^|\s)(?:DR|dr)\s*(năm mươi lăm|hai mươi lăm|ba mươi lăm|bốn mươi lăm|sáu mươi lăm|bảy mươi lăm|tám mươi lăm|chín mươi lăm|hai mươi|ba mươi|bốn mươi|năm mươi|sáu mươi|bảy mươi|tám mươi|chín mươi|mười)(?=\s|$|[.,?!])/gi);
  for (const sm of spokenMatches) {
    const raw = sm[1].toLowerCase();
    if (raw === "năm mươi lăm") {
      values.push(55);
    } else if (raw === "hai mươi lăm") {
      values.push(25);
    } else if (SPOKEN_NUMBER_MAP[raw] !== undefined) {
      values.push(SPOKEN_NUMBER_MAP[raw]);
    }
  }

  return Array.from(new Set(values));
}

export function extractPercentages(text: string): number[] {
  const values: number[] = [];
  // E.g. "40%", "5 phần trăm", "50 percent"
  const symbolMatches = text.matchAll(/(\d+(?:\.\d+)?)\s*%/g);
  for (const m of symbolMatches) {
    const val = parseFloat(m[1]);
    if (!isNaN(val)) values.push(val);
  }

  const wordMatches = text.matchAll(/(?:^|\s)(\d+(?:\.\d+)?|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|hai mươi|ba mươi|bốn mươi|năm mươi)\s*(?:phần trăm|percent)(?=\s|$|[.,?!])/gi);
  for (const m of wordMatches) {
    const rawVal = m[1].toLowerCase();
    const num = SPOKEN_NUMBER_MAP[rawVal] !== undefined ? SPOKEN_NUMBER_MAP[rawVal] : parseFloat(rawVal);
    if (!isNaN(num)) values.push(num);
  }

  return Array.from(new Set(values));
}

export function extractPositions(text: string): number[] {
  const values: number[] = [];
  // E.g. "average position từ 3.2 xuống 6.8" or "vị trí 4.5"
  const posMatches = text.matchAll(/(?:position|vị trí|từ|xuống)\s*(\d+(?:\.\d+)?)(?=\s|$|[.,?!])/gi);
  for (const m of posMatches) {
    const val = parseFloat(m[1]);
    if (!isNaN(val) && val > 0 && val <= 100) {
      values.push(val);
    }
  }
  return Array.from(new Set(values));
}

export function extractDurations(text: string): string[] {
  const values: string[] = [];
  const matches = text.match(/(?:^|\s)(\d+|hai|ba|bốn|năm|mười|mấy|một)\s*(?:tuần|ngày|tháng|năm|week|weeks|day|days)(?=\s|$|[.,?!])/gi);
  if (matches) {
    for (const m of matches) {
      values.push(m.trim());
    }
  }
  return Array.from(new Set(values));
}

export function extractGenericNumbers(text: string): number[] {
  const values: number[] = [];
  // Extract all numbers including floating decimals, e.g. 55, 20, 3.2, 6.8, 2000
  // Remove commas used as thousands separators e.g. 2,000 -> 2000
  const cleaned = text.replace(/(\d+),(\d+)/g, "$1$2");
  const matches = cleaned.matchAll(/(?:^|[^\d.])(\d+(?:\.\d+)?)(?=[^\d.]|$)/g);
  for (const m of matches) {
    const val = parseFloat(m[1]);
    if (!isNaN(val)) {
      values.push(val);
    }
  }
  return Array.from(new Set(values));
}

export function extractSeoEntities(text: string): string[] {
  const detected: string[] = [];
  const lower = text.toLowerCase();

  const entityPatterns: { name: string; regex: RegExp }[] = [
    { name: "content", regex: /(?:^|\s)(content|bài viết|nội dung)(?=\s|$|[.,?!])/i },
    { name: "Entity", regex: /(?:^|\s)(entity|en ti ti|social trust)(?=\s|$|[.,?!])/i },
    { name: "Guest Post", regex: /(?:^|\s)(guest post|gét pót|guest port|guestpost)(?=\s|$|[.,?!])/i },
    { name: "PBN", regex: /(?:^|\s)(pbn|pi bi en|bi bi en|p b n|site vệ tinh|sai vệ tinh)(?=\s|$|[.,?!])/i },
    { name: "backlink", regex: /(?:^|\s)(backlink|back link|link nền|bách link|link building)(?=\s|$|[.,?!])/i },
    { name: "internal link", regex: /(?:^|\s)(internal link|internal links|silo|topic cluster)(?=\s|$|[.,?!])/i },
    { name: "anchor text", regex: /(?:^|\s)(anchor text|an co text|an co teck|anchor)(?=\s|$|[.,?!])/i },
    { name: "referring domain", regex: /(?:^|\s)(referring domain|referring domains|rd)(?=\s|$|[.,?!])/i },
    { name: "expired domain", regex: /(?:^|\s)(expired domain|domain cũ|tên miền cũ)(?=\s|$|[.,?!])/i },
    { name: "DR", regex: /(?:^|\s)(dr|domain rating)(?=\s|$|[.,?!])/i },
    { name: "UR", regex: /(?:^|\s)(ur|url rating)(?=\s|$|[.,?!])/i },
    { name: "Core Update", regex: /(?:^|\s)(core update|co update|thuật toán|google update)(?=\s|$|[.,?!])/i },
    { name: "301", regex: /(?:^|\s)(301|redirect 301|chuyển hướng 301|redirect)(?=\s|$|[.,?!])/i },
    { name: "money site", regex: /(?:^|\s)(money site|money page|trang chính)(?=\s|$|[.,?!])/i },
    { name: "keyword", regex: /(?:^|\s)(keyword|key word|từ khóa|key|cây)(?=\s|$|[.,?!])/i },
    { name: "traffic", regex: /(?:^|\s)(traffic|organic traffic|lượng truy cập)(?=\s|$|[.,?!])/i },
    { name: "indexing", regex: /(?:^|\s)(indexing|index|mở bot|crawl bot|crawl)(?=\s|$|[.,?!])/i },
    { name: "canonical", regex: /(?:^|\s)(canonical|rel canonical)(?=\s|$|[.,?!])/i },
    { name: "search intent", regex: /(?:^|\s)(search intent|ý định tìm kiếm)(?=\s|$|[.,?!])/i },
    { name: "GSC", regex: /(?:^|\s)(gsc|g s c|gi ét xi|google search console|search console)(?=\s|$|[.,?!])/i },
    { name: "GA4", regex: /(?:^|\s)(ga4|google analytics 4|google analytics)(?=\s|$|[.,?!])/i },
    { name: "Ahrefs", regex: /(?:^|\s)(ahrefs|a href|ah ref|ai rép)(?=\s|$|[.,?!])/i }
  ];

  for (const item of entityPatterns) {
    if (item.regex.test(lower)) {
      detected.push(item.name);
    }
  }

  return detected;
}

export function extractActionSignals(text: string): string[] {
  const matches = text.match(/(?:^|\s)(triển khai|xây dựng|tối ưu|kiểm tra|check|disavow|gỡ link|cứu site|khắc phục|hồi phục|recovery|bắn link|đẩy link|đi link|chọn site|setup|set up)(?=\s|$|[.,?!])/gi);
  return matches ? Array.from(new Set(matches.map((m) => m.trim().toLowerCase()))) : [];
}

export function extractAllocationSignals(text: string): string[] {
  const matches = text.match(/(?:^|\s)(chia|phân bổ|dành bao nhiêu|bao nhiêu cho|tỷ lệ|phần trăm|allocate|phân chia|chia tiền|dành ra|tối ưu chi phí|bỏ ra bao nhiêu)(?=\s|$|[.,?!])/gi);
  return matches ? Array.from(new Set(matches.map((m) => m.trim().toLowerCase()))) : [];
}

export function extractComparisonSignals(text: string): string[] {
  const matches = text.match(/(?:^|\s)(con a|con b|domain a|domain b|site a|site b|chọn con nào|lấy không|có lấy không|có mua không|nên mua|lấy con nào|traffic bằng 0|traffic = 0|traffic không|traffic thật)(?=\s|$|[.,?!])/gi);
  return matches ? Array.from(new Set(matches.map((m) => m.trim().toLowerCase()))) : [];
}

export function extractIndexingSignals(text: string): string[] {
  const matches = text.match(/(?:^|\s)(mở bot|mở cổng|crawl bot|bật index|mở index|crawl|chưa nhận|không nhận|mãi không|vẫn chưa|chưa lên|chưa nhận key|chưa nhận cây|không có tín hiệu)(?=\s|$|[.,?!])/gi);
  return matches ? Array.from(new Set(matches.map((m) => m.trim().toLowerCase()))) : [];
}

export function extractRankingSignals(text: string): string[] {
  const matches = text.match(/(?:^|\s)(impression|click|thứ hạng|ranking|ctr|average position|vị trí|tụt|giảm|drop|mất|rớt)(?=\s|$|[.,?!])/gi);
  return matches ? Array.from(new Set(matches.map((m) => m.trim().toLowerCase()))) : [];
}

// ---------------------------------------------------------------------------
// 4. Semantic Evidence Accumulator
// ---------------------------------------------------------------------------

export class SemanticEvidenceAccumulator {
  private state: SemanticEvidenceState;

  constructor(turnId?: string) {
    this.state = createInitialEvidenceState(turnId);
  }

  /**
   * Starts a clean new interviewer turn.
   */
  startTurn(turnId?: string): SemanticEvidenceState {
    this.state = createInitialEvidenceState(turnId);
    return this.state;
  }

  /**
   * Resets current accumulator state.
   */
  reset(): void {
    this.state = createInitialEvidenceState();
  }

  /**
   * Returns current accumulated evidence state.
   */
  getState(): SemanticEvidenceState {
    return this.state;
  }

  /**
   * Appends an STT partial transcript.
   * Handles progressive updates, deduplicates values, preserves facts across partials.
   *
   * @param partialText - The partial transcript string
   * @param isIncremental - Whether this partial is an incremental chunk or a full utterance snapshot
   */
  appendPartial(partialText: string, isIncremental = false): SemanticEvidenceState {
    const trimmed = partialText.trim();
    if (!trimmed) {
      return this.state;
    }

    this.state.rawPartials.push(trimmed);
    this.state.updatedAt = Date.now();

    // Partial Replacement vs Append:
    // Deepgram & standard STT partials are full utterance snapshots. If incremental, append with space.
    if (isIncremental) {
      this.state.latestTranscript = `${this.state.latestTranscript} ${trimmed}`.trim();
    } else {
      this.state.latestTranscript = trimmed;
    }

    this.mergeEvidenceFromText(trimmed);
    this.reevaluateIntent();
    this.logDiagnostic();

    return this.state;
  }

  /**
   * Appends a final STT transcript at speech end.
   */
  appendFinal(finalText: string): SemanticEvidenceState {
    return this.appendPartial(finalText, false);
  }

  private mergeEvidenceFromText(text: string): void {
    // 1. Money amounts
    const money = extractMoneyEvidence(text);
    for (const m of money) {
      if (!this.state.moneyAmounts.includes(m)) {
        this.state.moneyAmounts.push(m);
      }
    }

    // 2. DR values
    const drs = extractDrValues(text);
    for (const d of drs) {
      if (!this.state.drValues.includes(d)) {
        this.state.drValues.push(d);
      }
    }

    // 3. Percentages
    const pcts = extractPercentages(text);
    for (const p of pcts) {
      if (!this.state.percentages.includes(p)) {
        this.state.percentages.push(p);
      }
    }

    // 4. Positions
    const pos = extractPositions(text);
    for (const po of pos) {
      if (!this.state.positions.includes(po)) {
        this.state.positions.push(po);
      }
    }

    // 5. Durations
    const durs = extractDurations(text);
    for (const du of durs) {
      if (!this.state.durations.includes(du)) {
        this.state.durations.push(du);
      }
    }

    // 6. Generic numbers (preserving decimals e.g. 3.2, 6.8, 55, 20, 2000)
    const nums = extractGenericNumbers(text);
    for (const n of nums) {
      if (!this.state.numbers.includes(n)) {
        this.state.numbers.push(n);
      }
    }

    // 7. SEO Entities
    const entities = extractSeoEntities(text);
    for (const e of entities) {
      if (!this.state.seoEntities.includes(e)) {
        this.state.seoEntities.push(e);
      }
    }

    // 8. Action signals
    const actions = extractActionSignals(text);
    for (const a of actions) {
      if (!this.state.actionSignals.includes(a)) {
        this.state.actionSignals.push(a);
      }
    }

    // 9. Allocation signals
    const alloc = extractAllocationSignals(text);
    for (const al of alloc) {
      if (!this.state.allocationSignals.includes(al)) {
        this.state.allocationSignals.push(al);
      }
    }

    // 10. Comparison signals
    const comp = extractComparisonSignals(text);
    for (const c of comp) {
      if (!this.state.comparisonSignals.includes(c)) {
        this.state.comparisonSignals.push(c);
      }
    }

    // 11. Indexing signals
    const idx = extractIndexingSignals(text);
    for (const i of idx) {
      if (!this.state.indexingSignals.includes(i)) {
        this.state.indexingSignals.push(i);
      }
    }

    // 12. Ranking signals
    const rnk = extractRankingSignals(text);
    for (const r of rnk) {
      if (!this.state.rankingSignals.includes(r)) {
        this.state.rankingSignals.push(r);
      }
    }
  }

  private reevaluateIntent(): void {
    // Score intent using full accumulated transcript and accumulated evidence
    const fullText = this.state.latestTranscript;
    const scores = calculateIntentScores(fullText, this.state);
    this.state.intentScores = scores;

    const classified = classifyQuestionIntent(fullText, undefined, this.state);
    this.state.bestIntent = classified.category;
    this.state.confidence = classified.confidence;
  }

  private logDiagnostic(): void {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
      return;
    }

    // Only log if there is meaningful evidence
    if (
      this.state.moneyAmounts.length === 0 &&
      this.state.seoEntities.length === 0 &&
      this.state.allocationSignals.length === 0 &&
      this.state.comparisonSignals.length === 0 &&
      this.state.numbers.length === 0 &&
      this.state.bestIntent === "UNKNOWN"
    ) {
      return;
    }

    const lines = [
      "[SEMANTIC EVIDENCE]",
      `turnId: ${this.state.turnId}`,
      `latestTranscript: ${this.state.latestTranscript}`,
      `money: ${JSON.stringify(this.state.moneyAmounts)}`,
      `entities: ${JSON.stringify(this.state.seoEntities)}`,
      `allocation: ${this.state.allocationSignals.length > 0}`,
      `numbers: ${JSON.stringify(this.state.numbers)}`,
      `drValues: ${JSON.stringify(this.state.drValues)}`,
      `bestIntent: ${this.state.bestIntent}`,
      `confidence: ${this.state.confidence.toFixed(2)}`
    ];

    console.log(lines.join("\n"));
  }
}
