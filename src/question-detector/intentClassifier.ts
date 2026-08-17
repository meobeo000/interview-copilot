import type { SemanticEvidenceState } from "./semanticEvidence";

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

  // Strictly require domain evaluation context (not general anchor link context)
  const hasDomainContext =
    text.match(/\b(expired domain|tên miền|con a|con b|site a|site b|domain a|domain b|tld|\.in|\.me|\.my|\.nl|\.co\.in|có mua không|có lấy không|chọn con nào|lấy không|dr cao|organic traffic|traffic = 0|traffic bằng 0|traffic không|traffic thật|wayback|a href|ah ref|ai rép|ahrefs|đối thủ)\b/i) ||
    (text.match(/\bdomain\b/i) && !text.match(/\breferring domain\b/i)) ||
    (state && (state.drValues.length > 0 || state.comparisonSignals.length > 0));

  if (!hasDomainContext) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  // Domain identifiers
  const domainMatches =
    text.match(/\b(expired domain|tên miền|con domain|tld|\.in|\.me|\.my|\.nl|\.co\.in)\b/gi) ||
    (text.match(/\bdomain\b/i) && !text.match(/\breferring domain\b/i) ? ["domain"] : null);
  if (domainMatches) {
    breakdown.domainLexical = 4;
    tokens.push(...domainMatches);
  }

  // Domain comparison entities (con A, con B, domain A, domain B, site A, site B)
  const comparisonMatches = text.match(/\b(con a|con b|domain a|domain b|site a|site b)\b/gi);
  if (comparisonMatches) {
    breakdown.domainEntities = 6;
    tokens.push(...comparisonMatches);
  } else if (state && state.comparisonSignals.length > 0) {
    breakdown.domainEntities = 6;
    tokens.push(...state.comparisonSignals);
  }

  // Domain metrics & tools (DR, UR, organic traffic, Wayback, ahrefs competitor domain check)
  const metricMatches = text.match(/\b(dr \d+|dr cao|ur \d+|ur|organic traffic|traffic bằng 0|traffic = 0|traffic không|traffic thật|wayback|a href|ah ref|ai rép|ahrefs|referring domain|backlink profile|đối thủ)\b/gi);
  if (metricMatches) {
    breakdown.metrics = metricMatches.length * 3;
    tokens.push(...metricMatches);
  } else if (state && state.drValues.length > 0) {
    breakdown.metrics = state.drValues.length * 3;
    tokens.push(...state.drValues.map((d) => `DR ${d}`));
  }

  // Domain decision language
  const decisionMatches = text.match(/\b(chọn con nào|lấy không|có lấy không|có mua không|nên mua|lấy con nào|chọn domain nào|check referring domain|backlink profile của đối thủ)\b/gi);
  if (decisionMatches) {
    breakdown.decisionLanguage = 4;
    tokens.push(...decisionMatches);
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens: Array.from(new Set(tokens)), breakdown };
}

function extractIndexingSignals(text: string, state?: SemanticEvidenceState): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  // Bot opening / crawl signals
  const botMatches = text.match(/\b(mở bot|mở cổng|crawl bot|bật index|mở index|crawl)\b/gi);
  if (botMatches) {
    breakdown.botActivity = 5;
    tokens.push(...botMatches);
  }

  // Keyword reception status
  const keySignalMatches = text.match(/\b(chưa nhận|không nhận|mãi không|vẫn chưa|chưa lên|không lên|không có)\s+(keyword|key word|key|cây|từ khóa|traffic|ranking)\b/gi);
  if (keySignalMatches) {
    breakdown.noKeywordEvidence = 7;
    tokens.push(...keySignalMatches);
  } else if (text.includes("chưa nhận key") || text.includes("không nhận key") || text.includes("chưa nhận cây") || text.includes("chưa cắn key")) {
    breakdown.noKeywordEvidence = 7;
    tokens.push("chưa nhận key");
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

  // Require noKeywordEvidence or botActivity
  if (!breakdown.noKeywordEvidence && !breakdown.botActivity && !(state && state.indexingSignals.length > 0)) {
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
  const timingMatches = text.match(/\b(ngày thứ|thời điểm|khi nào|bao lâu|mấy ngày|tại sao|vì sao|bao giờ|ngày 10|ngày thứ mười|mới bắt đầu|mới đi|mới bắn|triển khai bắn|sau bao lâu)\b/gi);

  // Exclude setup/building questions which belong to PROJECT_EXPERIENCE
  if (text.includes("xây dựng hệ thống") || text.includes("triển khai hệ thống")) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const hasPbn = pbnMatches || (state && state.seoEntities.includes("PBN"));
  const hasTiming = timingMatches || (state && state.actionSignals.some((a) => a.includes("đi") || a.includes("bắn")));

  if (!hasPbn || !hasTiming) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  breakdown.pbnTarget = 4;
  if (pbnMatches) tokens.push(...pbnMatches);

  breakdown.timingInquiry = 6;
  if (timingMatches) tokens.push(...timingMatches);

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens: Array.from(new Set(tokens)), breakdown };
}

function extractCoreUpdateSignals(text: string): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  const updateMatches = text.match(/\b(core update|co update|co up date|core up date|update của google|thuật toán|google update|helpful content|spam update)\b/gi);
  if (updateMatches) {
    breakdown.updateMention = 7;
    tokens.push(...updateMatches);
  } else {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const impactMatches = text.match(/\b(ảnh hưởng|tụt dốc|tụt traffic|mất traffic|bị phạt|khắc phục|hồi phục|recovery|sau update)\b/gi);
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

  const metricDropMatches = text.match(/\b(impression|click|thứ hạng|ranking|ctr|average position|vị trí)\b.+\b(tụt|giảm|drop|mất|rớt)\b/gi);
  if (metricDropMatches) {
    breakdown.metricDrop = 6;
    tokens.push(...metricDropMatches);
  } else if (text.match(/\b(tụt|giảm|drop|mất|rớt)\b.+\b(impression|click|traffic|ranking)\b/gi)) {
    breakdown.metricDrop = 6;
    tokens.push("tụt metric");
  } else if (state && (state.percentages.length > 0 || state.positions.length > 0) && (state.rankingSignals.some((r) => r.includes("giảm") || r.includes("tụt")))) {
    breakdown.metricDrop = 6;
    tokens.push("tụt metric");
  }

  if (!breakdown.gscTool && !breakdown.metricDrop) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens, breakdown };
}

function extractNegativeSeoSignals(text: string): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  const negativeMatches = text.match(/\b(negative seo|bắn link bẩn|spam link|link bẩn|đối thủ chơi xấu|bị dính link xấu|disavow|bắn link xấu|spam backlink|anchor rác)\b/gi);
  if (negativeMatches) {
    breakdown.negativeSeoAttack = 7;
    tokens.push(...negativeMatches);
  } else {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const actionMatches = text.match(/\b(xử lý|khắc phục|chặn|disavow|gỡ link|cứu site)\b/gi);
  if (actionMatches) {
    breakdown.defenseAction = 4;
    tokens.push(...actionMatches);
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens, breakdown };
}

function extractRedirect301Signals(text: string): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  const redirectMatches = text.match(/\b(301|redirect 301|chuyển hướng 301|redirect domain|chuyển domain|redirect)\b/gi);
  if (redirectMatches) {
    breakdown.redirectMention = 7;
    tokens.push(...redirectMatches);
  } else {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const juiceMatches = text.match(/\b(giữ link juice|giữ juice|truyền juice|domain cũ|domain mới|chuyển hướng)\b/gi);
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

  const technicalElements = text.match(/\b(canonical|làm sai canonical|schema|heading|sitemap|robots\.txt|sapo|meta title|meta description)\b/gi);
  if (technicalElements) {
    breakdown.technicalAudit = 5;
    tokens.push(...technicalElements);
  }

  if (!breakdown.onpageLexical && !breakdown.diagnosticOrder && !breakdown.technicalAudit) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens, breakdown };
}

function extractProjectExperienceSignals(text: string): SignalExtractionResult {
  const breakdown: Record<string, number> = {};
  const tokens: string[] = [];

  const expMatches = text.match(/\b(dự án|project|case study|kinh nghiệm)\b.+\b(gần nhất|từng làm|làm là|đã làm|thành công)\b/gi);
  if (expMatches) {
    breakdown.projectExperience = 8;
    tokens.push(...expMatches);
  }

  const nicheMatches = text.match(/\b(làm qua|từng làm)\b.+\b(igaming|casino|betting|crypto|site|dự án)\b/gi);
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

  const strategyMatches = text.match(/\b(internal link|internal links|money page|anchor text|an co text|an co teck|cấu trúc silo|topic cluster|kế hoạch|chiến lược|tiêu chí chọn site|outreach|en ti ti|entity|gét pót|guest post|referring domain|content)\b/gi);
  if (strategyMatches) {
    breakdown.strategyConcepts = strategyMatches.length * 4;
    tokens.push(...strategyMatches);
  } else if (state && state.seoEntities.length > 0) {
    breakdown.strategyConcepts = state.seoEntities.length * 3;
    tokens.push(...state.seoEntities);
  }

  const actionMatches = text.match(/\b(đi link|xây dựng link|triển khai link|tối ưu internal link|đẩy link|build en ti ti|build entity|chọn site đi|triển khai|triển khai thế nào)\b/gi);
  if (actionMatches) {
    breakdown.linkTactic = 5;
    tokens.push(...actionMatches);
  }

  if (!breakdown.strategyConcepts && !breakdown.linkTactic) {
    return { score: 0, tokens: [], breakdown: {} };
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, tokens, breakdown };
}

// ---------------------------------------------------------------------------
// Weighted Intent Scoring Engine
// ---------------------------------------------------------------------------

export function calculateIntentScores(text: string, state?: SemanticEvidenceState): IntentSignalScore[] {
  const lower = text.toLowerCase();
  const scores: IntentSignalScore[] = [];

  // 1. BUDGET_ALLOCATION
  // STRICT RULE: Requires monetary amount or explicit budget/ngân sách keyword
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
    // Composite multi-signal boost: Money + Allocation + SEO categories
    if (moneySig.score >= 4 && allocSig.score >= 4) {
      budgetBreakdown.compositeMultiSignal = 8;
      budgetTotal += 8;
    }
  } else if (lower.includes("budget") || lower.includes("ngân sách")) {
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
        (s.totalScore >= 10 ||
          (s.category === "BUDGET_ALLOCATION" && (s.signals.money !== undefined || s.signals.budgetLexical !== undefined)))
    );
    if (specificCandidate && specificCandidate.totalScore >= 6) {
      topCandidate = specificCandidate;
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
