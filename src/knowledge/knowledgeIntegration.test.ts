import { describe, expect, it } from "vitest";
import { classifyQuestionIntent } from "../question-detector/intentClassifier";
import { getKnowledgeRetriever } from "./knowledgeRetriever";
import { buildAnswerKnowledgeContext } from "./answerKnowledgeContextBuilder";
import { GeminiAnswerService } from "../llm/geminiAnswerService";
import { DEFAULT_CANDIDATE_PROFILE } from "../shared/candidateProfile";

describe("End-to-End Knowledge Retrieval & Gemini Grounding Integration", () => {
  it("full pipeline: question -> intent -> retrieval -> grounded context -> answer stream", async () => {
    const question = "Site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý thế nào?";

    // 1. Intent classification
    const intent = classifyQuestionIntent(question);
    expect(intent.category).toBe("NO_KEYWORD_SIGNAL");

    // 2. Fast retrieval (< 5ms)
    const retriever = getKnowledgeRetriever();
    const retrievalResult = retriever.retrieve(question, intent);
    expect(retrievalResult.chunks.length).toBeGreaterThan(0);
    expect(retrievalResult.chunks.length).toBeLessThanOrEqual(4);

    // 3. Build grounded context
    const context = buildAnswerKnowledgeContext({
      question,
      intent,
      candidateProfile: DEFAULT_CANDIDATE_PROFILE,
      retrievedChunks: retrievalResult.chunks
    });
    expect(context).toContain("CANDIDATE PERSONAL FACTS");
    expect(context).toContain("STRICT GROUNDING RULES");

    // 4. Mock fetch for Gemini stream
    const sseChunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Dạ với case này góc nhìn thực chiến của em là chưa tăng backlink vội.\\n"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"- Recheck on-page: tối ưu lại Title, Meta Description và đoạn Sapo.\\n- Ép re-index URL và kiểm tra homepage internal links.\\n- Check GSC loại trừ canonical sai."}]}}]}\n\n'
    ];

    const mockFetch = async () => {
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of sseChunks) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        }
      });
      return new Response(stream, { status: 200 });
    };

    const service = new GeminiAnswerService({ apiKey: "test-key", model: "gemini-3.1-flash-lite" }, mockFetch as unknown as typeof fetch);

    const streamGen = service.streamAnswer({
      questionId: "q-test-grounded-001",
      question,
      rawTranscript: question,
      intent,
      profile: DEFAULT_CANDIDATE_PROFILE,
      retrievedChunks: retrievalResult.chunks,
      knowledgeContext: context
    });

    const deltas = [];
    for await (const delta of streamGen) {
      deltas.push(delta);
    }

    expect(deltas.length).toBeGreaterThan(0);
    const finalDelta = deltas.find((d) => d.type === "finalAnswer");
    expect(finalDelta).toBeDefined();
  });
});
