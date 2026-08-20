import type { SuggestedAnswer } from "../../shared/types";

interface AnswerPanelProps {
  answer: SuggestedAnswer;
  isAnswering?: boolean;
  onShorter?: () => void;
  onTechnical?: () => void;
  onExplainWhy?: () => void;
  onGiveExample?: () => void;
  onDefend?: () => void;
}

export function AnswerPanel({
  answer,
  isAnswering = false,
  onShorter,
  onTechnical,
  onExplainWhy,
  onGiveExample,
  onDefend
}: AnswerPanelProps) {
  const hasContent =
    Boolean(answer.openingLine) ||
    answer.bullets.length > 0 ||
    Boolean(answer.streamingText);

  return (
    <section className="panel answer-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <div className="panel-label" style={{ margin: 0 }}>GỢI Ý TRẢ LỜI</div>
        {hasContent && !isAnswering && (onShorter || onTechnical || onExplainWhy || onGiveExample || onDefend) && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {onShorter && (
              <button
                type="button"
                className="stepper-btn"
                style={{ fontSize: "11px", padding: "2px 6px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8" }}
                onClick={onShorter}
                title="Rút ngắn câu trả lời"
              >
                ⚡ Ngắn hơn
              </button>
            )}
            {onTechnical && (
              <button
                type="button"
                className="stepper-btn"
                style={{ fontSize: "11px", padding: "2px 6px", background: "rgba(168, 85, 247, 0.15)", color: "#c084fc" }}
                onClick={onTechnical}
                title="Thêm chi tiết kỹ thuật chuyên sâu"
              >
                🔧 Technical
              </button>
            )}
            {onExplainWhy && (
              <button
                type="button"
                className="stepper-btn"
                style={{ fontSize: "11px", padding: "2px 6px", background: "rgba(234, 179, 8, 0.15)", color: "#facc15" }}
                onClick={onExplainWhy}
                title="Giải thích nguyên nhân & nguyên lý"
              >
                💡 Giải thích
              </button>
            )}
            {onGiveExample && (
              <button
                type="button"
                className="stepper-btn"
                style={{ fontSize: "11px", padding: "2px 6px", background: "rgba(34, 197, 94, 0.15)", color: "#4ade80" }}
                onClick={onGiveExample}
                title="Thêm ví dụ thực chiến"
              >
                📌 Ví dụ
              </button>
            )}
            {onDefend && (
              <button
                type="button"
                className="stepper-btn"
                style={{ fontSize: "11px", padding: "2px 6px", background: "rgba(244, 63, 94, 0.15)", color: "#fb7185" }}
                onClick={onDefend}
                title="Thêm luận điểm phản biện dự phòng"
              >
                🛡️ Phản biện
              </button>
            )}
          </div>
        )}
      </div>

      {hasContent ? (
        <div className="answer-content">
          {answer.streamingText && !answer.openingLine ? (
            <p className="opening-line streaming-live">{answer.streamingText}</p>
          ) : (
            <>
              {answer.openingLine ? <p className="opening-line">{answer.openingLine}</p> : null}
              {answer.bullets.length > 0 ? (
                <ul className="answer-bullets">
                  {answer.bullets.map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
              {answer.keywords && answer.keywords.length > 0 ? (
                <div className="keywords">
                  {answer.keywords.slice(0, 5).map((keyword, idx) => (
                    <span key={idx} className="keyword-chip">
                      {keyword}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : isAnswering ? (
        <div className="answer-loading">
          <span className="loading-dot" />
          <p className="placeholder loading-text">Đang tạo câu trả lời...</p>
        </div>
      ) : (
        <p className="placeholder">Gợi ý trả lời sẽ xuất hiện khi phát hiện câu hỏi.</p>
      )}
    </section>
  );
}
