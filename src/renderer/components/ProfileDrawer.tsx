import React, { useState } from "react";
import { User, Check, X, RotateCcw } from "lucide-react";
import { type CandidateProfile, DEFAULT_CANDIDATE_PROFILE } from "../../shared/candidateProfile";

interface ProfileDrawerProps {
  isOpen: boolean;
  profile: CandidateProfile;
  onClose: () => void;
  onSave: (updated: CandidateProfile) => void;
}

export const ProfileDrawer: React.FC<ProfileDrawerProps> = ({
  isOpen,
  profile,
  onClose,
  onSave
}) => {
  const [formData, setFormData] = useState<CandidateProfile>(profile);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleChange = (field: keyof CandidateProfile, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: "primaryNiches" | "geoMarkets" | "toolsUsed", text: string) => {
    const arr = text.split(",").map((s) => s.trim()).filter(Boolean);
    setFormData((prev) => ({ ...prev, [field]: arr }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleResetDefaults = () => {
    setFormData(DEFAULT_CANDIDATE_PROFILE);
  };

  return (
    <div className="history-drawer-overlay" style={{ zIndex: 1000 }}>
      <div className="history-drawer" style={{ maxWidth: "480px", width: "90%" }}>
        <header className="history-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <User size={18} color="#60a5fa" />
            <h3 style={{ margin: 0, fontSize: "15px", color: "#f1f5f9" }}>
              Hồ Sơ Dự Án Thực Tế (Candidate Profile)
            </h3>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Đóng hồ sơ"
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", overflowY: "auto", maxHeight: "calc(100vh - 120px)" }}>
          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 4px 0" }}>
            Thông tin này được đưa vào ngữ cảnh để Gemini sinh câu trả lời với số liệu và tên dự án thật của bạn (thay vì các ô trống).
          </p>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "4px" }}>
              Vị trí ứng tuyển & Số năm kinh nghiệm:
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={formData.role}
                onChange={(e) => handleChange("role", e.target.value)}
                style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 10px", borderRadius: "6px", fontSize: "12px" }}
                placeholder="Senior SEO Specialist"
              />
              <input
                type="number"
                value={formData.yearsOfExperience}
                onChange={(e) => handleChange("yearsOfExperience", Number(e.target.value))}
                style={{ width: "60px", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "6px", fontSize: "12px" }}
                placeholder="Năm"
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "4px" }}>
              Ngách chuyên môn (cách nhau bởi dấu phẩy):
            </label>
            <input
              type="text"
              value={formData.primaryNiches.join(", ")}
              onChange={(e) => handleArrayChange("primaryNiches", e.target.value)}
              style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 10px", borderRadius: "6px", fontSize: "12px" }}
              placeholder="iGaming, Casino, Sports Betting"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "4px" }}>
              Thị trường (Geo):
            </label>
            <input
              type="text"
              value={formData.geoMarkets.join(", ")}
              onChange={(e) => handleArrayChange("geoMarkets", e.target.value)}
              style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 10px", borderRadius: "6px", fontSize: "12px" }}
              placeholder="Việt Nam, Campuchia, Thái Lan"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "4px" }}>
              Dự án nổi bật & Thành tích số liệu thật:
            </label>
            <textarea
              rows={3}
              value={formData.keyAchievements}
              onChange={(e) => handleChange("keyAchievements", e.target.value)}
              style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 10px", borderRadius: "6px", fontSize: "12px", resize: "vertical" }}
              placeholder="Kéo 3 dự án iGaming lên top 3 sau 4 tháng; traffic 100k visitors/tháng..."
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "4px" }}>
              Ngân sách PBN / Link hàng tháng thường quản lý:
            </label>
            <input
              type="text"
              value={formData.typicalBudget}
              onChange={(e) => handleChange("typicalBudget", e.target.value)}
              style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 10px", borderRadius: "6px", fontSize: "12px" }}
              placeholder="30 - 60 triệu VNĐ/tháng"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "4px" }}>
              Chiến lược PBN & Vệ tinh sở trường:
            </label>
            <textarea
              rows={2}
              value={formData.pbnStrategy}
              onChange={(e) => handleChange("pbnStrategy", e.target.value)}
              style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 10px", borderRadius: "6px", fontSize: "12px", resize: "vertical" }}
              placeholder="Mạng lưới 20 site vệ tinh chuyên ngách, domain DR 25-40 có traffic thật..."
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "4px" }}>
              Ghi chú chiến thuật thêm:
            </label>
            <input
              type="text"
              value={formData.customNotes}
              onChange={(e) => handleChange("customNotes", e.target.value)}
              style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 10px", borderRadius: "6px", fontSize: "12px" }}
              placeholder="Ưu tiên cấu trúc silo chuẩn, entity đa tầng..."
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
            <button
              type="button"
              onClick={handleResetDefaults}
              style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
            >
              <RotateCcw size={14} /> Khôi phục mặc định
            </button>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="secondary-action"
                onClick={onClose}
                style={{ padding: "6px 12px", fontSize: "12px" }}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="primary-action"
                style={{ padding: "6px 16px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                {savedSuccess ? <Check size={14} /> : null}
                <span>{savedSuccess ? "Đã lưu!" : "Lưu Profile"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
