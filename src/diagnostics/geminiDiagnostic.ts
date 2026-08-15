import fs from "node:fs";
import path from "node:path";
import { FAST_SEO_INTERVIEW_SYSTEM_PROMPT } from "../llm/prompts/fastSeoInterviewPrompt";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

async function runGeminiDiagnostic() {
  loadEnv();

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const model = (process.env.GEMINI_ANSWER_MODEL || "gemini-3.1-flash-lite").trim();
  const testQuestion = "Site mở bot hai tuần vẫn chưa nhận keyword thì em xử lý thế nào?";

  console.log("[GEMINI DIAGNOSTIC]");
  console.log(`provider: gemini`);
  console.log(`model: ${model}`);
  console.log(`apiKeyConfigured: ${apiKey.length > 0 ? "true" : "false"}`);

  if (!apiKey) {
    console.error("DIAGNOSTIC FAILURE: GEMINI_API_KEY is missing in environment/.env");
    process.exit(1);
  }

  const requestStartedAt = Date.now();
  console.log(`requestStartedAt: ${new Date(requestStartedAt).toISOString()}`);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

  const payload = {
    system_instruction: {
      parts: [{ text: FAST_SEO_INTERVIEW_SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: `Interviewer Question:\n"${testQuestion}"` }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 350
    }
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`DIAGNOSTIC FAILURE: Network connection error: ${msg.replace(apiKey, "[REDACTED]")}`);
    process.exit(1);
  }

  const headersReceivedAt = Date.now();
  console.log(`httpStatus: ${response.status} ${response.statusText}`);
  console.log(`headersReceivedAt: +${headersReceivedAt - requestStartedAt} ms`);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error(`DIAGNOSTIC FAILURE: HTTP ${response.status}`);
    console.error(`Error details: ${errorBody.replace(apiKey, "[REDACTED]")}`);
    process.exit(1);
  }

  if (!response.body) {
    console.error("DIAGNOSTIC FAILURE: Response body is null");
    process.exit(1);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let firstSseEventAt: number | undefined;
  let firstTextChunkAt: number | undefined;
  let firstText = "";
  let accumulatedText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;

      if (trimmed.startsWith("data: ")) {
        if (firstSseEventAt === undefined) {
          firstSseEventAt = Date.now();
          console.log(`firstSseEventAt: +${firstSseEventAt - requestStartedAt} ms`);
        }

        const jsonStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(jsonStr) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>;
              };
              finishReason?: string;
            }>;
            error?: { message?: string };
          };

          if (parsed.error?.message) {
            console.error(`DIAGNOSTIC FAILURE: API error in SSE: ${parsed.error.message.replace(apiKey, "[REDACTED]")}`);
            process.exit(1);
          }

          const parts = parsed.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const p of parts) {
              if (p.text) {
                accumulatedText += p.text;
                if (firstTextChunkAt === undefined) {
                  firstTextChunkAt = Date.now();
                  firstText = p.text.trim();
                  console.log(`firstTextChunkAt: +${firstTextChunkAt - requestStartedAt} ms`);
                  console.log(`firstText: "${firstText.slice(0, 80)}"`);
                }
              }
            }
          }
        } catch {
          // Ignore incomplete chunk parse
        }
      }
    }
  }

  const completedAt = Date.now();
  const totalMs = completedAt - requestStartedAt;
  console.log(`completedAt: ${new Date(completedAt).toISOString()}`);
  console.log(`totalMs: ${totalMs} ms`);

  if (!accumulatedText.trim()) {
    console.error("DIAGNOSTIC FAILURE: Stream completed with empty text response.");
    process.exit(1);
  }

  console.log("\n--- Generated Answer ---");
  console.log(accumulatedText);
  console.log("------------------------");
  console.log("\nDIAGNOSTIC SUCCESS: Gemini AnswerService is working properly.");
  process.exit(0);
}

void runGeminiDiagnostic();
