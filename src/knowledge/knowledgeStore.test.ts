import { beforeEach, describe, expect, it } from "vitest";
import { LocalKnowledgeStore } from "./knowledgeStore";
import { validateAndEnforceSafety } from "./types";

describe("LocalKnowledgeStore (Fast Local Knowledge Storage)", () => {
  let store: LocalKnowledgeStore;

  beforeEach(() => {
    store = new LocalKnowledgeStore(false);
    store.resetToDefault();
  });

  it("initializes with default seed practitioner playbook chunks and candidate profile facts", () => {
    const allChunks = store.listChunks();
    expect(allChunks.length).toBeGreaterThanOrEqual(6);

    const practitionerChunks = store.listChunks({ sourceType: "practitioner_playbook" });
    expect(practitionerChunks.length).toBeGreaterThanOrEqual(4);

    for (const chunk of practitionerChunks) {
      expect(chunk.canClaimAsPersonalExperience).toBe(false);
      expect(chunk.confidence).toBe("practitioner_experience");
    }
  });

  it("supports adding single chunk and enforces safety boundary", () => {
    const chunk = validateAndEnforceSafety({
      id: "practitioner:custom:301",
      sourceType: "practitioner_playbook",
      topic: "REDIRECT_301",
      title: "Kinh nghiệm 301 chuyển hướng",
      content: "Practitioner chuyển hướng domain cũ giữ nguyên URL structure.",
      tags: ["301", "redirect"]
    });

    store.addChunk(chunk);
    const retrieved = store.getChunk("practitioner:custom:301");
    expect(retrieved).toBeDefined();
    expect(retrieved?.canClaimAsPersonalExperience).toBe(false);
  });

  it("supports adding multiple chunks in batch", () => {
    const batch = [
      validateAndEnforceSafety({
        id: "chunk-a",
        sourceType: "practitioner_playbook",
        topic: "ONPAGE",
        content: "Content A",
        tags: ["onpage"]
      }),
      validateAndEnforceSafety({
        id: "chunk-b",
        sourceType: "general_note",
        topic: "TECHNICAL_SEO",
        content: "Content B",
        tags: ["technical"]
      })
    ];

    store.addChunks(batch);
    expect(store.getChunk("chunk-a")).toBeDefined();
    expect(store.getChunk("chunk-b")).toBeDefined();
  });

  it("supports deleteChunk and deleteChunksBySource", () => {
    store.addChunk(
      validateAndEnforceSafety({
        id: "chunk-to-delete",
        sourceType: "practitioner_playbook",
        topic: "BUDGET",
        content: "Delete me",
        sourceName: "Temporary Source",
        tags: ["temp"]
      })
    );

    expect(store.getChunk("chunk-to-delete")).toBeDefined();
    const deleted = store.deleteChunk("chunk-to-delete");
    expect(deleted).toBe(true);
    expect(store.getChunk("chunk-to-delete")).toBeUndefined();

    // Test delete by source
    store.addChunk(
      validateAndEnforceSafety({
        id: "chunk-src-1",
        sourceType: "practitioner_playbook",
        topic: "BUDGET",
        content: "Source 1",
        sourceName: "BatchSource",
        tags: ["temp"]
      })
    );
    store.addChunk(
      validateAndEnforceSafety({
        id: "chunk-src-2",
        sourceType: "practitioner_playbook",
        topic: "PBN",
        content: "Source 2",
        sourceName: "BatchSource",
        tags: ["temp"]
      })
    );

    const count = store.deleteChunksBySource("BatchSource");
    expect(count).toBe(2);
  });

  it("supports searchByTopic and searchByTags", () => {
    const budgetChunks = store.searchByTopic("BUDGET");
    expect(budgetChunks.length).toBeGreaterThan(0);
    for (const c of budgetChunks) {
      expect(c.topic).toBe("BUDGET");
    }

    const tagResults = store.searchByTags(["20 triệu"]);
    expect(tagResults.length).toBeGreaterThan(0);
  });

  it("supports free text keyword search with scoring", () => {
    const results = store.search("ngân sách 20 triệu");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("20 triệu");
  });

  it("exports and imports valid JSON chunks", () => {
    const exported = store.exportJson();
    expect(typeof exported).toBe("string");

    const newStore = new LocalKnowledgeStore(false);
    newStore.clear();
    expect(newStore.listChunks().length).toBe(0);

    const importedCount = newStore.importJson(exported);
    expect(importedCount).toBeGreaterThan(0);
    expect(newStore.listChunks().length).toBe(importedCount);
  });
});
