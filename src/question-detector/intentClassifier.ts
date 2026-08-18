import type { SemanticEvidenceState } from "./semanticEvidence";
import { isConceptNegated, matchUnicodePattern } from "../shared/semanticTextMatcher";

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

export interface IntentSignalScore {
  category: QuestionIntentCategory;
  totalScore: number;
  signals: Record<string, number>;
  evidenceTokens: string[];
}

export interface QuestionIntent {
  category: QuestionIntentCategory;
  confidence: number;
  normalizedQuestion: string;
  evidence: string[];
  rawTranscript?: string;
  scores?: IntentSignalScore[];
}

// ---------------------------------------------------------------------------
// Multi-Signal Evidence Extractors (Semantic Domain Evidence - No Brittle Phonetic Hacks)
// ---------------------------------------------------------------------------

interface SignalExtractionResult {
  score: number;
  tokens: string[];
  breakdown: Record<string, number>;
}

function extractMoneySignals(text: string, state?: SemanticEvidenceState): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  // Safe lexical terms (Domain terms only - NO phonetic hacks like bết/béc/bắt dét)
  const moneyKeywordMatches = text.match(/\b(ngân sách|chi phí|chi tiêu|tiền|budget)\b/gi);
  if (moneyKeywordMatches) {
    const count = moneyKeywordMatches.length;
    breakdown.moneyLexical = count * 3;
    tokens.push(...moneyKeywordMatches);
  }

  // Numerical currency amounts (numeric or spoken Vietnamese numbers with currency/multiplier)
  const amountPattern = /\b(\d+(?:\.\d+)?|hai mươi|ba mươi|bốn mươi|năm mươi|sáu mươi|bảy mươi|tám mươi|chín mươi|mười|trăm|\d+k|\d+m)\s*(triệu|tr|củ|nghìn|k|vnd|vnđ|usd|\$)\b/gi;
  const amountMatches = text.match(amountPattern);
  if (amountMatches) {
    breakdown.numericAmount = 5;
    tokens.push(...amountMatches);
  } else {
    // Standalone numbers near spend context
    const numOnly = text.match(/\b(20|30|50|100)\s*(triệu|tr|củ)?\b/i);
    if (numOnly && (text.includes("triệu") || text.includes("chi") || text.includes("phân bổ") || text.includes("chia"))) {
      breakdown.numericAmount = 5;
      tokens.push(numOnly[0]);
    }
  }

  // Accumulate from state if prior partial had money but current partial text doesn't
  if (!breakdown.numericAmount && !breakdown.moneyLexical && state && state.moneyAmounts.length > 0) {
    breakdown.accumulatedMoney = 5;
    tokens.push(...state.moneyAmounts);
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens: Array.from(new Set(tokens)), breakdown };
}

function extractAllocationSignals(text: string, state?: SemanticEvidenceState): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  const allocMatches = text.match(/\b(chia|phân bổ|dành bao nhiêu|bao nhiêu cho|tỷ lệ|phần trăm|allocate|phân chia|chia tiền|dành ra|tối ưu chi phí|bỏ ra bao nhiêu)\b/gi);
  if (allocMatches) {
    breakdown.allocationAction = 4;
    tokens.push(...allocMatches);
  }

  // Question words inquiring about how to divide
  const howToDivide = text.match(/\b(thế nào|ra sao|như thế nào|sao)\b/gi);
  if (howToDivide && (text.includes("chia") || text.includes("phân bổ") || text.includes("dành") || (state && state.allocationSignals.length > 0))) {
    breakdown.allocationQuestion = 2;
    tokens.push(howToDivide[0]);
  }

  if (!breakdown.allocationAction && state && state.allocationSignals.length > 0) {
    breakdown.accumulatedAllocation = 4;
    tokens.push(...state.allocationSignals);
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens: Array.from(new Set(tokens)), breakdown };
}

function extractSeoCategorySignals(text: string, state?: SemanticEvidenceState): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  const categoryPatterns = [
    { name: "content", regex: /\b(content|bài viết|nội dung)\b/i },
    { name: "entity", regex: /\b(entity|en ti ti|social trust)\b/i },
    { name: "guest_post", regex: /\b(guest post|gét pót|guest port|guestpost)\b/i },
    { name: "pbn", regex: /\b(pbn|pi bi en|bi bi en|p b n|site vệ tinh|sai vệ tinh)\b/i },
    { name: "backlink", regex: /\b(backlink|back link|link nền|bách link|link building)\b/i },
    { name: "textlink", regex: /\b(textlink|text link|báo|sidebar)\b/i },
    { name: "forum", regex: /\b(forum|diễn đàn|web 2\.0|blog comment)\b/i }
  ];

  let detectedCategories = 0;
  for (const cat of categoryPatterns) {
    const match = text.match(cat.regex);
    if (match) {
      detectedCategories++;
      tokens.push(match[0]);
    } else if (state && state.seoEntities.some((e) => e.toLowerCase() === cat.name || (cat.name === "entity" && e === "Entity") || (cat.name === "guest_post" && e === "Guest Post") || (cat.name === "pbn" && e === "PBN"))) {
      detectedCategories++;
      tokens.push(cat.name);
    }
  }

  if (detectedCategories > 0) {
    breakdown.categories = detectedCategories * 2;
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens: Array.from(new Set(tokens)), breakdown };
}

function extractDomainComparisonSignals(text: string, state?: SemanticEvidenceState): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  // Strictly require domain evaluation context (not competitor ranking drop inspection)
  const isCompetitorInspection = Boolean(
    text.match(/\b(check\s+ahrefs|check\s+gì|những\s+chỉ\s+số\s+nào)\b/i) &&
    text.match(/\b(đối\s+thủ\s+vượt|vượt\s+ranking)\b/i)
  );

  if (isCompetitorInspection) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  // Domain comparison entities (con A, con B, domain A, domain B, site A, site B, giữa con ... và con ...)
  const comparisonMatches = matchUnicodePattern(
    text,
    "con\\s+[ab]|domain\\s+[ab]|site\\s+[ab]|option\\s+[ab]|giữa\\s+(?:con|domain|site)\\s+.+\\s+và\\s+(?:con|domain|site)"
  );
  if (comparisonMatches) {
    breakdown.domainEntities = 8;
    tokens.push(...comparisonMatches);
  } else if (state && state.comparisonSignals.length > 0) {
    breakdown.domainEntities = 8;
    tokens.push(...state.comparisonSignals);
  }

  // Domain decision / hunting / competitor / purchase language
  const decisionMatches = matchUnicodePattern(
    text,
    "chọn\\s+con\\s+nào|ưu\\s+tiên\\s+con\\s+nào|ưu\\s+tiên\\s+domain\\s+nào|lấy\\s+không|có\\s+lấy\\s+không|có\\s+mua\\s+không|nên\\s+mua|lấy\\s+con\\s+nào|chọn\\s+domain\\s+nào|chọn\\s+site\\s+nào|tiêu\\s+chí\\s+săn\\s+domain|săn\\s+domain|tiêu\\s+chí\\s+săn\\s+expired\\s+domain|săn\\s+expired\\s+domain|tiêu\\s+chí\\s+chọn\\s+domain|mua\\s+expired\\s+domain|chọn\\s+expired\\s+domain|domain\\s+a\\s+hay\\s+domain\\s+b|con\\s+a\\s+hay\\s+con\\s+b|site\\s+a\\s+hay\\s+site\\s+b|trước\\s+khi\\s+mua|mua\\s+không|check\\s+referring\\s+domain|backlink\\s+profile\\s+của\\s+đối\\s+thủ"
  );
  if (decisionMatches) {
    breakdown.decisionLanguage = 7;
    tokens.push(...decisionMatches);
  }

  // Domain identifiers & TLD testing
  const domainMatches =
    matchUnicodePattern(text, "expired\\s+domain|domain\\s+cũ|tên\\s+miền\\s+cũ|con\\s+domain|tld|\\.in|\\.me|\\.my|\\.nl|\\.co\\.in|test\\s+các\\s+đuôi|đuôi\\s+nào|a\\s*href|ah\\s*ref|ai\\s*rép|ahrefs") ||
    (matchUnicodePattern(text, "domain") && !text.match(/referring\s+domain/i) ? ["domain"] : null);
  if (domainMatches && (comparisonMatches || decisionMatches || text.includes("wayback") || text.includes("dr") || text.includes("history") || text.includes("đuôi") || text.includes(".in") || text.includes(".me") || text.includes(".my") || text.includes(".nl") || text.includes("đối thủ"))) {
    breakdown.domainLexical = 7;
    tokens.push(...domainMatches);
  }

  // Domain history / quality attributes (history rác, history sạch, wayback check)
  const historyMatches = text.match(/\b(history rác|history sạch|check wayback|wayback|anchor text rác|bắn redirect)\b/gi);
  if (historyMatches) {
    breakdown.domainHistory = 5;
    tokens.push(...historyMatches);
  }

  // Domain metrics & tools (DR comparison or Wayback check for domain selection)
  const drComparison = text.match(/dr\s+\d+.*dr\s+\d+|dr\s+cao.*traffic|dr.*wayback|dr\s+\d+.*traffic/i);
  if (drComparison) {
    breakdown.metrics = 6;
    tokens.push(drComparison[0]);
  } else if (state && state.drValues.length >= 2) {
    breakdown.metrics = 6;
    tokens.push(...state.drValues.map((d) => `DR ${d}`));
  }

  // Require actual selection context, comparison entities, domain hunting, TLD testing, or purchase decision
  if (!breakdown.domainEntities && !breakdown.decisionLanguage && !(breakdown.domainLexical && breakdown.metrics) && !(breakdown.domainLexical && breakdown.domainHistory) && !text.match(/\b(test các đuôi|đuôi nào|phản hồi tốt|\.in|\.me|\.my|\.nl|đối thủ)\b/i)) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens: Array.from(new Set(tokens)), breakdown };
}

function extractIndexingSignals(text: string, state?: SemanticEvidenceState): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  // Bot opening / crawl signals - ensure not negated ("không có lỗi crawl")
  const negCrawl = isConceptNegated(text, ["crawl", "index", "bot", "lỗi crawl", "lỗi index"]);
  const botMatches = !negCrawl.isNegated ? text.match(/\b(mở bot|mở cổng|crawl bot|bật index|mở index|crawl|crawl đều|cắn index|đã cắn index|đã index)\b/gi) : null;
  if (botMatches) {
    breakdown.botActivity = 6;
    tokens.push(...botMatches);
  }

  // Keyword reception status or stuck in low positions (top 30-50, chưa vào top 10/50)
  const keySignalMatches = text.match(/\b(chưa nhận|không nhận|mãi không|vẫn chưa|chưa lên|không lên|không có)\s+(keyword|key word|key|cây|từ khóa|traffic|ranking|từ khóa nào)\b/gi);
  if (keySignalMatches) {
    breakdown.noKeywordEvidence = 8;
    tokens.push(...keySignalMatches);
  } else if (text.includes("chưa nhận key") || text.includes("không nhận key") || text.includes("chưa nhận cây") || text.includes("chưa cắn key") || text.includes("không nhận từ khóa")) {
    breakdown.noKeywordEvidence = 8;
    tokens.push("chưa nhận key");
  }

  // Weak rank with impressions (e.g. "có impression nhưng ranking top 40", "kẹt ở top 30-50", "chưa vào top 50", "lẹt đẹt top 40")
  const weakRankMatches = text.match(/\b(chưa vào top\s*(?:10|20|30|40|50|100)|kẹt ở top\s*(?:10|20|30|40|50|\d{2})|lẹt đẹt top\s*(?:10|20|30|40|50|\d{2})|top\s*(?:30|40|50|\d{2})\b.*\b(?:lẹt đẹt|kẹt))\b/i) ||
    text.match(/\b(có impression|nhận impression|impression tăng)\b.*\b(top\s*(?:30|40|50|\d{2})|thứ hạng thấp|chưa vào top|kẹt ở top|lẹt đẹt)\b/i) ||
    text.match(/\b(top\s*(?:30|40|50|\d{2})|lẹt đẹt)\b.*\b(có impression|nhận impression|đã index|sau \d+ tuần)\b/i);
  if (weakRankMatches) {
    breakdown.weakRankImpression = 9;
    tokens.push(weakRankMatches[0]);
  }

  // Duration indicators
  const durationMatches = text.match(/\b(hai tuần|2 tuần|mười ngày|10 ngày|1 tuần|một tuần|mấy tuần)\b/gi);
  if (durationMatches) {
    breakdown.duration = 3;
    tokens.push(...durationMatches);
  } else if (!breakdown.duration && state && state.durations.length > 0) {
    breakdown.duration = 3;
    tokens.push(...state.durations);
  }

  // Require noKeywordEvidence or botActivity or weakRankImpression
  if (!breakdown.noKeywordEvidence && !breakdown.botActivity && !breakdown.weakRankImpression && !(state && state.indexingSignals.length > 0)) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  if (state && state.indexingSignals.length > 0 && !breakdown.noKeywordEvidence) {
    breakdown.accumulatedIndexing = 5;
    tokens.push(...state.indexingSignals);
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens: Array.from(new Set(tokens)), breakdown };
}

function extractPbnTimingSignals(text: string, state?: SemanticEvidenceState): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  // PBN mention (mandatory for PBN_TIMING)
  const pbnMatches = text.match(/\b(pbn|pi bi en|bi bi en|p b n|site vệ tinh|sai vệ tinh|vệ tinh)\b/gi);
  const timingMatches = text.match(/\b(ngày thứ|thời điểm|khi nào|bao lâu|mấy ngày|tại sao|vì sao|bao giờ|ngày 10|ngày thứ mười|mới bắt đầu|mới đi|mới bắn|triển khai bắn|sau bao lâu|tín hiệu nào|tín hiệu gì|stage nào|mức nào|đạt mức|bật pbn|tăng pbn|vào pbn)\b/gi);

  // Exclude setup/building questions which belong to PROJECT_EXPERIENCE
  if (text.includes("xây dựng hệ thống") || text.includes("triển khai hệ thống")) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const hasPbn = pbnMatches || (state && state.seoEntities.includes("PBN"));
  const hasTiming = timingMatches || (state && state.actionSignals.some((a) => a.includes("đi") || a.includes("bắn")));

  if (!hasPbn || !hasTiming) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  breakdown.pbnTarget = 5;
  if (pbnMatches) tokens.push(...pbnMatches);

  breakdown.timingInquiry = 7;
  if (timingMatches) tokens.push(...timingMatches);

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens: Array.from(new Set(tokens)), breakdown };
}

function extractCoreUpdateSignals(text: string): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  // Negation check: "không có Core Update", "không phải do Core Update", etc.
  const neg = isConceptNegated(text, ["core update", "co update", "thuật toán", "cập nhật thuật toán"]);
  if (neg.isNegated) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const updateMatches = text.match(/\b(core update|co update|co up date|core up date|update của google|thuật toán|google update|helpful content|spam update)\b/gi);
  if (updateMatches) {
    breakdown.updateMention = 7;
    tokens.push(...updateMatches);
  } else {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const impactMatches = text.match(/\b(ảnh hưởng|tụt dốc|tụt traffic|mất traffic|bị phạt|khắc phục|hồi phục|recovery|sau update|giảm|tụt|rơi|sau một đợt|24 giờ đầu|làm gì)\b/gi);
  if (impactMatches) {
    breakdown.impactOrRecovery = 5;
    tokens.push(...impactMatches);
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens, breakdown };
}

function extractGscDropSignals(text: string, state?: SemanticEvidenceState): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  const gscMatches = text.match(/\b(gsc|g s c|gi ét xi|google search console|search console)\b/gi);
  if (gscMatches) {
    breakdown.gscTool = 5;
    tokens.push(...gscMatches);
  } else if (state && state.seoEntities.includes("GSC")) {
    breakdown.gscTool = 5;
    tokens.push("GSC");
  }

  // Explicit drop signals across traffic, ranking, impression, or money pages
  const metricDropMatches = text.match(/\b(traffic|ranking|thứ hạng|impression|click|top|vị trí|money page|money site)\b.*\b(tụt|giảm|drop|mất|rớt|xuống|chìm)\b/gi) ||
    text.match(/\b(tụt|giảm|drop|mất|rớt|xuống)\b.*\b(traffic|ranking|thứ hạng|impression|click|top|money page)\b/gi);
  if (metricDropMatches) {
    breakdown.metricDrop = 7;
    tokens.push(...metricDropMatches);
  } else if (state && (state.percentages.length > 0 || state.positions.length > 0) && (state.rankingSignals.some((r) => r.includes("giảm") || r.includes("tụt")))) {
    breakdown.metricDrop = 7;
    tokens.push("tụt metric");
  }

  // Diagnostic action for ranking drop ("em check gì trước?", "xử lý thế nào khi traffic tụt")
  const diagnosticAction = text.match(/\b(check gì trước|kiểm tra gì trước|em làm gì|check gì|kiểm tra gì)\b/i);
  if (diagnosticAction && (breakdown.metricDrop || breakdown.gscTool || text.includes("tụt") || text.includes("giảm"))) {
    breakdown.dropDiagnosis = 5;
    tokens.push(diagnosticAction[0]);
  }

  if (!breakdown.gscTool && !breakdown.metricDrop && !breakdown.dropDiagnosis) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens, breakdown };
}

function extractNegativeSeoSignals(text: string): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  // Negation check: "không phải negative SEO", "không phải link bẩn"
  const neg = isConceptNegated(text, ["negative seo", "link bẩn", "link xấu", "spam link", "đối thủ chơi xấu"]);
  if (neg.isNegated) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const negativeMatches = text.match(/\b(negative seo|bắn link bẩn|spam link|link bẩn|đối thủ chơi xấu|bị dính link xấu|disavow|bắn link xấu|spam backlink|backlink spam|anchor rác|phân biệt negative seo|hàng chục nghìn backlink)\b/gi);
  if (negativeMatches) {
    breakdown.negativeSeoAttack = 9;
    tokens.push(...negativeMatches);
  } else {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const actionMatches = text.match(/\b(xử lý|khắc phục|chặn|disavow|gỡ link|cứu site|có disavow|disavow ngay|phân biệt)\b/gi);
  if (actionMatches) {
    breakdown.defenseAction = 5;
    tokens.push(...actionMatches);
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens, breakdown };
}

function extractRedirect301Signals(text: string): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  const redirectMatches = text.match(/\b(301|redirect 301|chuyển hướng 301|redirect domain|chuyển domain|redirect|chuyển hướng)\b/gi);
  if (redirectMatches) {
    breakdown.redirectMention = 7;
    tokens.push(...redirectMatches);
  } else {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const juiceMatches = text.match(/\b(giữ link juice|giữ juice|truyền juice|domain cũ|domain mới|chuyển hướng|dựng site riêng|rebuild|về money site)\b/gi);
  if (juiceMatches) {
    breakdown.juicePreservation = 5;
    tokens.push(...juiceMatches);
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens, breakdown };
}

function extractOnpageDiagnosisSignals(text: string): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  // Cannibalization & competing landing pages
  const cannibalizationMatches = text.match(/\b(cannibalization|ăn thịt từ khóa|ăn thịt keyword|cùng rank|cạnh tranh lẫn nhau|trùng lặp intent|nhận nhầm url|2 url cùng|hai landing page|hai bài cùng)\b/gi);
  if (cannibalizationMatches) {
    breakdown.cannibalization = 10;
    tokens.push(...cannibalizationMatches);
  }

  const onpageMatches = text.match(/\b(onpage|on-page|on page|onpage trước|on-page trước)\b/gi);
  if (onpageMatches) {
    breakdown.onpageLexical = 5;
    tokens.push(...onpageMatches);
  }

  const toolCompare = text.match(/\b(check|kiểm tra)\b.+\b(gsc|ahrefs|ah ref|a href|g s c|ai rép)\b.+\b(trước hay|on-page|onpage)\b/gi);
  if (toolCompare) {
    breakdown.diagnosticOrder = 7;
    tokens.push(...toolCompare);
  }

  const technicalElements = text.match(/\b(canonical|làm sai canonical|schema|heading|sitemap|robots\.txt|sapo|meta title|meta description|thay đổi title)\b/gi);
  if (technicalElements) {
    breakdown.technicalAudit = 5;
    tokens.push(...technicalElements);
  }

  if (!breakdown.cannibalization && !breakdown.onpageLexical && !breakdown.diagnosticOrder && !breakdown.technicalAudit) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens, breakdown };
}

function extractProjectExperienceSignals(text: string): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  const expMatches = text.match(/\b(dự án|project|case study|kinh nghiệm)\b.+\b(gần nhất|từng làm|làm là|đã làm|thành công|trực tiếp làm)\b/gi);
  if (expMatches) {
    breakdown.projectExperience = 8;
    tokens.push(...expMatches);
  }

  const nicheMatches = text.match(/\b(làm qua|từng làm|trực tiếp làm)\b.+\b(igaming|casino|betting|crypto|site|dự án)\b/gi);
  if (nicheMatches) {
    breakdown.nicheProject = 7;
    tokens.push(...nicheMatches);
  }

  const satelliteSetupMatches = text.match(/\b(xây dựng|triển khai|setup|set up)\b.+\b(hệ thống|site vệ tinh|sai vệ tinh|vệ tinh)\b.+\b(igaming|casino|betting|mất bao lâu|mất mấy|bao lâu)\b/gi);
  if (satelliteSetupMatches) {
    breakdown.satelliteSystemSetup = 15;
    tokens.push(...satelliteSetupMatches);
  }

  if (!breakdown.projectExperience && !breakdown.nicheProject && !breakdown.satelliteSystemSetup) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens, breakdown };
}

function extractStrategyPlanSignals(text: string, state?: SemanticEvidenceState): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  // New site onboarding / kickoff / audit (RC01 pattern)
  const newSiteKickoff = text.match(/\b(nhận site mới|site mới toanh|site mới hoàn toàn|audit site mới|triển khai từ đầu|30 ngày đầu|trong 30 ngày|lúc nhận site|kế hoạch triển khai|chiến lược tổng thể)\b/gi);
  if (newSiteKickoff) {
    breakdown.newSiteOnboarding = 10;
    tokens.push(...newSiteKickoff);
  }

  // Competitor analysis & tool inspection
  const competitorAnalysis = text.match(/\b(đối thủ vượt|vượt ranking|check ahrefs|phát hiện đối thủ|phân tích đối thủ|soi đối thủ)\b/gi);
  if (competitorAnalysis) {
    breakdown.competitorAnalysis = 8;
    tokens.push(...competitorAnalysis);
  }

  // Ranking maintenance (keeping top rank)
  const rankingMaintenance = text.match(/\b(giữ top|lên top rồi|site đã lên top|duy trì top|duy trì ranking)\b/gi);
  if (rankingMaintenance) {
    breakdown.rankingMaintenance = 8;
    tokens.push(...rankingMaintenance);
  }

  const strategyMatches = text.match(/\b(internal link|internal links|money page|anchor text|an co text|an co teck|an co|anchor brand|anchor|exact match|cấu trúc silo|topic cluster|kế hoạch|chiến lược|tiêu chí chọn site|outreach|en ti ti|entity|gét pót|guest post|content|link nền|referring domain)\b/gi);
  if (strategyMatches) {
    breakdown.strategyConcepts = strategyMatches.length * 4;
    tokens.push(...strategyMatches);
  } else if (state && state.seoEntities.length > 0) {
    breakdown.strategyConcepts = state.seoEntities.length * 3;
    tokens.push(...state.seoEntities);
  }

  const actionMatches = text.match(/\b(đi link|xây dựng link|triển khai link|tối ưu internal link|đẩy link|build en ti ti|build entity|chọn site đi|triển khai|triển khai thế nào|thứ tự triển khai|làm gì từ đầu)\b/gi);
  if (actionMatches) {
    breakdown.linkTactic = 5;
    tokens.push(...actionMatches);
  }

  if (!breakdown.newSiteOnboarding && !breakdown.competitorAnalysis && !breakdown.rankingMaintenance && !breakdown.strategyConcepts && !breakdown.linkTactic) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens, breakdown };
}

// ---------------------------------------------------------------------------
// Weighted Intent Scoring Engine with Question Shape & Precedence
// ---------------------------------------------------------------------------

export function calculateIntentScores(text: string, state?: SemanticEvidenceState): IntentSignalScore[] {
  const lower = text.toLowerCase();
  const scores: IntentSignalScore[] = [];

  // 1. BUDGET_ALLOCATION (Strictly requires monetary amount or explicit budget/ngân sách keywords)
  const moneySig = extractMoneySignals(lower, state);
  const allocSig = extractAllocationSignals(lower, state);
  const seoCatSig = extractSeoCategorySignals(lower, state);

  let budgetTotal = 0;
  const budgetBreakdown: Record<string, number> = {};

  if (moneySig.score > 0) {
    budgetBreakdown.money = moneySig.score;
    budgetTotal += moneySig.score;
    if (allocSig.score > 0) {
      budgetBreakdown.allocation = allocSig.score;
      budgetTotal += allocSig.score;
    }
    if (seoCatSig.score > 0) {
      budgetBreakdown.categories = seoCatSig.score;
      budgetTotal += seoCatSig.score;
    }
    if (moneySig.score >= 5 && allocSig.score >= 4 && seoCatSig.score >= 4) {
      budgetBreakdown.compositeMultiSignal = 8;
      budgetTotal += 8;
    }
  } else if (lower.includes("budget") || lower.includes("ngân sách") || lower.includes("chia tiền")) {
    budgetBreakdown.budgetLexical = 5;
    budgetTotal += 5;
    if (allocSig.score > 0) {
      budgetBreakdown.allocation = allocSig.score;
      budgetTotal += allocSig.score;
    }
    if (seoCatSig.score > 0) {
      budgetBreakdown.categories = seoCatSig.score;
      budgetTotal += seoCatSig.score;
    }
  }

  scores.push({
    category: "BUDGET_ALLOCATION",
    totalScore: budgetTotal,
    signals: budgetBreakdown,
    evidenceTokens: Array.from(new Set([...moneySig.tokens, ...allocSig.tokens, ...seoCatSig.tokens]))
  });

  // 2. DOMAIN_SELECTION
  const domainSig = extractDomainComparisonSignals(lower, state);
  scores.push({
    category: "DOMAIN_SELECTION",
    totalScore: domainSig.score,
    signals: domainSig.breakdown,
    evidenceTokens: Array.from(new Set(domainSig.tokens))
  });

  // 3. NO_KEYWORD_SIGNAL
  const indexSig = extractIndexingSignals(lower, state);
  let noKeyTotal = indexSig.score;
  if (indexSig.breakdown.botActivity && indexSig.breakdown.noKeywordEvidence) {
    noKeyTotal += 5;
    indexSig.breakdown.compositeBotAndNoKey = 5;
  }
  scores.push({
    category: "NO_KEYWORD_SIGNAL",
    totalScore: noKeyTotal,
    signals: indexSig.breakdown,
    evidenceTokens: Array.from(new Set(indexSig.tokens))
  });

  // 4. PBN_TIMING
  const pbnTimingSig = extractPbnTimingSignals(lower, state);
  let pbnTimingTotal = pbnTimingSig.score;
  if (pbnTimingSig.breakdown.pbnTarget && pbnTimingSig.breakdown.timingInquiry) {
    pbnTimingTotal += 5;
    pbnTimingSig.breakdown.compositePbnTiming = 5;
  }
  scores.push({
    category: "PBN_TIMING",
    totalScore: pbnTimingTotal,
    signals: pbnTimingSig.breakdown,
    evidenceTokens: Array.from(new Set(pbnTimingSig.tokens))
  });

  // 5. CORE_UPDATE_RECOVERY
  const coreUpdateSig = extractCoreUpdateSignals(lower);
  scores.push({
    category: "CORE_UPDATE_RECOVERY",
    totalScore: coreUpdateSig.score,
    signals: coreUpdateSig.breakdown,
    evidenceTokens: Array.from(new Set(coreUpdateSig.tokens))
  });

  // 6. GSC_RANKING_DROP
  const gscSig = extractGscDropSignals(lower, state);
  scores.push({
    category: "GSC_RANKING_DROP",
    totalScore: gscSig.score,
    signals: gscSig.breakdown,
    evidenceTokens: Array.from(new Set(gscSig.tokens))
  });

  // 7. NEGATIVE_SEO
  const negSeoSig = extractNegativeSeoSignals(lower);
  scores.push({
    category: "NEGATIVE_SEO",
    totalScore: negSeoSig.score,
    signals: negSeoSig.breakdown,
    evidenceTokens: Array.from(new Set(negSeoSig.tokens))
  });

  // 8. REDIRECT_301
  const redirectSig = extractRedirect301Signals(lower);
  scores.push({
    category: "REDIRECT_301",
    totalScore: redirectSig.score,
    signals: redirectSig.breakdown,
    evidenceTokens: Array.from(new Set(redirectSig.tokens))
  });

  // 9. ONPAGE_DIAGNOSIS
  const onpageSig = extractOnpageDiagnosisSignals(lower);
  scores.push({
    category: "ONPAGE_DIAGNOSIS",
    totalScore: onpageSig.score,
    signals: onpageSig.breakdown,
    evidenceTokens: Array.from(new Set(onpageSig.tokens))
  });

  // 10. PROJECT_EXPERIENCE
  const projExpSig = extractProjectExperienceSignals(lower);
  scores.push({
    category: "PROJECT_EXPERIENCE",
    totalScore: projExpSig.score,
    signals: projExpSig.breakdown,
    evidenceTokens: Array.from(new Set(projExpSig.tokens))
  });

  // 11. STRATEGY_PLAN (Fallback / Generic tactical intent)
  const stratSig = extractStrategyPlanSignals(lower, state);
  scores.push({
    category: "STRATEGY_PLAN",
    totalScore: stratSig.score,
    signals: stratSig.breakdown,
    evidenceTokens: Array.from(new Set(stratSig.tokens))
  });

  // Sort descending by total score
  scores.sort((a, b) => b.totalScore - a.totalScore);
  return scores;
}

/**
 * Formats development diagnostic logging for multi-signal intent scores.
 */
function logIntentDiagnostic(question: string, scores: IntentSignalScore[], selected: QuestionIntentCategory, confidence: number): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
    return;
  }

  const lines = ["[INTENT SCORE]", `question: ${question}`];
  for (const s of scores.slice(0, 3)) {
    if (s.totalScore > 0) {
      lines.push(`${s.category}:`);
      for (const [key, val] of Object.entries(s.signals)) {
        lines.push(`  ${key}: ${val}`);
      }
      lines.push(`  total: ${s.totalScore}`);
    }
  }
  lines.push(`selected: ${selected}`);
  lines.push(`confidence: ${confidence.toFixed(2)}`);

  console.log(lines.join("\n"));
}

/**
 * Robust Multi-Signal Semantic Intent Classifier.
 * Understands interviewer questions from multi-signal evidence even when STT transcription is noisy.
 * Supports classification from either raw text or accumulated SemanticEvidenceState.
 */
export function classifyQuestionIntent(
  semanticInput: string | SemanticEvidenceState,
  rawTranscript?: string,
  accumulatedState?: SemanticEvidenceState
): QuestionIntent {
  let text = "";
  let state = accumulatedState;

  if (typeof semanticInput === "object" && semanticInput !== null) {
    state = semanticInput;
    text = (state.latestTranscript || rawTranscript || "").trim();
  } else {
    text = (semanticInput || rawTranscript || "").trim();
  }

  if (!text && (!state || state.rawPartials.length === 0)) {
    return {
      category: "UNKNOWN",
      confidence: 0,
      normalizedQuestion: "",
      evidence: [],
      rawTranscript
    };
  }

  const scores = calculateIntentScores(text, state);
  let topCandidate = scores[0];

  // Specific intents beat generic STRATEGY_PLAN when their specific evidence is present
  if (topCandidate && topCandidate.category === "STRATEGY_PLAN") {
    const specificCandidate = scores.find(
      (s) =>
        s.category !== "STRATEGY_PLAN" &&
        (s.totalScore >= 7 ||
          (s.category === "BUDGET_ALLOCATION" && (s.signals.money !== undefined || s.signals.budgetLexical !== undefined || s.signals.anchorAllocation !== undefined)) ||
          (s.category === "PBN_TIMING" && s.signals.pbnTarget !== undefined && s.signals.timingInquiry !== undefined) ||
          (s.category === "ONPAGE_DIAGNOSIS" && s.signals.cannibalization !== undefined) ||
          (s.category === "NO_KEYWORD_SIGNAL" && (s.signals.weakRankImpression !== undefined || s.signals.noKeywordEvidence !== undefined)) ||
          (s.category === "GSC_RANKING_DROP" && s.signals.metricDrop !== undefined))
    );
    if (specificCandidate && specificCandidate.totalScore >= 5) {
      topCandidate = specificCandidate;
    }
  }

  // Precedence: NO_KEYWORD_SIGNAL beats general ONPAGE_DIAGNOSIS when weak rank/indexing is primary and cannibalization is not present
  if (topCandidate && topCandidate.category === "ONPAGE_DIAGNOSIS") {
    const indexingCandidate = scores.find(
      (s) => s.category === "NO_KEYWORD_SIGNAL" && (s.signals.weakRankImpression !== undefined || s.signals.noKeywordEvidence !== undefined)
    );
    if (indexingCandidate && !topCandidate.signals.cannibalization) {
      topCandidate = indexingCandidate;
    }
  }

  // Precedence: NEGATIVE_SEO beats GSC_RANKING_DROP when spam attack evidence is present
  if (topCandidate && topCandidate.category === "GSC_RANKING_DROP") {
    const negCandidate = scores.find(
      (s) => s.category === "NEGATIVE_SEO" && s.signals.negativeSeoAttack !== undefined
    );
    if (negCandidate) {
      topCandidate = negCandidate;
    }
  }

  // If DOMAIN_SELECTION has explicit purchase/hunting decision language, it beats historical metric drops
  if (topCandidate && topCandidate.category === "GSC_RANKING_DROP") {
    const domainCandidate = scores.find(
      (s) => s.category === "DOMAIN_SELECTION" && s.signals.decisionLanguage !== undefined && s.signals.metrics !== undefined
    );
    if (domainCandidate) {
      topCandidate = domainCandidate;
    }
  }

  // If GSC_RANKING_DROP or ONPAGE_DIAGNOSIS has strong score, it beats false DOMAIN_SELECTION triggered by tools
  if (topCandidate && topCandidate.category === "DOMAIN_SELECTION") {
    const dropCandidate = scores.find((s) => s.category === "GSC_RANKING_DROP" && s.totalScore >= 7 && !topCandidate.signals.decisionLanguage);
    const onpageCandidate = scores.find((s) => s.category === "ONPAGE_DIAGNOSIS" && s.totalScore >= 7 && !topCandidate.signals.decisionLanguage);
    if (dropCandidate) {
      topCandidate = dropCandidate;
    } else if (onpageCandidate) {
      topCandidate = onpageCandidate;
    }
  }

  if (topCandidate && topCandidate.totalScore >= 4) {
    let confidence = 0.88;
    if (topCandidate.totalScore >= 12) {
      confidence = 0.96;
    } else if (topCandidate.totalScore >= 8) {
      confidence = 0.93;
    } else if (topCandidate.totalScore >= 5) {
      // Single isolated signal without multi-signal composite
      confidence = topCandidate.signals.compositeMultiSignal ? 0.90 : 0.75;
    }

    logIntentDiagnostic(text, scores, topCandidate.category, confidence);

    return {
      category: topCandidate.category,
      confidence,
      normalizedQuestion: text,
      evidence: topCandidate.evidenceTokens.length > 0 ? topCandidate.evidenceTokens : [topCandidate.category],
      rawTranscript,
      scores
    };
  }

  // Moderate score fallback (score >= 3)
  if (topCandidate && topCandidate.totalScore >= 3) {
    const confidence = 0.70;
    logIntentDiagnostic(text, scores, topCandidate.category, confidence);
    return {
      category: topCandidate.category,
      confidence,
      normalizedQuestion: text,
      evidence: topCandidate.evidenceTokens,
      rawTranscript,
      scores
    };
  }

  // Chatter / Unrelated / Below threshold -> UNKNOWN
  logIntentDiagnostic(text, scores, "UNKNOWN", 0.2);
  return {
    category: "UNKNOWN",
    confidence: 0.2,
    normalizedQuestion: text,
    evidence: [],
    rawTranscript,
    scores
  };
}
