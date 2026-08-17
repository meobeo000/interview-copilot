import { describe, expect, it } from "vitest";
import { validateAndEnforceSafety } from "./types";

describe("Knowledge Domain Model & Hard Safety Boundary", () => {
  it("enforces canClaimAsPersonalExperience = false for practitioner_playbook even if true is passed", () => {
    const rawChunk = {
      id: "practitioner-001",
      sourceType: "practitioner_playbook" as const,
      topic: "BUDGET" as const,
      title: "UU88 Budget Strategy",
      content: "Ở project UU88 budget đầu khoảng 20 triệu chia Entity và Web 2.0.",
      tags: ["budget", "igaming", "uu88"],
      canClaimAsPersonalExperience: true // Malicious or buggy input attempt
    };

    const validated = validateAndEnforceSafety(rawChunk);

    // MUST BE FALSE
    expect(validated.canClaimAsPersonalExperience).toBe(false);
    expect(validated.confidence).toBe("practitioner_experience");
    expect(validated.sourceType).toBe("practitioner_playbook");
  });

  it("enforces canClaimAsPersonalExperience = false for general_note", () => {
    const rawChunk = {
      id: "note-001",
      sourceType: "general_note" as const,
      topic: "ONPAGE" as const,
      title: "Canonical Rule",
      content: "Canonical tag must be self-referential on primary URLs.",
      tags: ["canonical", "onpage"],
      canClaimAsPersonalExperience: true // Attempt to claim general rule as personal
    };

    const validated = validateAndEnforceSafety(rawChunk);

    expect(validated.canClaimAsPersonalExperience).toBe(false);
    expect(validated.confidence).toBe("general_note");
  });

  it("allows canClaimAsPersonalExperience = true for candidate_profile", () => {
    const rawChunk = {
      id: "candidate-001",
      sourceType: "candidate_profile" as const,
      topic: "PROJECT_EXPERIENCE" as const,
      title: "Web Development Background",
      content: "Ứng viên có nền tảng web development vững chắc, hiểu sâu cấu trúc web và network/debugging.",
      tags: ["web-dev", "technical", "debugging"],
      canClaimAsPersonalExperience: true
    };

    const validated = validateAndEnforceSafety(rawChunk);

    expect(validated.canClaimAsPersonalExperience).toBe(true);
    expect(validated.confidence).toBe("candidate_fact");
  });

  it("throws error if required fields are missing", () => {
    expect(() =>
      validateAndEnforceSafety({
        id: "chunk-incomplete"
        // missing sourceType, topic, content
      })
    ).toThrow();
  });
});
