import { useState, useEffect } from "react";
import {
  X,
  Plus,
  Copy,
  Save,
  Trash2,
  Play,
  Briefcase,
  CheckCircle2
} from "lucide-react";
import {
  type SessionConfig,
  type SessionType,
  type QuestionType,
  type AnswerFormat,
  type AnswerLength,
  type AnswerTone,
  type SessionLanguage
} from "../../shared/sessionConfig";

interface SessionDrawerProps {
  isOpen: boolean;
  sessions: SessionConfig[];
  activeSession: SessionConfig;
  onClose: () => void;
  onSelectAndStart: (session: SessionConfig) => void;
  onCreateSession: () => void;
  onSaveSession: (session: SessionConfig) => void;
  onDuplicateSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export function SessionDrawer({
  isOpen,
  sessions,
  activeSession,
  onClose,
  onSelectAndStart,
  onCreateSession,
  onSaveSession,
  onDuplicateSession,
  onDeleteSession
}: SessionDrawerProps) {
  const [selectedId, setSelectedId] = useState<string>(activeSession.id);
  const [draft, setDraft] = useState<SessionConfig>(activeSession);
  const [docInput, setDocInput] = useState<string>("");
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    const current = sessions.find((s) => s.id === selectedId) || activeSession;
    setDraft({ ...current });
  }, [selectedId, sessions, activeSession]);

  if (!isOpen) return null;

  const handleFieldChange = <K extends keyof SessionConfig>(field: K, value: SessionConfig[K]) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
      updatedAt: Date.now()
    }));
  };

  const handleAddDoc = () => {
    if (!docInput.trim()) return;
    if (!draft.knowledgeDocuments.includes(docInput.trim())) {
      handleFieldChange("knowledgeDocuments", [...draft.knowledgeDocuments, docInput.trim()]);
    }
    setDocInput("");
  };

  const handleRemoveDoc = (doc: string) => {
    handleFieldChange(
      "knowledgeDocuments",
      draft.knowledgeDocuments.filter((d) => d !== doc)
    );
  };

  const handleSave = () => {
    onSaveSession(draft);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleStart = () => {
    onSaveSession(draft);
    onSelectAndStart(draft);
    onClose();
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div
        className="drawer-content session-drawer"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "680px", maxWidth: "90vw", display: "flex", flexDirection: "column", maxHeight: "90vh" }}
      >
        {/* Drawer Header */}
        <div className="drawer-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334155", paddingBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Briefcase size={20} color="#38bdf8" />
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#f8fafc", margin: 0 }}>Cấu hình Phiên Phỏng vấn (Phase 1)</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        {/* Main Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", marginTop: "12px", gap: "16px" }}>
          {/* Left Session List */}
          <div style={{ width: "200px", borderRight: "1px solid #334155", paddingRight: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              type="button"
              className="accent-action"
              style={{ width: "100%", justifyContent: "center", fontSize: "12px", padding: "6px" }}
              onClick={onCreateSession}
            >
              <Plus size={14} />
              <span>Tạo phiên mới</span>
            </button>
            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
              {sessions.map((s) => {
                const isActive = s.id === activeSession.id;
                const isSelected = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    style={{
                      textAlign: "left",
                      padding: "8px",
                      borderRadius: "6px",
                      background: isSelected ? "#1e293b" : "transparent",
                      border: isSelected ? "1px solid #38bdf8" : "1px solid #334155",
                      cursor: "pointer",
                      color: "#f8fafc"
                    }}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <div style={{ fontSize: "12px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: "10px", color: "#94a3b8", display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                      <span>{s.company}</span>
                      {isActive && <span style={{ color: "#22c55e", fontWeight: "600" }}>● Active</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Session Form Editor */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "8px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Session Info */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "8px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Tên phiên</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => handleFieldChange("name", e.target.value)}
                  style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "4px", fontSize: "12px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Loại cuộc gọi</label>
                <select
                  value={draft.sessionType}
                  onChange={(e) => handleFieldChange("sessionType", e.target.value as SessionType)}
                  style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "4px", fontSize: "12px" }}
                >
                  <option value="INTERVIEW">Interview</option>
                  <option value="REGULAR_CALL">Regular Call</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Công ty ứng tuyển</label>
                <input
                  type="text"
                  value={draft.company}
                  onChange={(e) => handleFieldChange("company", e.target.value)}
                  style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "4px", fontSize: "12px" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Vị trí / Job Description</label>
                <input
                  type="text"
                  value={draft.jobDescription}
                  onChange={(e) => handleFieldChange("jobDescription", e.target.value)}
                  style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "4px", fontSize: "12px" }}
                />
              </div>
            </div>

            {/* Resume & Custom Instructions */}
            <div>
              <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Thông tin Resume / Kinh nghiệm ứng viên</label>
              <textarea
                rows={2}
                value={draft.resume}
                onChange={(e) => handleFieldChange("resume", e.target.value)}
                style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "4px", fontSize: "12px", resize: "vertical" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Custom Instructions (Chỉ thị trả lời riêng)</label>
              <textarea
                rows={2}
                value={draft.customInstructions}
                onChange={(e) => handleFieldChange("customInstructions", e.target.value)}
                style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", padding: "6px 8px", borderRadius: "4px", fontSize: "12px", resize: "vertical" }}
              />
            </div>

            {/* Knowledge Documents */}
            <div>
              <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Tài liệu tri thức / Practitioner Playbooks</label>
              <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                <input
                  type="text"
                  placeholder="VD: domain-hunting-playbook, pbn-timing..."
                  value={docInput}
                  onChange={(e) => setDocInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddDoc();
                    }
                  }}
                  style={{ flex: 1, background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", padding: "4px 8px", borderRadius: "4px", fontSize: "11px" }}
                />
                <button type="button" onClick={handleAddDoc} className="accent-action" style={{ fontSize: "11px", padding: "4px 8px" }}>
                  Thêm
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {draft.knowledgeDocuments.map((doc) => (
                  <span
                    key={doc}
                    style={{ background: "#1e293b", border: "1px solid #475569", color: "#38bdf8", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    {doc}
                    <button type="button" onClick={() => handleRemoveDoc(doc)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0 }}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Answer Strategy & Format Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", background: "#0f172a", padding: "10px", borderRadius: "6px", border: "1px solid #334155" }}>
              <div>
                <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "2px" }}>Loại câu hỏi</label>
                <select
                  value={draft.questionType}
                  onChange={(e) => handleFieldChange("questionType", e.target.value as QuestionType)}
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #475569", color: "#f8fafc", padding: "4px", borderRadius: "4px", fontSize: "11px" }}
                >
                  <option value="TECHNICAL">Technical</option>
                  <option value="BEHAVIORAL">Behavioral</option>
                  <option value="SITUATIONAL">Situational</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "2px" }}>Format trả lời</label>
                <select
                  value={draft.answerFormat}
                  onChange={(e) => handleFieldChange("answerFormat", e.target.value as AnswerFormat)}
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #475569", color: "#f8fafc", padding: "4px", borderRadius: "4px", fontSize: "11px" }}
                >
                  <option value="SCRIPT_AND_BULLETS">Script + Bullets</option>
                  <option value="FULL_SCRIPT">Full Script</option>
                  <option value="BULLETS">Bullets Only</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "2px" }}>Độ dài</label>
                <select
                  value={draft.length}
                  onChange={(e) => handleFieldChange("length", e.target.value as AnswerLength)}
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #475569", color: "#f8fafc", padding: "4px", borderRadius: "4px", fontSize: "11px" }}
                >
                  <option value="SHORT">Short (Ngắn)</option>
                  <option value="BALANCED">Balanced (Cân bằng)</option>
                  <option value="LONG">Long (Chi tiết)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "2px" }}>Tone giọng</label>
                <select
                  value={draft.tone}
                  onChange={(e) => handleFieldChange("tone", e.target.value as AnswerTone)}
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #475569", color: "#f8fafc", padding: "4px", borderRadius: "4px", fontSize: "11px" }}
                >
                  <option value="SIMPLE">Simple (Tự nhiên)</option>
                  <option value="FORMAL">Formal (Chuyên nghiệp)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "2px" }}>Mô hình AI</label>
                <select
                  value={draft.model}
                  onChange={(e) => handleFieldChange("model", e.target.value)}
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #475569", color: "#f8fafc", padding: "4px", borderRadius: "4px", fontSize: "11px" }}
                >
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "2px" }}>Ngôn ngữ</label>
                <select
                  value={draft.language}
                  onChange={(e) => handleFieldChange("language", e.target.value as SessionLanguage)}
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #475569", color: "#f8fafc", padding: "4px", borderRadius: "4px", fontSize: "11px" }}
                >
                  <option value="vi">Tiếng Việt (vi)</option>
                  <option value="en">English (en)</option>
                </select>
              </div>
            </div>

            {/* Toggles */}
            <div style={{ display: "flex", gap: "16px", background: "#0f172a", padding: "8px 12px", borderRadius: "6px", border: "1px solid #334155" }}>
              <label style={{ fontSize: "11px", color: "#f8fafc", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.starMethod}
                  onChange={(e) => handleFieldChange("starMethod", e.target.checked)}
                />
                STAR Method
              </label>
              <label style={{ fontSize: "11px", color: "#f8fafc", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.autoAnswer}
                  onChange={(e) => handleFieldChange("autoAnswer", e.target.checked)}
                />
                Tự động trả lời (Auto Answer)
              </label>
              <label style={{ fontSize: "11px", color: "#f8fafc", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.saveTranscript}
                  onChange={(e) => handleFieldChange("saveTranscript", e.target.checked)}
                />
                Lưu Transcript
              </label>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #334155", paddingTop: "12px", marginTop: "12px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="icon-button"
              title="Nhân bản phiên này"
              onClick={() => onDuplicateSession(draft.id)}
            >
              <Copy size={16} />
              <span style={{ fontSize: "11px", marginLeft: "4px" }}>Nhân bản</span>
            </button>
            {sessions.length > 1 && (
              <button
                type="button"
                className="icon-button"
                title="Xóa phiên này"
                style={{ color: "#ef4444" }}
                onClick={() => onDeleteSession(draft.id)}
              >
                <Trash2 size={16} />
                <span style={{ fontSize: "11px", marginLeft: "4px" }}>Xóa</span>
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {saveSuccess && (
              <span style={{ color: "#22c55e", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
                <CheckCircle2 size={14} /> Đã lưu
              </span>
            )}
            <button
              type="button"
              className="history-button"
              onClick={handleSave}
            >
              <Save size={14} />
              <span>Lưu</span>
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={handleStart}
            >
              <Play size={14} />
              <span>Bắt đầu phiên phỏng vấn</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
