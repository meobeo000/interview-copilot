import type { TranscriptCallbacks, TranscriptChunk } from "../shared/types";
import type { TranscriptionService } from "./types";

const script = [
  "Theo em nếu một website bị giảm khoảng 40% organic traffic sau Core Update, ",
  "em sẽ kiểm tra những tín hiệu nào đầu tiên trong GSC và GA4? ",
  "Sau đó em đánh giá backlink, search intent và cannibalization như thế nào?",
  "Giả sử Ahrefs báo mất nhiều referring domain, anchor text thay đổi mạnh, ",
  "và một số trang quan trọng bị canonical sai hoặc redirect 301 qua URL mới, ",
  "em ưu tiên xử lý thế nào để tránh indexing bị ảnh hưởng thêm?",
  "Nếu robots.txt vô tình chặn sitemap hoặc một nhóm URL trả 404, ",
  "em sẽ giải thích với team dev và đo lại kết quả ra sao?",
  "Cuối cùng, nếu nghi ngờ negative SEO từ expired domain, ",
  "em có disavow ngay không hay cần bằng chứng gì trước?"
];

export class MockTranscriptService implements TranscriptionService {
  start(callbacks: TranscriptCallbacks) {
    let stopped = false;
    const timers: number[] = [];
    const startedAt = Date.now();
    let aggregate = "";
    let delay = 150;

    const schedule = (callback: () => void, timeout: number) => {
      const timer = window.setTimeout(callback, timeout);
      timers.push(timer);
    };

    script.forEach((segment, index) => {
      const words = segment.split(/(\s+)/).filter(Boolean);
      let partial = "";

      words.forEach((word) => {
        delay += word.trim() ? 78 : 16;
        schedule(() => {
          if (stopped) {
            return;
          }
          partial += word;
          callbacks.onPartial({
            text: aggregate + partial,
            isFinal: false,
            confidence: 0.88,
            startedAt
          });
        }, delay);
      });

      delay += index === 0 || index === 3 || index === 6 ? 680 : 260;
      schedule(() => {
        if (stopped) {
          return;
        }
        aggregate += segment;
        const chunk: TranscriptChunk = {
          text: aggregate.trim(),
          isFinal: true,
          confidence: 0.91,
          startedAt,
          completedAt: Date.now()
        };
        callbacks.onFinal(chunk);
      }, delay);
    });

    schedule(() => {
      if (!stopped) {
        callbacks.onComplete();
      }
    }, delay + 350);

    return {
      stop: () => {
        stopped = true;
        timers.forEach((timer) => window.clearTimeout(timer));
      }
    };
  }

  resetTurn(): void {}
}
