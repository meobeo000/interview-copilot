import { describe, expect, it } from "vitest";
import { JsonImporter, ManualTextImporter } from "./importer";

describe("ManualTextImporter & JsonImporter", () => {
  it("ManualTextImporter deterministically parses Markdown headings into KnowledgeChunks", () => {
    const rawText = `
# Phân bổ ngân sách dự án UU88
Ở project UU88 budget đầu khoảng 20 triệu chia Entity và Web 2.0.

# Thời điểm bắn PBN
Practitioner bắt đầu bắn PBN quanh ngày 10 khi site đã index.
`.trim();

    const importer = new ManualTextImporter();
    const chunks = importer.import({
      sourceType: "practitioner_playbook",
      sourceName: "UU88 Notes",
      text: rawText
    });

    expect(chunks.length).toBe(2);

    expect(chunks[0].title).toBe("Phân bổ ngân sách dự án UU88");
    expect(chunks[0].topic).toBe("BUDGET");
    expect(chunks[0].sourceType).toBe("practitioner_playbook");
    expect(chunks[0].canClaimAsPersonalExperience).toBe(false);
    expect(chunks[0].tags).toContain("budget");

    expect(chunks[1].title).toBe("Thời điểm bắn PBN");
    expect(chunks[1].topic).toBe("PBN_TIMING");
    expect(chunks[1].canClaimAsPersonalExperience).toBe(false);
  });

  it("ManualTextImporter parses bracket sections like [BUDGET] or [PBN]", () => {
    const rawText = `
[BUDGET]
Chi phí 20 triệu phân bổ cho content và backlink nền.

[DOMAIN_SELECTION]
Kiểm tra wayback machine và anchor text rác.
`.trim();

    const importer = new ManualTextImporter();
    const chunks = importer.import({
      sourceType: "practitioner_playbook",
      text: rawText
    });

    expect(chunks.length).toBe(2);
    expect(chunks[0].topic).toBe("BUDGET");
    expect(chunks[1].topic).toBe("DOMAIN_SELECTION");
  });

  it("JsonImporter safely imports JSON array and validates safety boundary", () => {
    const jsonStr = JSON.stringify([
      {
        id: "chunk-json-1",
        sourceType: "practitioner_playbook",
        topic: "REDIRECT_301",
        content: "Chiến lược 301 giữ juice domain cũ.",
        tags: ["301"],
        canClaimAsPersonalExperience: true // Injected attempt to claim experience
      }
    ]);

    const importer = new JsonImporter();
    const chunks = importer.import({
      sourceType: "practitioner_playbook",
      text: jsonStr
    });

    expect(chunks.length).toBe(1);
    expect(chunks[0].canClaimAsPersonalExperience).toBe(false);
  });
});
