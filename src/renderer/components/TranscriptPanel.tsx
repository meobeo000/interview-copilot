export function TranscriptPanel({ transcript }: { transcript: string }) {
  return (
    <section className="panel transcript-panel">
      <div className="panel-label">Live transcript</div>
      <p className={transcript ? "streaming-text" : "placeholder"}>
        {transcript || "Nhấn Listen để chạy mô phỏng câu hỏi SEO tiếng Việt."}
      </p>
    </section>
  );
}
