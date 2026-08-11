# Interview Copilot — MVP Product & Technical Spec

## Goal
Build a Windows-first desktop interview copilot optimized for live SEO interviews on Google Meet or Telegram calls.

Primary UX:
1. Capture system audio from the call.
2. Show the interviewer's speech as live streaming transcript while they are talking.
3. Detect when the interviewer has finished a question.
4. Keep the captured question visible on screen.
5. Analyze the completed question using recent conversation context.
6. Stream a concise suggested answer underneath the question.
7. Preserve the last 5 question/answer pairs for quick review.

Latency target: first useful answer text should appear about 1–2 seconds after the interviewer finishes speaking under normal network conditions.

## P0 — Vietnamese-first transcription
Vietnamese is a core product requirement, not an optional language add-on.

The real STT implementation MUST be selected and validated primarily for Vietnamese interview speech.

It must handle:
- Natural Vietnamese conversation.
- Fast speech and words that sound connected together.
- Minor hesitation, filler words and incomplete phrases.
- Reasonable variation in Vietnamese regional accents.
- Vietnamese mixed with English SEO terminology in the same sentence.
- Common interview-call audio degradation such as compression, low volume and moderate background noise.

Important mixed-language examples include:
- backlink
- referring domain
- anchor text
- Google Search Console / GSC
- GA4
- Ahrefs
- Semrush
- Core Update
- Helpful Content
- canonical
- crawl budget
- robots.txt
- sitemap
- redirect 301
- 404
- indexing / deindex
- negative SEO
- expired domain
- internal linking
- search intent
- cannibalization

The system does NOT need perfect word-for-word transcription to answer correctly, but it must preserve the intended meaning of the interviewer question.

If transcription or question interpretation confidence is low, the system must show that uncertainty and continue listening rather than inventing a question.

Vietnamese production readiness must be tested using real Vietnamese audio. English-only demo audio is not sufficient for acceptance.

## Product principles
- Windows-first.
- Vietnamese-first for transcription and interview answer generation.
- One compact always-on-top overlay, not a dashboard-heavy app.
- Live transcript must remain readable while the interviewer is speaking.
- Completed question must remain visible while the answer streams.
- Prefer short speaking cues and bullet points over long paragraphs.
- Preserve raw transcript separately from cleaned/interpreted question.
- Do not fabricate user experience or credentials.
- Keep API keys out of the renderer process.
- Optimize latency before adding secondary features.

## MVP scope
### In scope
- Electron desktop app.
- React + TypeScript renderer.
- Frameless always-on-top overlay.
- Global shortcut to show/hide overlay.
- Live transcript area.
- Question area.
- AI answer area.
- Last 5 Q&A items in local history.
- Mock audio/transcript/AI pipeline in Phase 1.
- Real Windows system-audio capture in Phase 2.
- Streaming Vietnamese-first transcription with mixed English SEO terminology in Phase 3.
- End-of-question detection.
- Streaming AI answer.
- Optional interview context: CV/JD/SEO profile pasted locally.

### Out of scope for first MVP
- Authentication.
- Cloud database.
- Multi-user accounts.
- Billing.
- Screenshot analysis.
- Mobile app.
- Meeting bot joining Google Meet/Telegram.

## Recommended stack
- Electron
- React
- TypeScript
- Vite
- Zustand
- Electron IPC between main and renderer
- Windows audio capture via WASAPI loopback or a proven Electron-compatible Windows system-audio approach
- A streaming STT provider chosen after Vietnamese-specific evaluation
- OpenAI model for question interpretation and answer generation
- Local JSON or lightweight local storage for settings/history initially

Do not lock the final STT provider before testing Vietnamese accuracy, mixed Vietnamese/English SEO vocabulary and latency using real call audio.

## Runtime architecture
```text
Google Meet / Telegram
        |
        v
Windows system audio
        |
        v
Streaming audio capture
        |
        v
Vietnamese-first Streaming STT ----> Live transcript UI
        |
        v
Rolling transcript buffer
        |
        v
End-of-question detector
        |
        v
Question normalizer / context builder
        |
        v
LLM answer stream -----------------> Answer UI
```

Important: do not wait for a full audio recording before transcription. The pipeline must remain streaming.

## UI layout
Single compact overlay:

```text
+--------------------------------------------------+
| Listening / status                               |
|                                                  |
| LIVE TRANSCRIPT                                  |
| Interviewer speech appears here while speaking.  |
|                                                  |
+--------------------------------------------------+
| QUESTION                                         |
| Completed question stays visible here.           |
|                                                  |
+--------------------------------------------------+
| ANSWER                                           |
| Opening sentence                                 |
| - bullet                                         |
| - bullet                                         |
| - bullet                                         |
| Keywords: GSC / indexing / backlinks / ...      |
+--------------------------------------------------+
```

Controls should be minimal:
- Listen / Pause
- Answer / Regenerate
- History
- Hide

Global shortcut recommendation:
- Alt+Space: toggle overlay

## Conversation item model
```ts
interface ConversationItem {
  id: string;
  startedAt: number;
  completedAt?: number;
  rawTranscript: string;
  cleanedQuestion?: string;
  detectedTopic?: string;
  questionConfidence?: number;
  answer?: SuggestedAnswer;
}

interface SuggestedAnswer {
  openingLine: string;
  bullets: string[];
  keywords: string[];
  confidence?: number;
}
```

## Transcript behavior
While speaking:
- Show partial transcript continuously.
- Do not overwrite already-finalized transcript segments incorrectly.
- Preserve Vietnamese diacritics where supported by STT output.
- Support Vietnamese mixed naturally with English SEO terms.
- Keep enough rolling context to recover meaning from imperfect partial transcripts.

When question ends:
- Freeze/store raw transcript.
- Produce cleanedQuestion separately.
- Never destroy rawTranscript.
- Keep question visible while AI answer streams.
- Use recent context to repair minor STT mistakes without silently rewriting the raw transcript.

## End-of-question behavior
Do not rely on silence alone.

Use a combination of:
- Voice activity detection / end-of-speech signal.
- Short silence threshold roughly 500–800 ms as a candidate boundary.
- Semantic completeness check so pauses in the middle of a sentence do not prematurely trigger answering.

Examples:
- "Theo em backlink..." + pause => continue listening.
- "Theo em backlink hiện tại còn quan trọng với SEO không?" + pause => finalize question.

## AI behavior
The model should receive:
- Current completed transcript.
- Last 2–5 relevant conversation items.
- Optional user profile/JD context.
- SEO vocabulary hints.

The model should:
- Infer intended question despite minor Vietnamese transcription errors.
- Handle Vietnamese sentences containing English SEO terminology.
- Return low confidence rather than inventing a question.
- Answer in concise Vietnamese suitable for natural speech.
- Keep established SEO terms in English where natural.
- Prefer 4–7 concise bullets.
- Return an opening sentence the user can say immediately.

Suggested structured output:
```json
{
  "isQuestion": true,
  "confidence": 0.93,
  "cleanedQuestion": "Nếu website giảm 40% traffic sau Core Update thì bạn kiểm tra gì trước?",
  "topic": "Technical SEO / Core Update",
  "openingLine": "Đầu tiên em sẽ xác định chính xác phạm vi traffic giảm trước khi kết luận nguyên nhân.",
  "bullets": [
    "GSC: xác định page/query/device/country giảm",
    "So sánh Impression và Position để phân biệt demand với ranking",
    "Đối chiếu timeline với Google updates",
    "Kiểm tra indexing/crawl/canonical/robots",
    "Đánh giá content intent và cannibalization",
    "Kiểm tra lost links, spam links và anchor changes"
  ],
  "keywords": ["GSC", "Core Update", "Indexing", "Content Intent", "Backlinks"]
}
```

## Security
- No OpenAI/API secret in React renderer bundle.
- Secrets live in Electron main process or secure local configuration.
- Renderer communicates through narrowly scoped IPC.
- Do not expose arbitrary filesystem or Node APIs to renderer.
- contextIsolation on.
- nodeIntegration off.

## Phase plan
### Phase 1 — UI + architecture with mocks
Deliver:
- Electron + React + TypeScript + Vite project.
- Frameless always-on-top overlay.
- Draggable/resizable window.
- Alt+Space show/hide.
- App states: Idle / Listening / Processing / Answering / Error.
- Live transcript component.
- Persistent Question component.
- Streaming Answer component.
- Local last-5 history.
- Fake Vietnamese transcript simulator that appends partial text over time and includes English SEO terms.
- Mock end-of-question detector.
- Mock answer stream one bullet at a time.
- Clean service interfaces so mocks can be swapped later.
- Typecheck/lint/build passing.

Suggested folders:
```text
src/
  audio/
  transcription/
  question-detector/
  llm/
  shared/
  electron/
  renderer/
```

Do not implement real audio or OpenAI in Phase 1.

### Phase 2 — Windows system audio
- Capture call output audio without joining the meeting as a bot.
- Prefer Windows system audio / WASAPI loopback.
- Validate with Google Meet and Telegram Desktop.
- Keep capture isolated from microphone when possible.
- Add audio level diagnostics.
- Save/test short local diagnostic samples only when explicitly enabled for development.

### Phase 3 — Vietnamese-first Streaming STT
This phase is P0 and must not be accepted based on English-only testing.

Requirements:
- Persistent streaming connection.
- Partial transcript events while interviewer is speaking.
- Final transcript segments.
- Vietnamese is the primary language target.
- Vietnamese + English SEO terminology in the same utterance.
- Reconnection handling.
- Rolling 20–30 second transcript buffer.
- Confidence/uncertainty signaling where available.
- Vocabulary/context hints when supported by provider.

Required Vietnamese test set must include at least:
1. Clear Vietnamese SEO question.
2. Fast Vietnamese speech.
3. Vietnamese mixed with English SEO terms.
4. Short pauses inside a sentence.
5. Moderate call compression/background noise.
6. At least two different Vietnamese speakers if available.
7. A question containing terms such as GSC, Core Update, backlink, Ahrefs, canonical and 301.

Acceptance criteria:
- Transcript appears incrementally while audio is playing.
- Meaning of the question is preserved well enough for the downstream AI to identify the intended SEO question.
- Common SEO English terms are not consistently converted into unrelated Vietnamese words.
- Low-quality/unclear audio does not cause the system to confidently invent a different question.
- Latency remains compatible with the overall 1–2 second post-question answer-start target.

Before selecting the STT provider permanently, compare candidate implementations using the same Vietnamese test clips and record:
- perceived transcription accuracy
- mixed-language terminology accuracy
- partial transcript latency
- finalization latency
- stability/reconnect behavior
- estimated API cost

### Phase 4 — End-of-question + AI
- Candidate speech-end detection.
- Semantic completeness check for Vietnamese questions.
- Question cleanup.
- Context builder.
- Streaming LLM answer.
- Structured response validation.
- Low-confidence behavior.

### Phase 5 — Interview context + polish
- Local profile/CV/JD context screen.
- History navigation.
- Manual Answer hotkey fallback.
- Latency metrics.
- Failure/reconnect UX.

## Phase 1 acceptance criteria
Codex should not stop until all of these are true:
- `npm install` succeeds.
- `npm run typecheck` succeeds.
- `npm run lint` succeeds.
- `npm run build` succeeds.
- Electron app launches.
- Overlay is frameless and always on top.
- Alt+Space toggles the overlay.
- Fake Vietnamese live transcript visibly streams text incrementally.
- Fake transcript contains natural Vietnamese mixed with SEO English terminology.
- Fake question completion freezes the question in the Question area.
- Fake AI answer streams beneath the question without removing the question.
- At least 5 Q&A items can be retained in local history.
- Renderer contains no API key or direct secret handling.
- README explains setup and architecture.

## Codex execution instruction
Implement only Phase 1 first. Do not prematurely implement real audio capture, STT, or OpenAI calls. Keep interfaces production-oriented so those components can be replaced in later phases.

Vietnamese-first behavior must be reflected even in Phase 1 mocks so UI and later interfaces are designed around the actual target language from the beginning.

At completion, report:
1. Architecture summary.
2. Folder structure.
3. Commands run.
4. Tests/checks performed.
5. Known limitations.
6. Exact recommended next steps for Phase 2.
