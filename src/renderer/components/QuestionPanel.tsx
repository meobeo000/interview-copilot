interface QuestionPanelProps {
  rawQuestion: string;
  cleanedQuestion: string;
  topic?: string;
  confidence?: number;
}

export function QuestionPanel({ rawQuestion, cleanedQuestion }: QuestionPanelProps) {
  const displayQuestion = cleanedQuestion || rawQuestion;

  return (
    <section className="panel question-panel">
      <div className="panel-label">CÂU HỎI HIỆN TẠI</div>
      {displayQuestion ? (
        <div className="question-content">
          <p className="clean-question">“{displayQuestion}”</p>
          {rawQuestion && rawQuestion !== cleanedQuestion ? (
            <details className="raw-transcript-details">
              <summary>Transcript gốc</summary>
              <p>{rawQuestion}</p>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="placeholder">Chưa có câu hỏi...</p>
      )}
    </section>
  );
}
