import type { AnswerDelta, AnswerRequest, AnswerService } from "./types";
import type { SuggestedAnswer } from "../shared/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockAnswerService implements AnswerService {
  readonly providerName = "mock";
  readonly modelName = "mock-model";

  async *streamAnswer(request: AnswerRequest): AsyncGenerator<AnswerDelta, SuggestedAnswer, void> {
    void request.recentHistory;

    const answer: SuggestedAnswer = {
      openingLine:
        "Em sẽ khoanh vùng nguyên nhân bằng dữ liệu trước, rồi mới ưu tiên các lỗi có thể làm mất index hoặc giảm tín hiệu ranking.",
      bullets: [
        "GSC: tách page/query/device/country để biết traffic giảm ở đâu và Impression hay Position thay đổi.",
        "Đối chiếu timeline Core Update với GA4 để loại trừ seasonality, tracking lỗi hoặc thay đổi landing page.",
        "Kiểm tra indexing, canonical, robots.txt, sitemap, 301 và 404 vì đây là nhóm lỗi cần xử lý sớm.",
        "Dùng Ahrefs để xem lost referring domain, anchor text bất thường và backlink spam có trùng thời điểm không.",
        "Đánh giá lại search intent, content quality và cannibalization trước khi sửa content hàng loạt.",
        "Nếu nghi negative SEO, em thu thập bằng chứng trước; chỉ disavow khi link rõ ràng độc hại và không thể gỡ."
      ],
      keywords: ["GSC", "GA4", "Core Update", "Indexing", "Canonical", "Backlink", "Ahrefs", "Disavow"],
      confidence: 0.9
    };

    await sleep(20);
    yield { type: "openingLine", value: answer.openingLine };

    for (const bullet of answer.bullets) {
      await sleep(20);
      yield { type: "bullet", value: bullet };
    }

    await sleep(20);
    yield { type: "keywords", value: answer.keywords };
    yield { type: "confidence", value: answer.confidence ?? 0.9 };

    return answer;
  }
}
