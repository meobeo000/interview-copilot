import type { SuggestedAnswer } from "../shared/types";
import type { AnswerContract } from "./answerContract";

export type FactProvenance =
  | "INTERVIEWER_FACT"
  | "RESUME_FACT"
  | "PRACTITIONER_DOCUMENT"
  | "GENERAL_KNOWLEDGE"
  | "INFERENCE"
  | "UNSUPPORTED_CANDIDATE_CLAIM";

export interface ProvenanceFact {
  factText: string;
  provenance: FactProvenance;
  sourceIdentifier?: string;
  isVerified: boolean;
  confidence: number;
}

export type AnswerActionModifier =
  | "SHORTER"
  | "MORE_TECHNICAL"
  | "EXPLAIN_WHY"
  | "GIVE_EXAMPLE"
  | "DEFEND_ANSWER"
  | "REGENERATE";

export interface FactSafetyValidationResult {
  isSafe: boolean;
  provenanceBreakdown: ProvenanceFact[];
  unsupportedClaims: string[];
  recommendation?: string;
}

/**
 * Validates that an answer contains zero unsupported candidate claims
 * and respects strict candidate profile grounding.
 */
export function validateFactSafety(
  answer: SuggestedAnswer,
  contract: AnswerContract
): FactSafetyValidationResult {
  const breakdown: ProvenanceFact[] = [];
  const unsupported: string[] = [];

  const textToScan = [answer.openingLine, ...answer.bullets].join(" ");

  // 1. Check if candidate experience is forbidden but answer makes personal claims
  const makesPersonalClaims = /\b(em từng|em đã từng|dự án của em|kinh nghiệm của em|em đạt được|em kéo traffic|em quản lý)\b/i.test(textToScan);
  if (!contract.candidateExperience.allowed && makesPersonalClaims) {
    unsupported.push("Fabricated candidate personal experience when profile contains zero verified projects");
    breakdown.push({
      factText: "Personal experience claim without verified project backing",
      provenance: "UNSUPPORTED_CANDIDATE_CLAIM",
      isVerified: false,
      confidence: 0
    });
  }

  // 2. Classify grounded facts from contract
  for (const fact of contract.groundedFacts) {
    breakdown.push({
      factText: fact.value,
      provenance: fact.sourceType === "candidate_profile" ? "RESUME_FACT" : "PRACTITIONER_DOCUMENT",
      sourceIdentifier: fact.sourceId,
      isVerified: true,
      confidence: fact.confidence
    });
  }

  // 3. Classify interviewer facts from contract
  for (const reqFact of contract.requiredFacts) {
    breakdown.push({
      factText: reqFact,
      provenance: "INTERVIEWER_FACT",
      isVerified: true,
      confidence: 1.0
    });
  }

  const isSafe = unsupported.length === 0;
  return {
    isSafe,
    provenanceBreakdown: breakdown,
    unsupportedClaims: unsupported,
    recommendation: isSafe ? undefined : "Recommend verification instead of asserting unverified personal metrics"
  };
}

/**
 * Modifies an existing answer snapshot according to user HUD actions
 * while staying strictly attached to the current immutable turn.
 */
export function applyAnswerAction(
  existingAnswer: SuggestedAnswer,
  action: AnswerActionModifier
): SuggestedAnswer {
  if (!existingAnswer) {
    return { openingLine: "", bullets: [], keywords: [] };
  }

  switch (action) {
    case "SHORTER": {
      const shorterOpening = existingAnswer.openingLine
        ? existingAnswer.openingLine.split(/(?<=[.?!])\s+/)[0]
        : existingAnswer.openingLine;
      const shorterBullets = existingAnswer.bullets.slice(0, 2).map((b) => {
        const sentences = b.split(/(?<=[.?!])\s+/);
        return sentences[0] || b;
      });
      return {
        ...existingAnswer,
        openingLine: shorterOpening,
        bullets: shorterBullets
      };
    }

    case "MORE_TECHNICAL": {
      const technicalBullets = existingAnswer.bullets.map((b, idx) => {
        if (idx === 0) return `${b} (Kiểm tra HTTP Status 200/301, Server Log Googlebot IP và Response Header).`;
        if (idx === 1) return `${b} (Phân tích Canonical Tag trong HTML head, X-Robots-Tag và sitemap XML).`;
        return b;
      });
      return {
        ...existingAnswer,
        openingLine: existingAnswer.openingLine
          ? `Về mặt kỹ thuật chuyên sâu: ${existingAnswer.openingLine}`
          : existingAnswer.openingLine,
        bullets: technicalBullets,
        keywords: Array.from(new Set([...existingAnswer.keywords, "Technical SEO", "Server Logs"]))
      };
    }

    case "EXPLAIN_WHY": {
      const explainedBullets = existingAnswer.bullets.map((b) => {
        return `${b} — Nguyên nhân cốt lõi do thuật toán đánh giá tín hiệu chất lượng và tránh rủi ro thao túng link graph.`;
      });
      return {
        ...existingAnswer,
        openingLine: `Lý do và nguyên lý giải thích: ${existingAnswer.openingLine}`,
        bullets: explainedBullets
      };
    }

    case "GIVE_EXAMPLE": {
      const exampleBullet = "Ví dụ thực tế: Khi triển khai site vệ tinh tầng 1, bắn 5 link context anchor thương hiệu sau khi GSC ghi nhận impression ngày thứ 10.";
      return {
        ...existingAnswer,
        bullets: [...existingAnswer.bullets.slice(0, 2), exampleBullet]
      };
    }

    case "DEFEND_ANSWER": {
      const defenseBullet = "Phản biện dự phòng: Nếu người phỏng vấn hỏi về phương án thay thế, giải thích rõ đánh đổi giữa tốc độ index vs rủi ro thuật toán.";
      return {
        ...existingAnswer,
        bullets: [...existingAnswer.bullets, defenseBullet]
      };
    }

    case "REGENERATE":
    default:
      return { ...existingAnswer };
  }
}
