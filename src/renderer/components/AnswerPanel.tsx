import type { SuggestedAnswer } from "../../shared/types";

interface AnswerPanelProps {
  answer: SuggestedAnswer;
  isAnswering?: boolean;
}

export function AnswerPanel({ answer, isAnswering = false }: AnswerPanelProps) {
  const hasContent =
    Boolean(answer.openingLine) ||
    answer.bullets.length > 0 ||
    Boolean(answer.streamingText);

  return (
    <section className="panel answer-panel">
      <div className="panel-label">GỢI Ý TRẢ LỜI</div>
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
