import { useState } from "react";
import { ArrowLeft, Clock, X } from "lucide-react";
import type { ConversationItem } from "../../shared/types";

interface HistoryDrawerProps {
  isOpen: boolean;
  history: ConversationItem[];
  onClose: () => void;
}

export function HistoryDrawer({ isOpen, history, onClose }: HistoryDrawerProps) {
  const [selectedItem, setSelectedItem] = useState<ConversationItem | undefined>(undefined);

  if (!isOpen) {
    return null;
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="history-drawer-overlay" onClick={onClose}>
      <div className="history-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-header">
          <div className="drawer-title">
            {selectedItem ? (
              <button
                type="button"
                className="drawer-back-button"
                onClick={() => setSelectedItem(undefined)}
              >
                <ArrowLeft size={16} />
                <span>Quay lại danh sách</span>
              </button>
            ) : (
              <>
                <Clock size={16} />
                <span>Lịch sử ({history.length})</span>
              </>
            )}
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Đóng lịch sử">
            <X size={18} />
          </button>
        </header>

        <div className="drawer-content">
          {selectedItem ? (
            <div className="history-detail">
              <div className="detail-meta">
                <span className="detail-time">{formatTime(selectedItem.startedAt)}</span>
              </div>

              <div className="detail-section">
                <h4>Câu hỏi</h4>
                <p className="detail-text bold">{selectedItem.cleanedQuestion ?? selectedItem.rawTranscript}</p>
              </div>

              {selectedItem.correctedTranscript && selectedItem.correctedTranscript !== selectedItem.rawTranscript ? (
                <div className="detail-section">
                  <h4>Bản dịch chuẩn SEO</h4>
                  <p className="detail-text muted">{selectedItem.correctedTranscript}</p>
                </div>
              ) : null}

              {selectedItem.answer ? (
                <div className="detail-section">
                  <h4>Gợi ý trả lời</h4>
                  <p className="detail-text opening">{selectedItem.answer.openingLine}</p>
                  {selectedItem.answer.bullets.length > 0 ? (
                    <ul className="detail-bullets">
                      {selectedItem.answer.bullets.map((b, idx) => (
                        <li key={idx}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : history.length === 0 ? (
            <div className="drawer-empty">Chưa có câu hỏi nào trong lịch sử.</div>
          ) : (
            <div className="history-list">
              {history.map((item) => {
                const questionText = item.cleanedQuestion ?? item.rawTranscript;
                const answerPreview = item.answer?.openingLine;

                return (
                  <div
                    key={item.id}
                    className="history-card"
                    onClick={() => setSelectedItem(item)}
                  >
                    <div className="card-header">
                      <span className="card-time">{formatTime(item.startedAt)}</span>
                    </div>
                    <p className="card-question">{questionText}</p>
                    {answerPreview ? <p className="card-answer-preview">{answerPreview}</p> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
