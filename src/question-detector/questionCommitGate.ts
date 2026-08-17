import { normalizeSemanticText, hasUnicodePhrase } from "../shared/semanticTextMatcher";
import type { QuestionIntent } from "./intentClassifier";
import type { SemanticEvidenceState } from "./semanticEvidence";

export type CommitDecision = "COMMIT" | "HOLD_FRAGMENT" | "DROP";

export interface CommitGateEvaluation {
  decision: CommitDecision;
  isCompleteQuestion: boolean;
  reason: string;
  confidence: number;
}

export class QuestionCommitGate {
  /**
   * Evaluates whether a transcript is a complete question ready for immediate commit
   * or an incomplete speech fragment that should be held for continuation.
   */
  static evaluate(
    transcript: string,
    state?: SemanticEvidenceState,
    intent?: QuestionIntent
  ): CommitGateEvaluation {
    void state;
    void intent;
    const text = normalizeSemanticText(transcript);
    const lower = text.toLowerCase();

    if (!text || text.length === 0) {
      return {
        decision: "DROP",
        isCompleteQuestion: false,
        reason: "Empty transcript.",
        confidence: 1.0
      };
    }

    // 1. Valid short questions (e.g. "Tại sao?", "Vì sao?", "Sao?", "Thế nào?")
    const validShortQuestions = [
      "tại sao",
      "tại sao?",
      "vì sao",
      "vì sao?",
      "thế nào",
      "thế nào?",
      "như thế nào",
      "như thế nào?",
      "sao",
      "sao?",
      "là sao",
      "là sao?",
      "tại sao lại như vậy",
      "tại sao lại như vậy?",
      "chọn con nào",
      "chọn con nào?",
      "em chọn con nào",
      "em chọn con nào?"
    ];

    if (validShortQuestions.includes(lower)) {
      return {
        decision: "COMMIT",
        isCompleteQuestion: true,
        reason: "Valid concise interrogative question.",
        confidence: 0.98
      };
    }

    // 2. Fragment Dangling Endings / Prefixes Check
    const danglingPrefixes = [
      "dựa trên",
      "dựa vào",
      "trong trường hợp",
      "và sau đó",
      "còn phần",
      "và tín hiệu",
      "với trường hợp",
      "đối với"
    ];

    const interrogativeMarkers = [
      "tại sao",
      "vì sao",
      "thế nào",
      "như thế nào",
      "làm gì",
      "cái gì",
      "khi nào",
      "bao nhiêu",
      "chọn con nào",
      "chọn domain nào",
      "chọn cái nào",
      "chọn",
      "check gì",
      "kiểm tra gì",
      "xử lý như thế nào",
      "xử lý sao",
      "phân bổ như thế nào",
      "chia như thế nào",
      "chia thế nào",
      "theo thứ tự nào",
      "bước tiếp theo",
      "dựa vào tín hiệu nào",
      "dựa vào đâu",
      "đọc dữ liệu này như thế nào",
      "đọc dữ liệu này ra sao",
      "phân biệt thế nào",
      "có disavow ngay không",
      "disavow ngay không",
      "có nên",
      "có được không",
      "phải không",
      "đúng không",
      "ngay không",
      "được không",
      "hay không",
      "sao"
    ];

    const actionRequestMarkers = [
      "em nói cho anh",
      "em nói",
      "em giải thích",
      "em phân tích",
      "em xử lý",
      "em kiểm tra",
      "em làm gì",
      "em chọn",
      "em ưu tiên",
      "anh giao cho em",
      "hướng xử lý"
    ];

    const hasInterrogative =
      interrogativeMarkers.some((m) => hasUnicodePhrase(lower, m) || lower.includes(m)) ||
      Boolean(lower.match(/(?:^|\s)(ngay không|được không|phải không|đúng không|hay không|nhỉ|hả)(?:\s|$|[.,?!])/i));
    const hasActionRequest = actionRequestMarkers.some((m) => hasUnicodePhrase(lower, m) || lower.includes(m));
    const hasQuestionMark = text.endsWith("?");
    const isConditionalQuestion = lower.includes("nếu") && lower.includes("thì") && (hasInterrogative || hasActionRequest || hasQuestionMark);

    // Check if transcript starts with a dangling prefix and has NO interrogative or action request
    const startsWithDangling = danglingPrefixes.some((p) => lower.startsWith(p));
    if (startsWithDangling && !hasInterrogative && !hasActionRequest && !hasQuestionMark) {
      return {
        decision: "HOLD_FRAGMENT",
        isCompleteQuestion: false,
        reason: `Utterance starts with dangling prefix without question predicate: "${text}"`,
        confidence: 0.95
      };
    }

    // Isolated noun phrase fragments (e.g. "site bắt đầu", "referring domain", "với PBN")
    const isolatedNounPhrases = [
      "site bắt đầu",
      "referring domain",
      "với pbn",
      "với guest post",
      "tín hiệu trust tốt",
      "backlink không mất"
    ];
    if (isolatedNounPhrases.some((p) => lower === p) && !hasInterrogative && !hasActionRequest) {
      return {
        decision: "HOLD_FRAGMENT",
        isCompleteQuestion: false,
        reason: `Isolated noun phrase fragment: "${text}"`,
        confidence: 0.92
      };
    }

    // 3. Complete Question Validation
    if (hasInterrogative || hasActionRequest || hasQuestionMark || isConditionalQuestion) {
      return {
        decision: "COMMIT",
        isCompleteQuestion: true,
        reason: "Contains valid question/action syntax and predicate.",
        confidence: 0.95
      };
    }

    // Incomplete fragment fallback: Declarative statements without question predicates are held
    return {
      decision: "HOLD_FRAGMENT",
      isCompleteQuestion: false,
      reason: `Incomplete phrase lacking question predicate: "${text}"`,
      confidence: 0.88
    };
  }
}
