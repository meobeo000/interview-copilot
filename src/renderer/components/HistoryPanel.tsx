import type { ConversationItem } from "../../shared/types";

export function HistoryPanel({ items }: { items: ConversationItem[] }) {
  return (
    <section className="history-band">
      <div className="panel-label">Last 5</div>
      {items.length === 0 ? (
        <p className="placeholder compact">Chưa có Q&A nào.</p>
      ) : (
        <div className="history-list">
          {items.map((item) => (
            <article className="history-item" key={item.id}>
              <strong>{item.cleanedQuestion}</strong>
              <span>{item.answer?.openingLine}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
