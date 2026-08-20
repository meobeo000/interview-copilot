import { describe, it, expect, beforeEach } from "vitest";
import {
  createDefaultSessionConfig,
  duplicateSessionConfig,
  snapshotSessionConfig,
  loadStoredSessions,
  saveStoredSessions,
  saveStoredActiveSessionId,
  loadStoredActiveSessionId,
  type SessionConfig
} from "./sessionConfig";

describe("Phase 1: SessionConfig Model & Persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a new session config with all required Phase 1 fields", () => {
    const config = createDefaultSessionConfig({
      company: "Acme Corp",
      jobDescription: "Senior Tech SEO",
      questionType: "TECHNICAL",
      answerFormat: "FULL_SCRIPT",
      length: "LONG",
      tone: "FORMAL",
      starMethod: true
    });

    expect(config.id).toBeTruthy();
    expect(config.sessionType).toBe("INTERVIEW");
    expect(config.company).toBe("Acme Corp");
    expect(config.jobDescription).toBe("Senior Tech SEO");
    expect(config.questionType).toBe("TECHNICAL");
    expect(config.answerFormat).toBe("FULL_SCRIPT");
    expect(config.length).toBe("LONG");
    expect(config.tone).toBe("FORMAL");
    expect(config.starMethod).toBe(true);
    expect(config.autoAnswer).toBe(true);
    expect(config.saveTranscript).toBe(true);
  });

  it("duplicates a session config cleanly with a new ID and copy name", () => {
    const original: SessionConfig = createDefaultSessionConfig({
      name: "Phỏng vấn Google",
      company: "Google",
      resume: "10 năm SEO",
      knowledgeDocuments: ["doc1", "doc2"]
    });

    const duplicate = duplicateSessionConfig(original);

    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.name).toBe("Phỏng vấn Google (Bản sao)");
    expect(duplicate.company).toBe("Google");
    expect(duplicate.resume).toBe("10 năm SEO");
    expect(duplicate.knowledgeDocuments).toEqual(["doc1", "doc2"]);
  });

  it("creates an immutable snapshot when starting a session", () => {
    const original = createDefaultSessionConfig({
      company: "VNG",
      knowledgeDocuments: ["playbook-a"]
    });

    const snapshot = snapshotSessionConfig(original);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.knowledgeDocuments)).toBe(true);
    // Mutations are blocked
    expect(() => {
      // @ts-expect-error test mutation rejection
      snapshot.company = "New Company";
    }).toThrow();
  });

  it("persists sessions and active session ID to localStorage across restarts", () => {
    const session1 = createDefaultSessionConfig({ name: "Session 1" });
    const session2 = createDefaultSessionConfig({ name: "Session 2" });

    saveStoredSessions([session1, session2]);
    saveStoredActiveSessionId(session2.id);

    const loadedSessions = loadStoredSessions();
    const activeId = loadStoredActiveSessionId();

    expect(loadedSessions).toHaveLength(2);
    expect(loadedSessions[0].id).toBe(session1.id);
    expect(loadedSessions[1].id).toBe(session2.id);
    expect(activeId).toBe(session2.id);
  });
});
