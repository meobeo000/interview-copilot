import { isConceptNegated, normalizeSemanticText, hasUnicodePhrase } from "../shared/semanticTextMatcher";

export interface ScenarioConstraint {
  key: keyof ScenarioConstraintsData;
  value: boolean | number | string;
  sourceSnippet: string;
  confidence: number;
}

export interface ScenarioConstraintsData {
  indexingIssue?: boolean;
  crawlIssue?: boolean;
  canonicalIssue?: boolean;
  manualAction?: boolean;
  coreUpdateOccurred?: boolean;
  referringDomainLoss?: boolean;
  negativeSeo?: boolean;
  trafficDrop?: boolean;
  trafficChangePercent?: number;
  ctrDrop?: boolean;
  positionDrop?: boolean;
}

export interface ScenarioConstraints extends ScenarioConstraintsData {
  provenance: ScenarioConstraint[];
}

/**
 * Deterministically extracts scenario constraints and ruled-out conditions
 * from interviewer question text.
 */
export function extractScenarioConstraints(text: string): ScenarioConstraints {
  const norm = normalizeSemanticText(text).toLowerCase();
  const provenance: ScenarioConstraint[] = [];
  const constraints: ScenarioConstraintsData = {};

  // 1. Core Update Constraints
  const coreUpdateKeywords = ["core update", "thuật toán core", "cập nhật thuật toán", "đợt update", "co update"];
  if (coreUpdateKeywords.some((kw) => norm.includes(kw))) {
    const neg = isConceptNegated(norm, coreUpdateKeywords);
    if (neg.isNegated) {
      constraints.coreUpdateOccurred = false;
      provenance.push({
        key: "coreUpdateOccurred",
        value: false,
        sourceSnippet: neg.snippet || "không có core update",
        confidence: 0.95
      });
    } else if (norm.includes("sau core update") || norm.includes("dính core update") || norm.includes("sau đợt core update") || norm.includes("sau một đợt core update")) {
      constraints.coreUpdateOccurred = true;
      provenance.push({
        key: "coreUpdateOccurred",
        value: true,
        sourceSnippet: "sau core update",
        confidence: 0.95
      });
    }
  }

  // 2. Referring Domain / Backlink Loss Constraints
  const backlinkLossKeywords = ["referring domain", "backlink", "link"];
  if (backlinkLossKeywords.some((kw) => norm.includes(kw))) {
    const negLoss =
      isConceptNegated(norm, ["referring domain không", "referring domain vẫn", "backlink không", "link không"]) ||
      hasUnicodePhrase(norm, "referring domain không thay đổi") ||
      hasUnicodePhrase(norm, "referring domain không mất") ||
      hasUnicodePhrase(norm, "referring domain vẫn giữ") ||
      hasUnicodePhrase(norm, "backlink không mất") ||
      hasUnicodePhrase(norm, "link không mất");

    if (negLoss) {
      constraints.referringDomainLoss = false;
      provenance.push({
        key: "referringDomainLoss",
        value: false,
        sourceSnippet: "referring domain không mất / không thay đổi",
        confidence: 0.95
      });
    } else if (hasUnicodePhrase(norm, "mất referring domain") || hasUnicodePhrase(norm, "tụt backlink") || hasUnicodePhrase(norm, "mất backlink")) {
      constraints.referringDomainLoss = true;
      provenance.push({
        key: "referringDomainLoss",
        value: true,
        sourceSnippet: "mất backlink / referring domain",
        confidence: 0.90
      });
    }
  }

  // 3. Manual Action Constraints
  if (norm.includes("manual action") || norm.includes("tác vụ thủ công") || norm.includes("phạt thủ công")) {
    const negManual =
      hasUnicodePhrase(norm, "không có manual action") ||
      hasUnicodePhrase(norm, "không bị manual action") ||
      hasUnicodePhrase(norm, "không có tác vụ thủ công") ||
      isConceptNegated(norm, ["manual action", "tác vụ thủ công"]);

    if (negManual) {
      constraints.manualAction = false;
      provenance.push({
        key: "manualAction",
        value: false,
        sourceSnippet: "không có manual action",
        confidence: 0.98
      });
    } else if (hasUnicodePhrase(norm, "bị manual action") || hasUnicodePhrase(norm, "dính manual action")) {
      constraints.manualAction = true;
      provenance.push({
        key: "manualAction",
        value: true,
        sourceSnippet: "bị manual action",
        confidence: 0.98
      });
    }
  }

  // 4. Indexing & Crawl Issues
  const hasCompoundIndexCrawl =
    hasUnicodePhrase(norm, "không có lỗi index hay crawl") ||
    hasUnicodePhrase(norm, "không có lỗi index và crawl") ||
    hasUnicodePhrase(norm, "không có lỗi index hoặc crawl") ||
    hasUnicodePhrase(norm, "indexing và crawl đều bình thường") ||
    hasUnicodePhrase(norm, "indexing và crawl bình thường");

  if (hasCompoundIndexCrawl) {
    constraints.indexingIssue = false;
    constraints.crawlIssue = false;
    provenance.push({
      key: "indexingIssue",
      value: false,
      sourceSnippet: "indexing và crawl bình thường / không có lỗi",
      confidence: 0.98
    });
    provenance.push({
      key: "crawlIssue",
      value: false,
      sourceSnippet: "indexing và crawl bình thường / không có lỗi",
      confidence: 0.98
    });
  } else {
    if (norm.includes("index") || norm.includes("indexing")) {
      const negIndex =
        hasUnicodePhrase(norm, "không có lỗi index") ||
        hasUnicodePhrase(norm, "indexing vẫn bình thường") ||
        hasUnicodePhrase(norm, "indexing bình thường") ||
        hasUnicodePhrase(norm, "index bình thường") ||
        hasUnicodePhrase(norm, "không lỗi index") ||
        hasUnicodePhrase(norm, "indexing không có vấn đề") ||
        isConceptNegated(norm, ["index", "indexing"]).isNegated;

      if (negIndex) {
        constraints.indexingIssue = false;
        provenance.push({
          key: "indexingIssue",
          value: false,
          sourceSnippet: "indexing bình thường / không có lỗi",
          confidence: 0.95
        });
      }
    }

    if (norm.includes("crawl")) {
      const negCrawl =
        hasUnicodePhrase(norm, "không có lỗi crawl") ||
        hasUnicodePhrase(norm, "crawl vẫn bình thường") ||
        hasUnicodePhrase(norm, "crawl bình thường") ||
        hasUnicodePhrase(norm, "crawl đều bình thường") ||
        hasUnicodePhrase(norm, "không lỗi crawl") ||
        isConceptNegated(norm, ["crawl"]).isNegated;

      if (negCrawl) {
        constraints.crawlIssue = false;
        provenance.push({
          key: "crawlIssue",
          value: false,
          sourceSnippet: "crawl bình thường / không có lỗi",
          confidence: 0.95
        });
      }
    }
  }

  // 5. Canonical Issues
  if (norm.includes("canonical")) {
    const negCanonical =
      hasUnicodePhrase(norm, "canonical vẫn bình thường") ||
      hasUnicodePhrase(norm, "canonical không có vấn đề") ||
      hasUnicodePhrase(norm, "canonical bình thường") ||
      hasUnicodePhrase(norm, "không có lỗi canonical");

    if (negCanonical) {
      constraints.canonicalIssue = false;
      provenance.push({
        key: "canonicalIssue",
        value: false,
        sourceSnippet: "canonical bình thường",
        confidence: 0.95
      });
    }
  }

  // 6. Negative SEO Constraints
  if (norm.includes("negative seo") || norm.includes("link bẩn") || norm.includes("bắn link spam")) {
    const negSeo =
      hasUnicodePhrase(norm, "không phải negative seo") ||
      hasUnicodePhrase(norm, "không phải do negative seo") ||
      hasUnicodePhrase(norm, "loại trừ negative seo") ||
      isConceptNegated(norm, ["negative seo"]);

    if (negSeo) {
      constraints.negativeSeo = false;
      provenance.push({
        key: "negativeSeo",
        value: false,
        sourceSnippet: "không phải negative SEO",
        confidence: 0.95
      });
    }
  }

  // 7. Metrics Drops (Traffic, CTR, Position)
  const trafficDropMatch = norm.match(/traffic\s*(?:giảm|tụt|rơi)\s*(?:khoảng|tầm)?\s*(\d+)\s*%/i);
  if (trafficDropMatch) {
    constraints.trafficDrop = true;
    const pct = parseInt(trafficDropMatch[1], 10);
    constraints.trafficChangePercent = -pct;
    provenance.push({
      key: "trafficDrop",
      value: true,
      sourceSnippet: `traffic giảm ${pct}%`,
      confidence: 0.95
    });
  } else if (hasUnicodePhrase(norm, "traffic giảm") || hasUnicodePhrase(norm, "traffic tụt") || hasUnicodePhrase(norm, "organic traffic giảm")) {
    constraints.trafficDrop = true;
    provenance.push({
      key: "trafficDrop",
      value: true,
      sourceSnippet: "traffic giảm",
      confidence: 0.90
    });
  }

  if (hasUnicodePhrase(norm, "ctr giảm") || hasUnicodePhrase(norm, "ctr tụt") || hasUnicodePhrase(norm, "ctr giảm mạnh")) {
    constraints.ctrDrop = true;
    provenance.push({
      key: "ctrDrop",
      value: true,
      sourceSnippet: "CTR giảm",
      confidence: 0.92
    });
  }

  if (hasUnicodePhrase(norm, "tụt xuống") || hasUnicodePhrase(norm, "vị trí tụt") || hasUnicodePhrase(norm, "tụt vị trí") || norm.match(/từ\s*top\s*\d+\s*tụt\s*xuống/i)) {
    constraints.positionDrop = true;
    provenance.push({
      key: "positionDrop",
      value: true,
      sourceSnippet: "tụt vị trí",
      confidence: 0.92
    });
  }

  return {
    ...constraints,
    provenance
  };
}
