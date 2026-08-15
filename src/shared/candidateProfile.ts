export interface CandidateProfile {
  fullName: string;
  role: string;
  yearsOfExperience: number;
  primaryNiches: string[];
  geoMarkets: string[];
  keyAchievements: string;
  typicalBudget: string;
  pbnStrategy: string;
  toolsUsed: string[];
  customNotes: string;
}

export const DEFAULT_CANDIDATE_PROFILE: CandidateProfile = {
  fullName: "Ứng viên Senior SEO",
  role: "Senior SEO Specialist / SEO Lead",
  yearsOfExperience: 5,
  primaryNiches: ["iGaming", "Sports Betting", "Casino", "E-commerce"],
  geoMarkets: ["Việt Nam (VN)", "Campuchia (KH)", "Thái Lan (TH)"],
  keyAchievements: "Kéo 3 dự án iGaming lên top 3 từ khóa độ khó cao sau 4 tháng; duy trì traffic 80k-150k organic visitors/tháng; xử lý phục hồi 2 site dính Core Update.",
  typicalBudget: "30 - 60 triệu VNĐ/tháng cho PBN & Guest Post chất lượng",
  pbnStrategy: "Mạng lưới 25 site vệ tinh chuyên biệt ngách, domain expired có traffic thật (DR 25-40), bắn link sau ngày thứ 14 khi site chính đã index sạch.",
  toolsUsed: ["Google Search Console", "GA4", "Ahrefs", "Screaming Frog", "Semrush"],
  customNotes: "Ưu tiên cấu trúc silo chuẩn, entity đa tầng và audit link profile hàng tuần để tránh negative SEO."
};

const PROFILE_STORAGE_KEY = "interview-copilot.candidate-profile.v1";

export function loadCandidateProfile(): CandidateProfile {
  try {
    if (typeof globalThis !== "undefined" && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      const raw = (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return DEFAULT_CANDIDATE_PROFILE;
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

export function formatProfileForPrompt(profile: CandidateProfile): string {
  return `
[CANDIDATE REAL EXPERIENCE & PROJECT CONTEXT]:
- Role & Kinh nghiệm: ${profile.role} (${profile.yearsOfExperience} năm kinh nghiệm thực chiến).
- Ngách chuyên môn: ${profile.primaryNiches.join(", ")}.
- Thị trường (Geo): ${profile.geoMarkets.join(", ")}.
- Dự án & Thành tích thật: ${profile.keyAchievements}.
- Ngân sách PBN/Link hàng tháng: ${profile.typicalBudget}.
- Chiến lược PBN & Vệ tinh: ${profile.pbnStrategy}.
- Công cụ thành thạo: ${profile.toolsUsed.join(", ")}.
- Ghi chú chiến thuật: ${profile.customNotes}.
`.trim();
}
