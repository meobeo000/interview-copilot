export type SessionType = "INTERVIEW" | "REGULAR_CALL";
export type QuestionType = "TECHNICAL" | "BEHAVIORAL" | "SITUATIONAL";
export type AnswerFormat = "FULL_SCRIPT" | "SCRIPT_AND_BULLETS" | "BULLETS";
export type AnswerLength = "SHORT" | "BALANCED" | "LONG";
export type AnswerTone = "SIMPLE" | "FORMAL";
export type SessionLanguage = "vi" | "en";

export interface SessionConfig {
  id: string;
  name: string;
  sessionType: SessionType;
  company: string;
  jobDescription: string;
  resume: string;
  knowledgeDocuments: string[];
  customInstructions: string;
  questionType: QuestionType;
  answerFormat: AnswerFormat;
  length: AnswerLength;
  tone: AnswerTone;
  starMethod: boolean;
  model: string;
  language: SessionLanguage;
  autoAnswer: boolean;
  saveTranscript: boolean;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  id: "default-session",
  name: "Phỏng vấn SEO Specialist",
  sessionType: "INTERVIEW",
  company: "Tech Enterprise",
  jobDescription: "SEO Specialist / Technical SEO Leader",
  resume: "Nền tảng Web Development & Technical SEO",
  knowledgeDocuments: ["domain-hunting-playbook", "pbn-timing-playbook", "negative-seo-defense"],
  customInstructions: "Ưu tiên câu trả lời thực chiến, ngắn gọn, có số liệu và bước triển khai rõ ràng.",
  questionType: "TECHNICAL",
  answerFormat: "SCRIPT_AND_BULLETS",
  length: "BALANCED",
  tone: "SIMPLE",
  starMethod: false,
  model: "gemini-2.0-flash",
  language: "vi",
  autoAnswer: true,
  saveTranscript: true,
  createdAt: Date.now(),
  updatedAt: Date.now()
};

export const SESSION_STORAGE_KEY = "interview-copilot.sessions.v1";
export const ACTIVE_SESSION_STORAGE_KEY = "interview-copilot.active-session.v1";

export function createDefaultSessionConfig(partial?: Partial<SessionConfig>): SessionConfig {
  const now = Date.now();
  const id = `session-${now}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    ...DEFAULT_SESSION_CONFIG,
    id,
    name: partial?.name || `Phiên phỏng vấn ${new Date(now).toLocaleDateString("vi-VN")}`,
    createdAt: now,
    updatedAt: now,
    ...partial
  };
}

export function duplicateSessionConfig(config: SessionConfig, newName?: string): SessionConfig {
  const now = Date.now();
  const id = `session-${now}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    ...config,
    id,
    name: newName || `${config.name} (Bản sao)`,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Creates an immutable snapshot of the session configuration at session start.
 */
export function snapshotSessionConfig(config: SessionConfig): Readonly<SessionConfig> {
  return Object.freeze({
    ...config,
    knowledgeDocuments: Object.freeze([...config.knowledgeDocuments]) as unknown as string[]
  });
}

function getLocalStorage(): Storage | undefined {
  if (typeof globalThis !== "undefined" && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
    return (globalThis as unknown as { localStorage: Storage }).localStorage;
  }
  return undefined;
}

export function loadStoredSessions(): SessionConfig[] {
  try {
    const storage = getLocalStorage();
    if (!storage) {
      return [DEFAULT_SESSION_CONFIG];
    }
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return [DEFAULT_SESSION_CONFIG];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as SessionConfig[];
    }
    return [DEFAULT_SESSION_CONFIG];
  } catch {
    return [DEFAULT_SESSION_CONFIG];
  }
}

export function saveStoredSessions(sessions: SessionConfig[]): void {
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
    }
  } catch (err) {
    console.error("Failed to save sessions to localStorage:", err);
  }
}

export function loadStoredActiveSessionId(): string | null {
  try {
    const storage = getLocalStorage();
    if (!storage) return null;
    return storage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveStoredActiveSessionId(id: string): void {
  try {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(ACTIVE_SESSION_STORAGE_KEY, id);
    }
  } catch (err) {
    console.error("Failed to save active session ID:", err);
  }
}
