import React, { useState } from "react";
import { User, BookOpen, Check, X, RotateCcw, Plus, Trash2, ShieldAlert } from "lucide-react";
import { type CandidateProfile, DEFAULT_CANDIDATE_PROFILE } from "../../shared/candidateProfile";
import { getKnowledgeStore } from "../../knowledge/knowledgeStore";
import { ManualTextImporter } from "../../knowledge/importer";
import type { KnowledgeChunk, KnowledgeSourceType } from "../../knowledge/types";

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
  const [activeTab, setActiveTab] = useState<"profile" | "playbook">("profile");
  const [formData, setFormData] = useState<CandidateProfile>(profile);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Playbook note ingestion state
  const [noteContent, setNoteContent] = useState("");
  const [noteSourceName, setNoteSourceName] = useState("Practitioner Case Study");
  const [noteSourceType, setNoteSourceType] = useState<KnowledgeSourceType>("practitioner_playbook");
  const [chunks, setChunks] = useState<KnowledgeChunk[]>(() => getKnowledgeStore().listChunks());
  const [ingestSuccess, setIngestSuccess] = useState(false);

  if (!isOpen) return null;

  const handleChange = (field: keyof CandidateProfile, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: "skills" | "seoSkills" | "tools" | "markets" | "strengths", text: string) => {
    const arr = text.split(",").map((s) => s.trim()).filter(Boolean);
    setFormData((prev) => ({ ...prev, [field]: arr }));
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleResetProfileDefaults = () => {
    setFormData(DEFAULT_CANDIDATE_PROFILE);
  };

  const handleIngestNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    const importer = new ManualTextImporter();
    const newChunks = importer.import({
      sourceType: noteSourceType,
      sourceName: noteSourceName.trim() || "Manual Notes",
      text: noteContent.trim()
    });

    const store = getKnowledgeStore();
    store.addChunks(newChunks);
    setChunks(store.listChunks());
    setNoteContent("");
    setIngestSuccess(true);
    setTimeout(() => setIngestSuccess(false), 2500);
  };

  const handleDeleteChunk = (chunkId: string) => {
    const store = getKnowledgeStore();
    store.deleteChunk(chunkId);
    setChunks(store.listChunks());
  };

  const handleResetPlaybook = () => {
    const store = getKnowledgeStore();
    store.resetToDefault();
    setChunks(store.listChunks());
  };

  return (
    <div className="history-drawer-overlay" style={{ zIndex: 1000 }}>
      <div className="history-drawer" style={{ maxWidth: "520px", width: "95%" }}>
        <header className="history-header" style={{ padding: "12px 16px", borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {activeTab === "profile" ? <User size={18} color="#60a5fa" /> : <BookOpen size={18} color="#34d399" />}
            <h3 style={{ margin: 0, fontSize: "14px", color: "#f1f5f9", fontWeight: 600 }}>
              Knowledge Base & Profile
            </h3>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
          >
            <X size={18} />
          </button>
        </header>

        {/* Tab Switcher */}
        <div style={{ display: "flex", borderBottom: "1px solid #1e293b", background: "#0f172a" }}>
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: "12px",
              background: activeTab === "profile" ? "#1e293b" : "transparent",
              color: activeTab === "profile" ? "#60a5fa" : "#94a3b8",
              border: "none",
              borderBottom: activeTab === "profile" ? "2px solid #60a5fa" : "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            }}
          >
            <User size={14} />
            <span>Hồ sơ Ứng viên (Profile)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("playbook")}
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: "12px",
              background: activeTab === "playbook" ? "#1e293b" : "transparent",
              color: activeTab === "playbook" ? "#34d399" : "#94a3b8",
              border: "none",
              borderBottom: activeTab === "playbook" ? "2px solid #34d399" : "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            }}
          >
            <BookOpen size={14} />
            <span>Kho Playbook Practitioner ({chunks.length})</span>
          </button>
        </div>

        {activeTab === "profile" ? (
          <form
            onSubmit={handleProfileSubmit}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              padding: "14px 16px",
              overflowY: "auto",
              maxHeight: "calc(100vh - 140px)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(96, 165, 250, 0.1)", padding: "6px 10px", borderRadius: "6px" }}>
              <ShieldAlert size={14} color="#60a5fa" />
              <span style={{ fontSize: "11px", color: "#93c5fd" }}>
                Candidate Facts: Chỉ chứa thông tin THẬT của bạn (Web Dev, Technical). Không bịa đặt dự án SEO.
              </span>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#cbd5e1", marginBottom: "3px" }}>
                Họ tên & Vị trí ứng tuyển:
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => handleChange("fullName", e.target.value)}
                  style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "6px", fontSize: "12px" }}
                  placeholder="Họ tên ứng viên"
                />
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) => handleChange("role", e.target.value)}
                  style={{ flex: 2, background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "6px", fontSize: "12px" }}
                  placeholder="SEO Specialist / Technical SEO"
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#cbd5e1", marginBottom: "3px" }}>
                Nền tảng Kỹ thuật & Background cá nhân:
              </label>
              <textarea
                rows={2}
                value={formData.background}
                onChange={(e) => handleChange("background", e.target.value)}
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", resize: "vertical" }}
                placeholder="Nền tảng Web Development vững chắc, kiến trúc web, network debugging..."
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#cbd5e1", marginBottom: "3px" }}>
                Thế mạnh nổi bật (cách nhau dấu phẩy):
              </label>
              <input
                type="text"
                value={formData.strengths.join(", ")}
                onChange={(e) => handleArrayChange("strengths", e.target.value)}
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "6px", fontSize: "12px" }}
                placeholder="Tư duy logic kỹ thuật, bóc tách lỗi crawl/indexing ở tầng code..."
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#cbd5e1", marginBottom: "3px" }}>
                Kỹ năng SEO & Công cụ thành thạo:
              </label>
              <input
                type="text"
                value={formData.tools.join(", ")}
                onChange={(e) => handleArrayChange("tools", e.target.value)}
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "6px", fontSize: "12px" }}
                placeholder="GSC, Ahrefs, Screaming Frog, GA4, Semrush"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#cbd5e1", marginBottom: "3px" }}>
                Ghi chú kinh nghiệm / Định hướng phỏng vấn:
              </label>
              <input
                type="text"
                value={formData.experienceNotes}
                onChange={(e) => handleChange("experienceNotes", e.target.value)}
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "6px", fontSize: "12px" }}
                placeholder="Tư vấn giải pháp và chiến lược tối ưu..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
              <button
                type="button"
                onClick={handleResetProfileDefaults}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}
              >
                <RotateCcw size={13} /> Khôi phục mặc định
              </button>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={onClose}
                  style={{ padding: "5px 10px", fontSize: "11px" }}
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  style={{ padding: "5px 14px", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  {savedSuccess ? <Check size={13} /> : null}
                  <span>{savedSuccess ? "Đã lưu!" : "Lưu Profile"}</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "14px 16px", overflowY: "auto", maxHeight: "calc(100vh - 140px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(52, 211, 153, 0.1)", padding: "6px 10px", borderRadius: "6px" }}>
              <ShieldAlert size={14} color="#34d399" />
              <span style={{ fontSize: "11px", color: "#6ee7b7" }}>
                Practitioner Playbook: Kiến thức thực chiến để tham khảo chiến lược ("em sẽ..."). Không bịa thành kinh nghiệm cá nhân.
              </span>
            </div>

            {/* Ingestion Form */}
            <form onSubmit={handleIngestNote} style={{ display: "flex", flexDirection: "column", gap: "8px", background: "#1e293b", padding: "12px", borderRadius: "8px", border: "1px solid #334155" }}>
              <h4 style={{ margin: 0, fontSize: "12px", color: "#f8fafc", fontWeight: 600 }}>Thêm ghi chú thực chiến mới</h4>

              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={noteSourceName}
                  onChange={(e) => setNoteSourceName(e.target.value)}
                  style={{ flex: 2, background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", padding: "5px 8px", borderRadius: "4px", fontSize: "11px" }}
                  placeholder="Tên nguồn (vd: Case study UU88)"
                />
                <select
                  value={noteSourceType}
                  onChange={(e) => setNoteSourceType(e.target.value as KnowledgeSourceType)}
                  style={{ flex: 1, background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", padding: "5px 8px", borderRadius: "4px", fontSize: "11px" }}
                >
                  <option value="practitioner_playbook">Practitioner Playbook</option>
                  <option value="general_note">General Note</option>
                </select>
              </div>

              <textarea
                rows={3}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "4px", fontSize: "11px", resize: "vertical" }}
                placeholder="Dán nội dung kinh nghiệm thực chiến (hỗ trợ Markdown # tiêu đề, gạch đầu dòng)..."
              />

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  className="primary-action"
                  style={{ padding: "5px 12px", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  {ingestSuccess ? <Check size={13} /> : <Plus size={13} />}
                  <span>{ingestSuccess ? "Đã nạp!" : "Nạp vào Knowledge Store"}</span>
                </button>
              </div>
            </form>

            {/* List Existing Chunks */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
              <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>
                Danh sách Chunks ({chunks.length})
              </span>
              <button
                type="button"
                onClick={handleResetPlaybook}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}
              >
                <RotateCcw size={12} /> Reset về Playbook gốc
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {chunks.map((chunk) => (
                <div
                  key={chunk.id}
                  style={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: chunk.sourceType === "candidate_profile" ? "rgba(96, 165, 250, 0.2)" : "rgba(52, 211, 153, 0.2)",
                          color: chunk.sourceType === "candidate_profile" ? "#93c5fd" : "#6ee7b7",
                          fontWeight: 600,
                          marginRight: "6px"
                        }}
                      >
                        {chunk.topic}
                      </span>
                      <strong style={{ fontSize: "12px", color: "#f8fafc" }}>
                        {chunk.title || chunk.id}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteChunk(chunk.id)}
                      style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", padding: "2px" }}
                      title="Xóa chunk"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p style={{ fontSize: "11px", color: "#cbd5e1", margin: 0, lineHeight: 1.4 }}>
                    {chunk.content.length > 180 ? `${chunk.content.slice(0, 180)}...` : chunk.content}
                  </p>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "2px" }}>
                    {chunk.tags.slice(0, 4).map((t) => (
                      <span key={t} style={{ fontSize: "9px", color: "#94a3b8", background: "#0f172a", padding: "1px 5px", borderRadius: "3px" }}>
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
