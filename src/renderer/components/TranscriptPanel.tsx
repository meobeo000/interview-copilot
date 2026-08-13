interface TranscriptPanelProps {
  transcript: string;
  isListening?: boolean;
}

export function TranscriptPanel({ transcript, isListening = false }: TranscriptPanelProps) {
  return (
    <section className="panel transcript-panel">
      <div className="panel-label">ĐANG NGHE</div>
      <div className="transcript-box">
        <p className={transcript ? "streaming-text" : "placeholder"}>
          {transcript || (isListening ? "Đang chờ câu hỏi..." : "Nhấn Bắt đầu nghe để bắt đầu.")}
        </p>
      </div>
    </section>
  );
}
