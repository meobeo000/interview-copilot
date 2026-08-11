interface QuestionPanelProps {
  rawQuestion: string;
  cleanedQuestion: string;
  topic: string;
  confidence?: number;
}

export function QuestionPanel({ rawQuestion, cleanedQuestion, topic, confidence }: QuestionPanelProps) {
  return (
    <section className="panel question-panel">
      <div className="panel-label">Question</div>
      {cleanedQuestion ? (
        <>
          <p className="clean-question">{cleanedQuestion}</p>
          <div className="question-meta">
            <span>{topic}</span>
            {confidence ? <span>{Math.round(confidence * 100)}% confidence</span> : null}
          </div>
          <details>
            <summary>Raw transcript</summary>
            <p>{rawQuestion}</p>
          </details>
        </>
      ) : (
        <p className="placeholder">Câu hỏi đã hoàn tất sẽ được giữ ở đây khi phần trả lời đang stream.</p>
      )}
    </section>
  );
}
