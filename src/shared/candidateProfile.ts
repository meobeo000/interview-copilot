import type { KnowledgeChunk } from "../knowledge/types";
import { validateAndEnforceSafety } from "../knowledge/types";

export interface CandidateProject {
  name: string;
  role?: string;
  description?: string;
  metrics?: string;
}

export interface CandidateProfile {
  fullName: string;
  role: string;
  background: string;
  skills: string[];
  seoSkills: string[];
  tools: string[];
  projects: CandidateProject[];
  markets: string[];
  strengths: string[];
  experienceNotes: string;
  yearsOfExperience?: number;
}

export const DEFAULT_CANDIDATE_PROFILE: CandidateProfile = {
  fullName: "Ứng viên",
  role: "SEO Specialist / Web & Technical SEO",
  background: "Nền tảng Web Development vững chắc, nắm sâu kiến trúc website, server, DOM rendering, network lifecycle và kỹ năng technical debugging.",
  skills: [
    "Web Development (HTML/CSS/JavaScript/TypeScript)",
    "Website Architecture & Server Rendering",
    "Technical Debugging & Network Profiling",
    "Performance Optimization & Core Web Vitals"
  ],
  seoSkills: [
    "Technical SEO & Crawl Budget Optimization",
    "On-page Architecture & Silo Structure",
    "Search Intent Analysis & Content Blueprint",
    "Entity Optimization & Schema Markup",
    "Thực chiến SEO iGaming / Sports Betting"
  ],
  tools: [
    "Google Search Console",
    "Ahrefs",
    "Screaming Frog",
    "GA4",
    "Semrush"
  ],
  projects: [], // NO invented SEO projects - strictly empty until user adds their own
  markets: ["Việt Nam (VN)"],
  strengths: [
    "Tư duy logic kỹ thuật web sâu sắc",
    "Khả năng bóc tách lỗi crawl/indexing ở tầng code và server",
    "Tiếp cận SEO dựa trên dữ liệu và tín hiệu đo lường thực tế"
  ],
  experienceNotes: "Đang học hỏi và đúc kết kinh nghiệm thực chiến SEO ngách iGaming từ các practitioner hàng đầu; định hướng tư vấn giải pháp và chiến lược tối ưu."
};

const PROFILE_STORAGE_KEY = "interview-copilot.candidate-profile.v2";

export function loadCandidateProfile(): CandidateProfile {
  try {
    if (typeof globalThis !== "undefined" && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      const raw = (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) {
        // Fallback check for v1 migration if needed
        const v1Raw = (globalThis as unknown as { localStorage: Storage }).localStorage.getItem("interview-copilot.candidate-profile.v1");
        if (v1Raw) {
          try {
            const parsedV1 = JSON.parse(v1Raw);
            return {
              ...DEFAULT_CANDIDATE_PROFILE,
              fullName: parsedV1.fullName || DEFAULT_CANDIDATE_PROFILE.fullName,
              role: parsedV1.role || DEFAULT_CANDIDATE_PROFILE.role,
              experienceNotes: parsedV1.customNotes || DEFAULT_CANDIDATE_PROFILE.experienceNotes
            };
          } catch {
            return DEFAULT_CANDIDATE_PROFILE;
          }
        }
        return DEFAULT_CANDIDATE_PROFILE;
      }
      return { ...DEFAULT_CANDIDATE_PROFILE, ...JSON.parse(raw) };
    }
  } catch {
    return DEFAULT_CANDIDATE_PROFILE;
  }
  return DEFAULT_CANDIDATE_PROFILE;
}

export function saveCandidateProfile(profile: CandidateProfile): void {
  try {
    if (typeof globalThis !== "undefined" && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    }
  } catch (err) {
    console.error("Failed to save candidate profile to localStorage:", err);
  }
}

/**
 * Converts candidate profile into validated personal knowledge chunks with canClaimAsPersonalExperience = true.
 */
export function candidateProfileToChunks(profile: CandidateProfile = loadCandidateProfile()): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];

  if (profile.background) {
    chunks.push(
      validateAndEnforceSafety({
        id: "candidate:profile:background",
        sourceType: "candidate_profile",
        topic: "TECHNICAL_SEO",
        title: "Nền tảng Kỹ thuật & Web Development của Ứng viên",
        content: `Thông tin cá nhân ứng viên: ${profile.background}`,
        tags: ["background", "web-dev", "technical", "debugging", "kiến trúc web"],
        sourceName: "Candidate Profile",
        canClaimAsPersonalExperience: true
      })
    );
  }

  if (profile.strengths && profile.strengths.length > 0) {
    chunks.push(
      validateAndEnforceSafety({
        id: "candidate:profile:strengths",
        sourceType: "candidate_profile",
        topic: "PROJECT_EXPERIENCE",
        title: "Thế mạnh Kỹ thuật & Tư duy SEO của Ứng viên",
        content: `Thế mạnh thật của ứng viên: ${profile.strengths.join("; ")}. Kỹ năng kỹ thuật: ${profile.skills.join(", ")}.`,
        tags: ["thế mạnh", "kỹ năng", "tư duy", "kinh nghiệm"],
        sourceName: "Candidate Profile",
        canClaimAsPersonalExperience: true
      })
    );
  }

  if (profile.seoSkills && profile.seoSkills.length > 0) {
    chunks.push(
      validateAndEnforceSafety({
        id: "candidate:profile:seo-skills",
        sourceType: "candidate_profile",
        topic: "ONPAGE",
        title: "Kỹ năng SEO & Công cụ của Ứng viên",
        content: `Kỹ năng SEO: ${profile.seoSkills.join(", ")}. Công cụ thành thạo: ${profile.tools.join(", ")}. Thị trường: ${profile.markets.join(", ")}.`,
        tags: ["kỹ năng seo", "công cụ", "gsc", "ahrefs", "screaming frog"],
        sourceName: "Candidate Profile",
        canClaimAsPersonalExperience: true
      })
    );
  }

  // Only if candidate explicitly configured real projects
  if (profile.projects && profile.projects.length > 0) {
    profile.projects.forEach((proj, idx) => {
      if (proj.name?.trim()) {
        chunks.push(
          validateAndEnforceSafety({
            id: `candidate:project:${idx + 1}`,
            sourceType: "candidate_profile",
            topic: "PROJECT_EXPERIENCE",
            title: `Dự án thực tế của Ứng viên: ${proj.name}`,
            content: `Dự án thật của ứng viên: ${proj.name}. Vai trò: ${proj.role || "Phụ trách"}. Mô tả: ${proj.description || ""}. Kết quả: ${proj.metrics || ""}`,
            tags: ["dự án", proj.name.toLowerCase(), "kinh nghiệm thực tế"],
            sourceName: "Candidate Profile",
            canClaimAsPersonalExperience: true
          })
        );
      }
    });
  }

  return chunks;
}

export function formatProfileForPrompt(profile: CandidateProfile): string {
  const projectSummary =
    profile.projects && profile.projects.length > 0
      ? profile.projects.map((p) => `- Dự án: ${p.name} (${p.role || ""}) - ${p.description || ""} ${p.metrics ? `[${p.metrics}]` : ""}`).join("\n")
      : "- Chưa có dự án SEO riêng biệt (ứng viên xuất thân Web Dev mạnh về Technical SEO).";

  return `
[CANDIDATE PROFILE (PERSONAL FACTS)]:
- Ứng viên: ${profile.fullName} (${profile.role})
- Background: ${profile.background}
- Kỹ năng & Thế mạnh: ${profile.strengths.join("; ")}
- Công cụ: ${profile.tools.join(", ")}
- Kỹ năng SEO: ${profile.seoSkills.join(", ")}
- Thị trường (Geo): ${profile.markets.join(", ")}
- Dự án thực tế:
${projectSummary}
- Ghi chú: ${profile.experienceNotes}
`.trim();
}
