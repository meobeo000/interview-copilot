import type { QuestionIntent, QuestionIntentCategory } from "../question-detector/intentClassifier";
import type { QuestionShape, QuestionShapeResult } from "../question-detector/questionShapeClassifier";
import type { ResolvedFollowUpContext } from "../question-detector/interviewTurnContext";
import type { ScenarioConstraints } from "../question-detector/scenarioConstraints";
import {
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
  references: PractitionerInterviewReference[];
  selectedCount: number;
  totalEvaluated: number;
  retrievalElapsedMs: number;
}

export class PractitionerReferenceRetriever {
  private references: PractitionerInterviewReference[];

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

    const scored: Array<{ ref: PractitionerInterviewReference; score: number }> = [];

    for (const ref of this.references) {
      let score = 0;

      // 1. Intent Alignment (+6 points)
      if (intentCategory && ref.intents && ref.intents.includes(intentCategory)) {
        score += 6;
      }

      // 2. Question Shape Alignment (+3 points)
      if (primaryShape && ref.questionShapes && ref.questionShapes.includes(primaryShape)) {
        score += 3;
      }

      // 3. Applicable Entities / Keyword Matches (+3 to +5 points each)
      if (ref.applicableEntities) {
        for (const ent of ref.applicableEntities) {
          const entLower = ent.toLowerCase();
          if (fullSearchText.includes(entLower)) {
            // High-precision entity boost
            if (entLower.startsWith(".") || entLower === "wayback" || entLower === "pbn" || entLower === "301" || entLower === "disavow" || entLower === "sapo") {
              score += 5;
            } else {
              score += 3;
            }
          }
        }
      }

      // 4. Topic-specific strong cues
      switch (ref.id) {
        case "ref:domain-hunting-evaluation":
          if (
            intentCategory === "DOMAIN_SELECTION" ||
            fullSearchText.includes("domain") ||
            fullSearchText.includes("tên miền") ||
            fullSearchText.includes("expired") ||
            fullSearchText.includes(".in") ||
            fullSearchText.includes(".me") ||
            fullSearchText.includes(".my") ||
            fullSearchText.includes(".nl") ||
            fullSearchText.includes(".co.in") ||
            fullSearchText.includes("wayback") ||
            fullSearchText.includes("tld")
          ) {
            score += 10;
          }
          break;

        case "ref:new-site-pbn-timing":
          if (
            intentCategory === "PBN_TIMING" ||
            fullSearchText.includes("ngày 10") ||
            fullSearchText.includes("day 10") ||
            (fullSearchText.includes("pbn") && (fullSearchText.includes("thời điểm") || fullSearchText.includes("khi nào") || fullSearchText.includes("bắt đầu")))
          ) {
            score += 10;
          }
          break;

        case "ref:no-keyword-signal-troubleshooting":
          if (
            intentCategory === "NO_KEYWORD_SIGNAL" ||
            fullSearchText.includes("không nhận key") ||
            fullSearchText.includes("chưa nhận key") ||
            fullSearchText.includes("không có impression") ||
            fullSearchText.includes("2 tuần") ||
            fullSearchText.includes("hai tuần") ||
            (fullSearchText.includes("mở bot") && fullSearchText.includes("key"))
          ) {
            score += 10;
          }
          break;

        case "ref:ranking-maintenance-301":
          if (
            intentCategory === "REDIRECT_301" ||
            fullSearchText.includes("301") ||
            fullSearchText.includes("redirect 301") ||
            (fullSearchText.includes("đang top") && fullSearchText.includes("chuẩn bị domain")) ||
            fullSearchText.includes("duy trì top")
          ) {
            score += 10;
          }
          break;

        case "ref:project-initial-execution":
          if (
            (intentCategory === "BUDGET_ALLOCATION" || intentCategory === "STRATEGY_PLAN") &&
            (fullSearchText.includes("20 triệu") || fullSearchText.includes("20m") || fullSearchText.includes("khởi điểm") || fullSearchText.includes("site mới"))
          ) {
            score += 8;
          }
          break;

        case "ref:negative-seo-defense":
          if (
            intentCategory === "NEGATIVE_SEO" ||
            fullSearchText.includes("negative seo") ||
            fullSearchText.includes("link bẩn") ||
            fullSearchText.includes("disavow")
          ) {
            score += 10;
          }
          break;
      }

      // Only include scored items
      if (score > 0) {
        scored.push({ ref, score });
      }
    }

    // Deterministic sort: highest score first, then stable alphabetical ID
    scored.sort((a, b) => {
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
