import fs from "node:fs";
import path from "node:path";

export function loadEnvFile(): void {
  const possiblePaths = [
    path.join(__dirname, "../../.env"),
    path.join(__dirname, "../.env"),
    path.join(__dirname, ".env"),
    path.join(process.cwd(), ".env")
  ];

  console.log("[ENV-BOOTSTRAP] __dirname:", __dirname);
  console.log("[ENV-BOOTSTRAP] cwd:", process.cwd());

  let loaded = false;
  for (const envPath of possiblePaths) {
    console.log("[ENV-BOOTSTRAP] Checking:", envPath, "exists:", fs.existsSync(envPath));
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let value = trimmed.slice(eqIdx + 1).trim();
            value = value.replace(/^["']|["']$/g, "");
            if (key && value) {
              process.env[key] = value;
            }
          }
        }
      });
      loaded = true;
      console.log("[ENV-BOOTSTRAP] Loaded from:", envPath);
      break;
    }
  }

  if (!loaded) {
    console.warn("[ENV-BOOTSTRAP] WARNING: No .env file found! Checked:", possiblePaths);
  }
}

export function logEnvDiagnostics(): void {
  const sttProvider = process.env.STT_PROVIDER?.trim() || "deepgram";
  const answerProvider = process.env.ANSWER_PROVIDER?.trim() || "gemini";
  const deepgramKey = process.env.DEEPGRAM_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const geminiModel = process.env.GEMINI_ANSWER_MODEL?.trim() || "gemini-flash-latest";

  console.log("[ENV]");
  console.log(`STT_PROVIDER=${sttProvider}`);
  console.log(`DEEPGRAM_API_KEY=${deepgramKey ? "configured" : "missing"}`);
  console.log(`ANSWER_PROVIDER=${answerProvider}`);
  console.log(`GEMINI_API_KEY=${geminiKey ? "configured" : "missing"}`);
  console.log(`GEMINI_ANSWER_MODEL=${geminiModel}`);
  if (answerProvider === "groq") {
    console.log(`GROQ_API_KEY=${groqKey ? "configured" : "missing"}`);
  }
  if (answerProvider === "openai") {
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    console.log(`OPENAI_API_KEY=${openaiKey ? "configured" : "missing"}`);
  }
}

export function bootstrapEnv(): void {
  loadEnvFile();
  logEnvDiagnostics();
}
