import type { SuggestedAnswer } from "../../shared/types";

export function AnswerPanel({ answer }: { answer: SuggestedAnswer }) {
  const hasAnswer = answer.openingLine || answer.bullets.length > 0 || answer.keywords.length > 0;

  return (
    <section className="panel answer-panel">
      <div className="panel-label">Answer</div>
      {hasAnswer ? (
        <div className="answer-content">
          {answer.openingLine ? <p className="opening-line">{answer.openingLine}</p> : null}
          <ul>
            {answer.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          {answer.keywords.length > 0 ? (
            <div className="keywords">
              {answer.keywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="placeholder">Gợi ý trả lời sẽ xuất hiện từng phần sau khi phát hiện câu hỏi.</p>
      )}
    </section>
  );
}
