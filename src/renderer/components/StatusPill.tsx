import type { AppStatus } from "../../shared/types";

const statusLabel: Record<AppStatus, string> = {
  Idle: "Tạm dừng",
  Listening: "Đang nghe",
  PossibleEnd: "Đang phân tích...",
  FinalizingQuestion: "Đang chốt câu hỏi...",
  QuestionReady: "Đã có câu hỏi",
  Processing: "Đang xử lý...",
  Answering: "Đang tạo câu trả lời...",
  Error: "Lỗi kết nối"
};

export function StatusPill({ status }: { status: AppStatus }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <span className="status-dot" />
      <span>{statusLabel[status] ?? status}</span>
    </span>
  );
}
