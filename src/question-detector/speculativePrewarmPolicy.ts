import type { QuestionIntentCategory } from "./intentClassifier";
import type { SemanticEvidenceState } from "./semanticEvidence";
import { isSpeculativeEnabled } from "./speculativeConfig";

export interface PrewarmPolicyConfig {
  minConfidence: number;
  minWordCount: number;
  minEvidenceCount: number;
  enabled: boolean;
}

export const DEFAULT_PREWARM_POLICY_CONFIG: PrewarmPolicyConfig = {
  minConfidence: 0.88,
  minWordCount: 4,
  minEvidenceCount: 1,
  enabled: true
};

export interface PrewarmEligibilityResult {
  eligible: boolean;
  intent: QuestionIntentCategory;
  confidence: number;
  reason: string;
}

export class SpeculativePrewarmPolicy {
  private config: PrewarmPolicyConfig;

  constructor(customConfig?: Partial<PrewarmPolicyConfig>) {
    this.config = {
      ...DEFAULT_PREWARM_POLICY_CONFIG,
      ...customConfig
    };
  }

  /**
   * Evaluates if current SemanticEvidenceState is sufficiently confident and safe to prewarm Gemini in background.
   */
  evaluate(state: SemanticEvidenceState): PrewarmEligibilityResult {
    // 1. Feature flag check
    if (!isSpeculativeEnabled()) {
      return {
        eligible: false,
        intent: state.bestIntent,
        confidence: state.confidence,
        reason: "Speculative prewarm is disabled by feature flag."
      };
    }

    // 2. Reject UNKNOWN intents
    if (state.bestIntent === "UNKNOWN") {
      return {
        eligible: false,
        intent: "UNKNOWN",
        confidence: state.confidence,
        reason: "Intent is UNKNOWN."
      };
    }

    // 3. Confidence threshold
    if (state.confidence < this.config.minConfidence) {
      return {
        eligible: false,
        intent: state.bestIntent,
        confidence: state.confidence,
        reason: `Confidence (${state.confidence.toFixed(2)}) is below threshold (${this.config.minConfidence}).`
      };
    }

    // 4. Minimum word count to avoid trigger on single isolated fragment
    const words = state.latestTranscript.trim().split(/\s+/).filter(Boolean);
    if (words.length < this.config.minWordCount) {
      return {
        eligible: false,
        intent: state.bestIntent,
        confidence: state.confidence,
        reason: `Word count (${words.length}) is below minimum (${this.config.minWordCount}).`
      };
    }

    // 5. Background conversational chatter filter
    const chatterMatch = state.latestTranscript.match(
      /^(alo|alo em|chờ anh|anh mở cv|ừ|ok|tiếp nhé|đợi anh|nghe rõ không|test mic)/i
    );
    if (chatterMatch && words.length < 7) {
      return {
        eligible: false,
        intent: state.bestIntent,
        confidence: state.confidence,
        reason: "Transcript matches conversational chatter."
      };
    }

    // 6. Specific Semantic Evidence Verification
    const hasEvidence = this.hasCategorySpecificEvidence(state);
    if (!hasEvidence) {
      return {
        eligible: false,
        intent: state.bestIntent,
        confidence: state.confidence,
        reason: "Insufficient structured semantic evidence for category."
      };
    }

    return {
      eligible: true,
      intent: state.bestIntent,
      confidence: state.confidence,
      reason: `Eligible for prewarm with confidence ${state.confidence.toFixed(2)} and structured evidence.`
    };
  }

  private hasCategorySpecificEvidence(state: SemanticEvidenceState): boolean {
    switch (state.bestIntent) {
      case "BUDGET_ALLOCATION":
        return (
          state.moneyAmounts.length > 0 ||
          state.allocationSignals.length > 0 ||
          state.latestTranscript.toLowerCase().includes("budget") ||
          state.latestTranscript.toLowerCase().includes("ngân sách")
        );

      case "DOMAIN_SELECTION":
        return (
          state.drValues.length > 0 ||
          state.comparisonSignals.length > 0 ||
          state.latestTranscript.toLowerCase().includes("domain") ||
          state.latestTranscript.toLowerCase().includes("tên miền") ||
          state.latestTranscript.toLowerCase().includes("traffic")
        );

      case "NO_KEYWORD_SIGNAL":
        return (
          state.indexingSignals.length > 0 ||
          state.durations.length > 0 ||
          state.latestTranscript.toLowerCase().includes("mở bot") ||
          state.latestTranscript.toLowerCase().includes("chưa nhận")
        );

      case "GSC_RANKING_DROP":
        return (
          state.seoEntities.includes("GSC") ||
          state.percentages.length > 0 ||
          state.positions.length > 0 ||
          state.rankingSignals.length > 0
        );

      case "PBN_TIMING":
        return (
          state.seoEntities.includes("PBN") ||
          state.latestTranscript.toLowerCase().includes("pbn") ||
          state.latestTranscript.toLowerCase().includes("vệ tinh")
        );

      default:
        // Other specific SEO categories or STRATEGY_PLAN require at least 1 SEO entity or action signal
        return state.seoEntities.length > 0 || state.actionSignals.length > 0;
    }
  }
}
