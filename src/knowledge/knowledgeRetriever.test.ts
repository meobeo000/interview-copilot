import { beforeEach, describe, expect, it } from "vitest";
import { KnowledgeRetriever } from "./knowledgeRetriever";
import { LocalKnowledgeStore } from "./knowledgeStore";

describe("KnowledgeRetriever (Fast Grounded SEO Retrieval)", () => {
  let store: LocalKnowledgeStore;
  let retriever: KnowledgeRetriever;

  beforeEach(() => {
    store = new LocalKnowledgeStore(false);
    store.resetToDefault();
    retriever = new KnowledgeRetriever({ store, defaultMaxChunks: 4 });
  });

  it("retrieves DOMAIN_SELECTION knowledge for domain question", () => {
    const result = retriever.retrieve(
      "Domain DR 50 nhưng không có organic traffic thì có nên mua không?",
      "DOMAIN_SELECTION"
    );

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.length).toBeLessThanOrEqual(4);

    const topics = result.chunks.map((c) => c.topic);
    expect(topics).toContain("DOMAIN_SELECTION");

    // Check practitioner knowledge returned is non-personal
    const practitionerChunks = result.chunks.filter((c) => c.sourceType === "practitioner_playbook");
    for (const p of practitionerChunks) {
      expect(p.canClaimAsPersonalExperience).toBe(false);
    }
  });

  it("retrieves NO_KEYWORD_SIGNAL knowledge for bot open without keyword question", () => {
    const result = retriever.retrieve(
      "Site mở bot 2 tuần vẫn chưa nhận keyword thì em xử lý thế nào?",
      "NO_KEYWORD_SIGNAL"
    );

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.length).toBeLessThanOrEqual(4);

    const topics = result.chunks.map((c) => c.topic);
    expect(topics).toContain("NO_KEYWORD_SIGNAL");

    const contentStr = result.chunks.map((c) => c.content).join(" ");
    expect(contentStr).toMatch(/on-page|title|meta|sapo|internal link/i);
  });

  it("retrieves BUDGET knowledge for 20 triệu budget allocation question", () => {
    const result = retriever.retrieve(
      "Với budget 20 triệu khởi điểm em phân bổ thế nào cho site mới?",
      "BUDGET_ALLOCATION"
    );

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.length).toBeLessThanOrEqual(4);

    const budgetChunk = result.chunks.find((c) => c.topic === "BUDGET");
    expect(budgetChunk).toBeDefined();
    expect(budgetChunk?.content).toContain("20 triệu");
  });

  it("does not prioritize irrelevant PBN chunks for domain selection question", () => {
    const result = retriever.retrieve(
      "Cách audit domain expired tránh dính anchor spam",
      "DOMAIN_SELECTION"
    );

    const firstChunk = result.chunks[0];
    expect(firstChunk.topic).toBe("DOMAIN_SELECTION");
  });

  it("strictly limits returned chunks to configured maximum (<= maxChunks)", () => {
    const result = retriever.retrieve("Kế hoạch SEO tổng thể", "STRATEGY_PLAN", 3);
    expect(result.chunks.length).toBeLessThanOrEqual(3);
  });

  it("is 100% deterministic (repeated calls return identical order)", () => {
    const res1 = retriever.retrieve("Budget 20 triệu chia thế nào?", "BUDGET_ALLOCATION");
    const res2 = retriever.retrieve("Budget 20 triệu chia thế nào?", "BUDGET_ALLOCATION");

    expect(res1.chunks.map((c) => c.id)).toEqual(res2.chunks.map((c) => c.id));
  });

  it("executes retrieval within < 10ms realtime benchmark", () => {
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      retriever.retrieve("Site mở bot 2 tuần chưa nhận key", "NO_KEYWORD_SIGNAL");
    }
    const elapsedTotal = performance.now() - start;
    const avgPerQuery = elapsedTotal / 50;

    expect(avgPerQuery).toBeLessThan(10); // Typically < 0.2ms
  });
});
