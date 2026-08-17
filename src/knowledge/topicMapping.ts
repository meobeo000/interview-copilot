import type { QuestionIntentCategory } from "../question-detector/intentClassifier";
import type { KnowledgeTopic } from "./types";

export interface IntentTopicMapping {
  primaryTopics: KnowledgeTopic[];
  secondaryTopics: KnowledgeTopic[];
}

export const INTENT_TO_TOPICS_MAP: Record<QuestionIntentCategory, IntentTopicMapping> = {
  BUDGET_ALLOCATION: {
    primaryTopics: ["BUDGET"],
    secondaryTopics: ["CONTENT", "ENTITY", "GUEST_POST", "PBN", "BACKLINK_FOUNDATION"]
  },
  PBN_TIMING: {
    primaryTopics: ["PBN_TIMING"],
    secondaryTopics: ["PBN", "INDEXING"]
  },
  DOMAIN_SELECTION: {
    primaryTopics: ["DOMAIN_SELECTION"],
    secondaryTopics: ["EXPIRED_DOMAIN", "REFERRING_DOMAIN", "ANCHOR_TEXT", "TLD_TESTING"]
  },
  NO_KEYWORD_SIGNAL: {
    primaryTopics: ["NO_KEYWORD_SIGNAL"],
    secondaryTopics: ["INDEXING", "ONPAGE", "INTERNAL_LINK", "TECHNICAL_SEO", "DOMAIN_SELECTION"]
  },
  CORE_UPDATE_RECOVERY: {
    primaryTopics: ["CORE_UPDATE"],
    secondaryTopics: ["GSC", "TECHNICAL_SEO", "CONTENT"]
  },
  NEGATIVE_SEO: {
    primaryTopics: ["NEGATIVE_SEO"],
    secondaryTopics: ["REFERRING_DOMAIN", "ANCHOR_TEXT"]
  },
  REDIRECT_301: {
    primaryTopics: ["REDIRECT_301"],
    secondaryTopics: ["DOMAIN_SELECTION"]
  },
  ONPAGE_DIAGNOSIS: {
    primaryTopics: ["ONPAGE"],
    secondaryTopics: ["TECHNICAL_SEO", "INTERNAL_LINK", "GSC"]
  },
  GSC_RANKING_DROP: {
    primaryTopics: ["GSC"],
    secondaryTopics: ["CORE_UPDATE", "ONPAGE", "NEGATIVE_SEO"]
  },
  PROJECT_EXPERIENCE: {
    primaryTopics: ["PROJECT_EXPERIENCE"],
    secondaryTopics: ["GENERAL"]
  },
  STRATEGY_PLAN: {
    primaryTopics: ["BACKLINK_FOUNDATION"],
    secondaryTopics: ["ENTITY", "GUEST_POST", "PBN", "INTERNAL_LINK", "ANCHOR_TEXT"]
  },
  UNKNOWN: {
    primaryTopics: ["GENERAL"],
    secondaryTopics: []
  }
};

/**
 * Resolves priority KnowledgeTopics from intent category.
 */
export function getTopicsForIntent(category?: string): IntentTopicMapping {
  if (!category) {
    return INTENT_TO_TOPICS_MAP.UNKNOWN;
  }
  return INTENT_TO_TOPICS_MAP[category as QuestionIntentCategory] || INTENT_TO_TOPICS_MAP.UNKNOWN;
}
