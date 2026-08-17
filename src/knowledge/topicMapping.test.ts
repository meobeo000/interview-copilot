import { describe, expect, it } from "vitest";
import { getTopicsForIntent } from "./topicMapping";

describe("Intent to Topic Mapping", () => {
  it("maps BUDGET_ALLOCATION to BUDGET, CONTENT, ENTITY, GUEST_POST, PBN, BACKLINK_FOUNDATION", () => {
    const mapping = getTopicsForIntent("BUDGET_ALLOCATION");
    expect(mapping.primaryTopics).toContain("BUDGET");
    expect(mapping.secondaryTopics).toEqual(
      expect.arrayContaining(["CONTENT", "ENTITY", "GUEST_POST", "PBN", "BACKLINK_FOUNDATION"])
    );
  });

  it("maps PBN_TIMING to PBN_TIMING, PBN, INDEXING", () => {
    const mapping = getTopicsForIntent("PBN_TIMING");
    expect(mapping.primaryTopics).toContain("PBN_TIMING");
    expect(mapping.secondaryTopics).toEqual(expect.arrayContaining(["PBN", "INDEXING"]));
  });

  it("maps DOMAIN_SELECTION to DOMAIN_SELECTION, EXPIRED_DOMAIN, REFERRING_DOMAIN, ANCHOR_TEXT, TLD_TESTING", () => {
    const mapping = getTopicsForIntent("DOMAIN_SELECTION");
    expect(mapping.primaryTopics).toContain("DOMAIN_SELECTION");
    expect(mapping.secondaryTopics).toEqual(
      expect.arrayContaining(["EXPIRED_DOMAIN", "REFERRING_DOMAIN", "ANCHOR_TEXT", "TLD_TESTING"])
    );
  });

  it("maps NO_KEYWORD_SIGNAL to NO_KEYWORD_SIGNAL, INDEXING, ONPAGE, INTERNAL_LINK, TECHNICAL_SEO, DOMAIN_SELECTION", () => {
    const mapping = getTopicsForIntent("NO_KEYWORD_SIGNAL");
    expect(mapping.primaryTopics).toContain("NO_KEYWORD_SIGNAL");
    expect(mapping.secondaryTopics).toEqual(
      expect.arrayContaining(["INDEXING", "ONPAGE", "INTERNAL_LINK", "TECHNICAL_SEO", "DOMAIN_SELECTION"])
    );
  });

  it("maps CORE_UPDATE_RECOVERY to CORE_UPDATE, GSC, TECHNICAL_SEO, CONTENT", () => {
    const mapping = getTopicsForIntent("CORE_UPDATE_RECOVERY");
    expect(mapping.primaryTopics).toContain("CORE_UPDATE");
    expect(mapping.secondaryTopics).toEqual(
      expect.arrayContaining(["GSC", "TECHNICAL_SEO", "CONTENT"])
    );
  });

  it("maps NEGATIVE_SEO to NEGATIVE_SEO, REFERRING_DOMAIN, ANCHOR_TEXT", () => {
    const mapping = getTopicsForIntent("NEGATIVE_SEO");
    expect(mapping.primaryTopics).toContain("NEGATIVE_SEO");
    expect(mapping.secondaryTopics).toEqual(
      expect.arrayContaining(["REFERRING_DOMAIN", "ANCHOR_TEXT"])
    );
  });

  it("maps REDIRECT_301 to REDIRECT_301, DOMAIN_SELECTION", () => {
    const mapping = getTopicsForIntent("REDIRECT_301");
    expect(mapping.primaryTopics).toContain("REDIRECT_301");
    expect(mapping.secondaryTopics).toEqual(expect.arrayContaining(["DOMAIN_SELECTION"]));
  });

  it("handles unknown intent gracefully with GENERAL topic", () => {
    const mapping = getTopicsForIntent("UNKNOWN_INTENT_CATEGORY");
    expect(mapping.primaryTopics).toEqual(["GENERAL"]);
  });
});
