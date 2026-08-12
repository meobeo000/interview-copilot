import type { SuggestedAnswer } from "../../shared/types";

export function AnswerPanel({ answer }: { answer: SuggestedAnswer }) {
  const hasAnswer =
    Boolean(answer.streamingText) ||
    Boolean(answer.openingLine) ||
    answer.bullets.length > 0 ||
    answer.keywords.length > 0;

  return (
    <section className="panel answer-panel">
      <div className="panel-label">Answer</div>
      {hasAnswer ? (
        <div className="answer-content">
          {answer.streamingText && !answer.openingLine ? (
            <p className="opening-line streaming-live">{answer.streamingText}</p>
          ) : (
            <>
              {answer.openingLine ? <p className="opening-line">{answer.openingLine}</p> : null}
              {answer.bullets.length > 0 ? (
                <ul>
                  {answer.bullets.map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
              {answer.keywords.length > 0 ? (
                <div className="keywords">
                  {answer.keywords.map((keyword, idx) => (
                    <span key={idx}>{keyword}</span>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <p className="placeholder">Gợi ý trả lời sẽ xuất hiện từng phần sau khi phát hiện câu hỏi.</p>
      )}
    </section>
  );
}
