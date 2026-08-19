import type { QuestionIntent, QuestionIntentCategory } from "../question-detector/intentClassifier";
import type { QuestionShape, QuestionShapeResult } from "../question-detector/questionShapeClassifier";
import type { ResolvedFollowUpContext } from "../question-detector/interviewTurnContext";
import type { ScenarioConstraints } from "../question-detector/scenarioConstraints";
import { hasUnicodePhrase } from "../shared/semanticTextMatcher";
import {
  type PractitionerPlaybookEntry,
  type PractitionerInterviewReference,
  SEEDED_PRACTITIONER_REFERENCES
} from "./practitionerInterviewReference";

export interface PractitionerReferenceRetrievalOptions {
  question: string;
  intent?: QuestionIntent | QuestionIntentCategory | string;
  questionShape?: QuestionShape | QuestionShapeResult;
  entities?: string[];
  followUpContext?: ResolvedFollowUpContext;
  scenarioConstraints?: ScenarioConstraints;
  numericFacts?: string[];
  maxReferences?: number;
}

export interface PractitionerReferenceRetrievalResult {
  references: PractitionerPlaybookEntry[];
  selectedCount: number;
  totalEvaluated: number;
  retrievalElapsedMs: number;
}

/**
 * Minimum score required for reference injection.
 * Qualified semantic inquiry triggers score >= 15.
 * Weak or incidental substring matches score 0 and are excluded.
 */
const MIN_RELEVANCE_THRESHOLD = 8;

export class PractitionerReferenceRetriever {
  private references: PractitionerPlaybookEntry[];

  constructor(references: PractitionerInterviewReference[] = SEEDED_PRACTITIONER_REFERENCES) {
    this.references = [...references];
  }

  retrieve(options: PractitionerReferenceRetrievalOptions): PractitionerReferenceRetrievalResult {
    const startedAt = performance.now();
    const maxRefs = Math.min(3, Math.max(1, options.maxReferences ?? 2));

    const rawQuestion = options.question || "";
    const questionLower = rawQuestion.toLowerCase();

    // Extract Intent Category
    let intentCategory: QuestionIntentCategory | undefined;
    if (typeof options.intent === "string") {
      intentCategory = options.intent as QuestionIntentCategory;
    } else if (options.intent && typeof options.intent === "object" && "category" in options.intent) {
      intentCategory = options.intent.category;
    }

    // Follow-up context inheritance
    const followUp = options.followUpContext;
    if (followUp && followUp.contextResolved) {
      if (!intentCategory && followUp.inheritedIntent) {
        intentCategory = followUp.inheritedIntent;
      }
    }

    // Extract Primary Question Shape
    let primaryShape: QuestionShape | undefined;
    if (typeof options.questionShape === "string") {
      primaryShape = options.questionShape as QuestionShape;
    } else if (options.questionShape && typeof options.questionShape === "object" && "primaryShape" in options.questionShape) {
      primaryShape = options.questionShape.primaryShape;
    }

    // Gather search text including follow-up context
    const fullSearchText = [
      questionLower,
      followUp?.previousQuestion?.toLowerCase() || "",
      followUp?.resolvedMeaning?.toLowerCase() || "",
      followUp?.targetEntity?.toLowerCase() || "",
      ...(options.entities || []).map((e) => e.toLowerCase()),
      ...(options.numericFacts || []).map((f) => f.toLowerCase())
    ].join(" ");

    const scored: Array<{ ref: PractitionerPlaybookEntry; score: number; priorityTier: number }> = [];

    // Semantic cue check functions using Unicode-safe boundary matching
    const isDomainHuntingInquiry = (): boolean => {
      if (intentCategory === "DOMAIN_SELECTION") return true;

      // Follow-up in domain context
      if (
        followUp?.contextResolved &&
        (followUp.inheritedIntent === "DOMAIN_SELECTION" ||
          followUp.inheritedEntities?.some(
            (e) =>
              hasUnicodePhrase(e, ".in") ||
              hasUnicodePhrase(e, ".me") ||
              hasUnicodePhrase(e, ".my") ||
              hasUnicodePhrase(e, "domain a") ||
              hasUnicodePhrase(e, "domain b") ||
              hasUnicodePhrase(e, "con a") ||
              hasUnicodePhrase(e, "con b")
          ))
      ) {
        return true;
      }

      // Explicit domain hunting / expired / selection / TLD cues with Unicode boundaries
      const domainCues = [
        "expired domain",
        "domain cũ",
        "tên miền cũ",
        "săn domain",
        "săn tên miền",
        "mua domain",
        "đánh giá domain",
        "so sánh domain",
        "chọn domain",
        "chọn con nào",
        "domain a",
        "domain b",
        "con a",
        "con b",
        "wayback",
        "wayback machine",
        "tld testing",
        "thử nghiệm tld",
        "đuôi tên miền",
        "đuôi domain",
        ".in",
        ".me",
        ".my",
        ".nl",
        ".co.in",
        "domain dự phòng",
        "domain nhận 301",
        "chọn domain dự phòng",
        "chuẩn bị domain để 301",
        "chuẩn bị domain cho 301",
        "domain để 301",
        "domain 301"
      ];
      return domainCues.some((cue) => hasUnicodePhrase(fullSearchText, cue));
    };

    const isTldTestingInquiry = (): boolean => {
      const tldCues = [
        "tld testing",
        "thử nghiệm tld",
        "test .in",
        "test .me",
        "đuôi tên miền",
        "đuôi domain",
        ".in",
        ".me",
        ".my",
        ".nl",
        ".co.in"
      ];
      return tldCues.some((cue) => hasUnicodePhrase(fullSearchText, cue));
    };

    const isPbnTimingInquiry = (): boolean => {
      if (intentCategory === "PBN_TIMING") return true;
      if (followUp?.contextResolved && followUp.inheritedIntent === "PBN_TIMING") return true;

      const pbnTimingCues = [
        "ngày 10",
        "ngày thứ 10",
        "day 10",
        "10 ngày",
        "thời điểm đi pbn",
        "khi nào đi pbn",
        "khi nào bắn pbn",
        "thời điểm bắn pbn",
        "pbn timing",
        "bắt đầu pbn",
        "pbn sau bao lâu",
        "đi pbn chưa",
        "bắn pbn chưa",
        "có nên đi pbn",
        "triển khai pbn"
      ];
      return pbnTimingCues.some((cue) => hasUnicodePhrase(fullSearchText, cue));
    };

    const isNoKeywordInquiry = (): boolean => {
      if (intentCategory === "NO_KEYWORD_SIGNAL") return true;
      if (followUp?.contextResolved && followUp.inheritedIntent === "NO_KEYWORD_SIGNAL") return true;

      const noKeyCues = [
        "chưa nhận key",
        "không nhận key",
        "chưa nhận keyword",
        "không nhận keyword",
        "chưa có impression",
        "không có impression",
        "2 tuần chưa nhận",
        "hai tuần chưa nhận",
        "2 tuần không có impression",
        "mở bot không nhận",
        "mở bot chưa nhận",
        "không cắn key",
        "chưa cắn key",
        "không lên key"
      ];
      return noKeyCues.some((cue) => hasUnicodePhrase(fullSearchText, cue));
    };

    const isRedirect301Inquiry = (): boolean => {
      if (intentCategory === "REDIRECT_301") return true;
      if (followUp?.contextResolved && followUp.inheritedIntent === "REDIRECT_301") return true;

      const r301Cues = [
        "redirect 301",
        "quyết định 301",
        "khi nào 301",
        "chuẩn bị 301",
        "duy trì top",
        "top maintenance",
        "giữ top",
        "chuẩn bị domain 301",
        "backup domain cho 301",
        "chuyển hướng 301",
        "domain để 301",
        "map url",
        "sau khi 301"
      ];
      return r301Cues.some((cue) => hasUnicodePhrase(fullSearchText, cue));
    };

    const isProjectInitialExecutionInquiry = (): boolean => {
      if (intentCategory === "BUDGET_ALLOCATION") {
        return (
          hasUnicodePhrase(fullSearchText, "20 triệu") ||
          hasUnicodePhrase(fullSearchText, "20m") ||
          hasUnicodePhrase(fullSearchText, "25 triệu") ||
          hasUnicodePhrase(fullSearchText, "25m") ||
          hasUnicodePhrase(fullSearchText, "50 triệu") ||
          hasUnicodePhrase(fullSearchText, "ngân sách") ||
          hasUnicodePhrase(fullSearchText, "budget") ||
          hasUnicodePhrase(fullSearchText, "khởi điểm") ||
          hasUnicodePhrase(fullSearchText, "site mới")
        );
      }
      const initialCues = [
        "ngân sách khởi điểm",
        "chia ngân sách",
        "phân bổ ngân sách",
        "quy trình nhận site mới",
        "kickoff site mới",
        "tháng đầu triển khai site mới",
        "site mới triển khai",
        "site betting mới hoàn toàn"
      ];
      return initialCues.some((cue) => hasUnicodePhrase(fullSearchText, cue));
    };

    const isPbnInfrastructureInquiry = (): boolean => {
      const pbnInfraCues = [
        "footprint",
        "hệ thống pbn",
        "dựng pbn",
        "tách footprint",
        "ip class c",
        "dải ip"
      ];
      return pbnInfraCues.some((cue) => hasUnicodePhrase(fullSearchText, cue));
    };

    const isNegativeSeoInquiry = (): boolean => {
      if (intentCategory === "NEGATIVE_SEO") return true;
      if (followUp?.contextResolved && followUp.inheritedIntent === "NEGATIVE_SEO") return true;

      const negSeoCues = [
        "negative seo",
        "link bẩn",
        "spam link",
        "bắn link bẩn",
        "bắn link spam",
        "anchor cờ bạc đen",
        "bị đối thủ bắn",
        "disavow"
      ];
      return negSeoCues.some((cue) => hasUnicodePhrase(fullSearchText, cue));
    };

    for (const ref of this.references) {
      let score = 0;
      let priorityTier = 10; // lower number = higher execution priority

      switch (ref.id) {
        case "ref:domain-hunting-evaluation":
          if (isDomainHuntingInquiry()) {
            score = 15;
            if (intentCategory === "DOMAIN_SELECTION") score += 5;
            priorityTier = 1;
          }
          break;

        case "ref:tld-testing-experimentation":
          if (isTldTestingInquiry()) {
            score = 15;
            if (intentCategory === "DOMAIN_SELECTION") score += 5;
            priorityTier = 1;
          }
          break;

        case "ref:no-keyword-signal-troubleshooting":
          if (isNoKeywordInquiry()) {
            score = 15;
            if (intentCategory === "NO_KEYWORD_SIGNAL") score += 5;
            priorityTier = 1; // Diagnosis before link escalation
          }
          break;

        case "ref:new-site-pbn-timing":
          if (isPbnTimingInquiry()) {
            score = 15;
            if (intentCategory === "PBN_TIMING") score += 5;
            priorityTier = 2; // Link escalation after diagnosis
          }
          break;

        case "ref:ranking-maintenance-301":
          if (isRedirect301Inquiry()) {
            score = 15;
            if (intentCategory === "REDIRECT_301") score += 5;
            priorityTier = 1;
          }
          break;

        case "ref:301-redirect-contingency":
          if (isRedirect301Inquiry()) {
            score = 15;
            if (intentCategory === "REDIRECT_301") score += 5;
            priorityTier = 1;
          }
          break;

        case "ref:project-initial-execution":
          if (isProjectInitialExecutionInquiry()) {
            score = 15;
            if (intentCategory === "BUDGET_ALLOCATION") score += 5;
            priorityTier = 2;
          }
          break;

        case "ref:initial-budget-allocation":
          if (intentCategory === "BUDGET_ALLOCATION" && isProjectInitialExecutionInquiry()) {
            score = 15;
            priorityTier = 2;
          }
          break;

        case "ref:pbn-infrastructure-footprint":
          if (isPbnInfrastructureInquiry()) {
            score = 15;
            priorityTier = 2;
          }
          break;

        case "ref:negative-seo-defense":
          if (isNegativeSeoInquiry()) {
            score = 15;
            if (intentCategory === "NEGATIVE_SEO") score += 5;
            priorityTier = 1;
          }
          break;
      }

      // Interviewer pattern alignment boost (+3)
      if (score > 0 && ref.interviewerPatterns) {
        for (const pattern of ref.interviewerPatterns) {
          if (hasUnicodePhrase(fullSearchText, pattern.toLowerCase())) {
            score += 3;
            break;
          }
        }
      }

      // Applicable entity matches if score already started
      if (score > 0 && ref.applicableEntities) {
        for (const ent of ref.applicableEntities) {
          if (hasUnicodePhrase(fullSearchText, ent)) {
            score += 2;
          }
        }
      }

      // Shape alignment bonus if score already qualified
      if (score > 0 && primaryShape && ref.questionShapes && ref.questionShapes.includes(primaryShape)) {
        score += 2;
      }

      // Include only if meeting strict confidence threshold
      if (score >= MIN_RELEVANCE_THRESHOLD) {
        scored.push({ ref, score, priorityTier });
      }
    }

    // Deterministic sort:
    // 1. Priority Tier ascending (e.g. diagnosis precedes link building)
    // 2. Score descending
    // 3. Stable alphabetical ID
    scored.sort((a, b) => {
      if (a.priorityTier !== b.priorityTier) {
        return a.priorityTier - b.priorityTier;
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.ref.id.localeCompare(b.ref.id);
    });

    const selectedRefs = scored.slice(0, maxRefs).map((s) => s.ref);
    const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;

    return {
      references: selectedRefs,
      selectedCount: selectedRefs.length,
      totalEvaluated: this.references.length,
      retrievalElapsedMs: elapsedMs
    };
  }
}

let defaultPractitionerRetriever: PractitionerReferenceRetriever | undefined;

export function getPractitionerReferenceRetriever(): PractitionerReferenceRetriever {
  if (!defaultPractitionerRetriever) {
    defaultPractitionerRetriever = new PractitionerReferenceRetriever();
  }
  return defaultPractitionerRetriever;
}
