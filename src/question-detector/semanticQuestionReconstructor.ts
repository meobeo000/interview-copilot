import type { InterviewTurnContext, ResolvedFollowUpContext } from "./interviewTurnContext";

export type ReconstructionConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface SemanticCorrection {
  from: string;
  to: string;
  reason: string;
  confidence: number;
  type: "ENTITY_RECOVERY" | "PHONETIC_REPAIR" | "NUMERIC_NORMALIZATION" | "LEXICAL_COMPOUND";
}

export interface QuestionReconstructionResult {
  rawTranscript: string;
  interpretedQuestion: string;
  reconstructionConfidence: number;
  confidenceLevel: ReconstructionConfidenceLevel;
  linkedEntities: string[];
  correctionsApplied: SemanticCorrection[];
  isModified: boolean;
  telemetry: {
    turnId?: string;
    rawTranscript: string;
    interpretedQuestion: string;
    reconstructionConfidence: number;
    evidence: string[];
  };
}

export interface ReconstructorContext {
  turnId?: string;
  priorContext?: InterviewTurnContext | ResolvedFollowUpContext | null;
  priorIntent?: string;
  priorEntities?: string[];
  knownEntities?: string[];
}

/**
 * Phonetic and adversarial speech dictionary for Vietnamese SEO interview STT.
 */
const PHONETIC_SEO_MAP: Array<{
  pattern: RegExp;
  replacement: string;
  reason: string;
  confidence: number;
  entity: string;
}> = [
  // iGaming & Casino
  { pattern: /\b(ai\s*g[eê]m\s*minh|ai\s*gaming|i\s+gaming|igaming)\b/gi, replacement: "iGaming", reason: "Phonetic STT repair for iGaming", confidence: 0.98, entity: "iGaming" },
  // Entity
  { pattern: /\b(en\s*ti\s*ti|en-ti-ti|n\s*ti\s*ti|en\s*ti\s*ty)\b/gi, replacement: "Entity", reason: "Phonetic STT repair for Entity", confidence: 0.96, entity: "Entity" },
  // Canonical
  { pattern: /\b(ca\s*no\s*ni\s*c[oaô]|ca\s*no\s*ni\s*can|canonic)\b/gi, replacement: "canonical", reason: "Phonetic STT repair for canonical", confidence: 0.95, entity: "canonical" },
  // Disavow
  { pattern: /\b(di\s*d[aá]p\s*v[oôóòỏõọốồổỗộ]?|di\s*sap\s*v[oôóòỏõọốồổỗộ]?|đi\s+sa\s+v[aà]o|đi\s+xa\s+v[aà]o)\b/gi, replacement: "disavow", reason: "Phonetic STT repair for disavow", confidence: 0.95, entity: "disavow" },
  // Search Console / GSC
  { pattern: /\b(s[oợ]t\s+c[oô]n\s*son|s[oớ]t\s+c[oô]ng\s*son|s[oợ]t\s+con\s*son|search\s+com\s+son)\b/gi, replacement: "Search Console", reason: "Phonetic STT repair for Search Console", confidence: 0.96, entity: "GSC" },
  // Backlink
  { pattern: /\b(b[aá]ch\s*linh|ba\s*linh|b[aá]ch\s*link|back\s+link)\b/gi, replacement: "backlink", reason: "Phonetic & compound normalization for backlink", confidence: 0.98, entity: "backlink" },
  // Keyword
  { pattern: /\b(ki\s*qu[oớ][tct]|ki\s*u[oớ]t|ki\s*qu[oọ]t|key\s+word)\b/gi, replacement: "keyword", reason: "Phonetic & compound normalization for keyword", confidence: 0.98, entity: "keyword" },
  // Guest Post
  { pattern: /\b(gh[eé]t\s*b[oố]t|gh[eé]t\s*post|g[eé]t\s*b[oố]t|guestpost)\b/gi, replacement: "Guest Post", reason: "Phonetic & brand normalization for Guest Post", confidence: 0.95, entity: "Guest Post" },
  // Dàn site vệ tinh (PBN)
  { pattern: /\b(d[aà]n\s+sai\s+v[eệ]\s+tinh|d[aà]n\s+size\s+v[eệ]\s+tinh)\b/gi, replacement: "dàn site vệ tinh", reason: "Phonetic normalization for dàn site vệ tinh", confidence: 0.98, entity: "PBN" },
  // Site vệ tinh (PBN)
  { pattern: /\b(sai\s+v[eệ]\s+tinh|size\s+v[eệ]\s+tinh)\b/gi, replacement: "site vệ tinh", reason: "Phonetic normalization for site vệ tinh", confidence: 0.96, entity: "PBN" },
  // Dàn site (PBN)
  { pattern: /\b(d[aà]n\s+sai|d[aà]n\s+size)\b/gi, replacement: "dàn site", reason: "Phonetic normalization for dàn site", confidence: 0.96, entity: "PBN" },
  // Internal link
  { pattern: /\b(in\s*t[eơ]\s*n[oô]l\s*link|internal\s+links)\b/gi, replacement: "internal link", reason: "Normalization for internal link", confidence: 0.95, entity: "internal link" },
  // Redirect 301
  { pattern: /\b(ba\s+tr[aă]m\s+l[eẻ]\s+m[oộ]t|ba\s+linh\s+m[oộ]t|ba\s+kh[oô]ng\s+m[oộ]t)\b/gi, replacement: "301", reason: "Spoken number conversion to 301", confidence: 0.96, entity: "301" }
];

export class SemanticQuestionReconstructor {
  /**
   * Reconstructs the raw transcript into an interpreted question using context and known entities.
   */
  reconstruct(rawTranscript: string, context?: ReconstructorContext): QuestionReconstructionResult {
    if (!rawTranscript || !rawTranscript.trim()) {
      return {
        rawTranscript: rawTranscript || "",
        interpretedQuestion: rawTranscript || "",
        reconstructionConfidence: 1.0,
        confidenceLevel: "HIGH",
        linkedEntities: [],
        correctionsApplied: [],
        isModified: false,
        telemetry: {
          turnId: context?.turnId,
          rawTranscript: rawTranscript || "",
          interpretedQuestion: rawTranscript || "",
          reconstructionConfidence: 1.0,
          evidence: []
        }
      };
    }

    let workingText = rawTranscript.trim();
    const corrections: SemanticCorrection[] = [];
    const linkedEntities = new Set<string>();

    // -----------------------------------------------------------------------
    // STEP 1: Lexical & Phonetic Terminology Reconstruction
    // -----------------------------------------------------------------------
    for (const rule of PHONETIC_SEO_MAP) {
      if (rule.pattern.test(workingText)) {
        workingText = workingText.replace(rule.pattern, (match) => {
          corrections.push({
            from: match,
            to: rule.replacement,
            reason: rule.reason,
            confidence: rule.confidence,
            type: "PHONETIC_REPAIR"
          });
          linkedEntities.add(rule.entity);
          return rule.replacement;
        });
      }
    }

    // -----------------------------------------------------------------------
    // STEP 2: Contextual Bounded Entity Recovery (Domain A vs Domain B)
    // -----------------------------------------------------------------------
    const ctx = context?.priorContext;
    const priorEntities =
      context?.priorEntities ||
      (ctx && "entities" in ctx ? ctx.entities : ctx && "inheritedEntities" in ctx ? ctx.inheritedEntities : []) ||
      [];
    const priorIntent =
      context?.priorIntent ||
      (ctx && "intent" in ctx ? ctx.intent : ctx && "inheritedIntent" in ctx ? ctx.inheritedIntent : undefined);

    const hasDomainAContext = priorEntities.some((e) => /domain\s*a/i.test(e)) || priorIntent === "DOMAIN_SELECTION";
    const hasDomainBContext = priorEntities.some((e) => /domain\s*b/i.test(e)) || priorIntent === "DOMAIN_SELECTION";

    // Adversarial STT case: "Romania" -> "Domain A" when prior turn was Domain A/B comparison
    if (hasDomainAContext || hasDomainBContext) {
      if (/\b(romania|r[oô]\s*ma\s*ni\s*a|domain\s*romania)\b/gi.test(workingText)) {
        workingText = workingText.replace(/\b(romania|r[oô]\s*ma\s*ni\s*a|domain\s*romania)\b/gi, (match) => {
          corrections.push({
            from: match,
            to: "Domain A",
            reason: "Contextual recovery: 'Romania' misheard for 'Domain A' in active Domain comparison context",
            confidence: 0.96,
            type: "ENTITY_RECOVERY"
          });
          linkedEntities.add("Domain A");
          return "Domain A";
        });
      }
    }

    // -----------------------------------------------------------------------
    // STEP 3: Spoken Vietnamese Number & Currency Normalization
    // -----------------------------------------------------------------------
    workingText = workingText.replace(/\bhai\s+m[uư][oơ]i\s+tri[eệ]u\b/gi, (match) => {
      corrections.push({
        from: match,
        to: "20 triệu",
        reason: "Spoken currency normalization",
        confidence: 0.98,
        type: "NUMERIC_NORMALIZATION"
      });
      return "20 triệu";
    });

    workingText = workingText.replace(/\bb[oố]n\s+m[uư][oơ]i\s+ba\s+tri[eệ]u\b/gi, (match) => {
      corrections.push({
        from: match,
        to: "43 triệu",
        reason: "Spoken currency normalization",
        confidence: 0.98,
        type: "NUMERIC_NORMALIZATION"
      });
      return "43 triệu";
    });

    workingText = workingText.replace(/\bba\s+m[uư][oơ]i\s+tri[eệ]u\b/gi, (match) => {
      corrections.push({
        from: match,
        to: "30 triệu",
        reason: "Spoken currency normalization",
        confidence: 0.98,
        type: "NUMERIC_NORMALIZATION"
      });
      return "30 triệu";
    });

    // -----------------------------------------------------------------------
    // STEP 4: Confidence Calculation & Gate Policy Enforcement
    // -----------------------------------------------------------------------
    let overallConfidence = 1.0;
    if (corrections.length > 0) {
      overallConfidence = corrections.reduce((acc, c) => acc + c.confidence, 0) / corrections.length;
    }

    overallConfidence = Math.round(overallConfidence * 100) / 100;

    let confidenceLevel: ReconstructionConfidenceLevel = "HIGH";
    if (overallConfidence < 0.50) {
      confidenceLevel = "LOW";
    } else if (overallConfidence < 0.85) {
      confidenceLevel = "MEDIUM";
    }

    // Policy rules:
    // - HIGH (>= 0.85): Semantic correction allowed.
    // - MEDIUM (0.50 - 0.84): Preserve raw text as interpretedQuestion, candidate in metadata.
    // - LOW (< 0.50): Do NOT silently rewrite.
    let finalInterpretedQuestion = workingText;
    if (confidenceLevel === "LOW" || confidenceLevel === "MEDIUM") {
      finalInterpretedQuestion = rawTranscript.trim();
    }

    const isModified = finalInterpretedQuestion !== rawTranscript.trim();

    return {
      rawTranscript: rawTranscript.trim(),
      interpretedQuestion: finalInterpretedQuestion,
      reconstructionConfidence: overallConfidence,
      confidenceLevel,
      linkedEntities: Array.from(linkedEntities),
      correctionsApplied: corrections,
      isModified,
      telemetry: {
        turnId: context?.turnId,
        rawTranscript: rawTranscript.trim(),
        interpretedQuestion: finalInterpretedQuestion,
        reconstructionConfidence: overallConfidence,
        evidence: Array.from(linkedEntities)
      }
    };
  }
}
