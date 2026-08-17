# Real Interview Stress Test Script (20 Questions)

This script allows developers to perform a realistic manual mock interview with the live application and microphone.

## Instructions
1. Open the application (`npm run dev`).
2. Start the microphone input.
3. Read each interviewer question naturally in spoken Vietnamese.
4. Observe the STT transcript, detected intent, response time, and answer alignment.
5. Record your observation (PASS / WARN / FAIL).

---

### Q1 — PROJECT EXPERIENCE
> "Dự án iGaming gần nhất mà em trực tiếp làm lên top là con nào? Em nói cho anh từ lúc nhận site đến lúc keyword bắt đầu lên."
- [ ] **Transcript**: Clean / Minor Error / Malformed
- [ ] **Intent**: `PROJECT_EXPERIENCE`
- [ ] **Latency**: Speech-end to first token < 1000ms
- [ ] **Answer Alignment**: Candidate profile safety active (no unverified personal claims)
- **Notes**:

---

### Q2 — BUDGET ALLOCATION (5 SPEND CATEGORIES)
> "Budget ban đầu khoảng hai mươi triệu thì em phân bổ Content, Entity, backlink nền, Guest Post và PBN như thế nào?"
- [ ] **Transcript**: Money `20 triệu` extracted
- [ ] **Intent**: `BUDGET_ALLOCATION`
- [ ] **Latency**: Speculative prewarm lead time
- [ ] **Answer Alignment**: Sentence 1 directly allocates budget across all 5 requested categories
- **Notes**:

---

### Q3 — PBN TIMING
> "Em nói khoảng ngày thứ 10 bắt đầu đi PBN. Tại sao lại là ngày thứ 10?"
- [ ] **Transcript**: Clean
- [ ] **Intent**: `PBN_TIMING`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Explains signal-based trigger (index/impression) over fixed calendar date
- **Notes**:

---

### Q4 — NO KEYWORD SIGNAL
> "Site mở bot rồi nhưng khoảng hai tuần vẫn không nhận keyword thì em xử lý như thế nào?"
- [ ] **Transcript**: `hai tuần` duration recognized
- [ ] **Intent**: `NO_KEYWORD_SIGNAL`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Caution against link building; URL inspection / onpage / internal links first
- **Notes**:

---

### Q5 — ON-PAGE FOLLOW-UP
> "Em nói sẽ on-page lại. Cụ thể em thay đổi title, meta, content và internal link như thế nào?"
- [ ] **Transcript**: Clean
- [ ] **Intent**: `ONPAGE_DIAGNOSIS` / `NO_KEYWORD_SIGNAL`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Practical technical steps (silo, search intent, title/sapo)
- **Notes**:

---

### Q6 — STILL NO KEYWORD
> "Nếu em sửa on-page và ép index rồi mà site vẫn không nhận key thì bước tiếp theo em làm gì?"
- [ ] **Transcript**: Clean
- [ ] **Intent**: `NO_KEYWORD_SIGNAL` diagnosis
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Secondary technical checks (server response, cannibalization, soft 404)
- **Notes**:

---

### Q7 — DOMAIN CRITERIA
> "Tiêu chí săn domain của em là gì? Em check history, backlink profile, anchor text, traffic và Wayback như thế nào?"
- [ ] **Transcript**: Clean
- [ ] **Intent**: `DOMAIN_SELECTION`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Clean history, non-spam anchor text, Wayback history check
- **Notes**:

---

### Q8 — DR55 VS DR20
> "Domain A DR 55 nhưng traffic bằng 0. Domain B DR 20 nhưng có traffic history tốt và backlink đúng niche. Em chọn con nào?"
- [ ] **Transcript**: DR 55 and DR 20 preserved (NOT converted to money)
- [ ] **Intent**: `DOMAIN_SELECTION`
- [ ] **Latency**: < 500ms
- [ ] **Answer Alignment**: Sentence 1 chooses Domain B immediately
- **Notes**:

---

### Q9 — DOMAIN EXTENSION TEST
> "Em test các đuôi .in, .me, .my hoặc .nl thì dựa vào tín hiệu nào để biết đuôi nào Google đang phản hồi tốt?"
- [ ] **Transcript**: Clean
- [ ] **Intent**: `DOMAIN_SELECTION` / `STRATEGY_PLAN`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Crawl rate, indexing speed, impressions in GSC
- **Notes**:

---

### Q10 — MAINTAIN TOP
> "Nếu site đã lên top rồi thì em làm gì để giữ top?"
- [ ] **Transcript**: Clean
- [ ] **Intent**: `STRATEGY_PLAN` / `RANKING_MAINTENANCE`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Content refresh, internal link fortification, steady drip backlinks
- **Notes**:

---

### Q11 — 301 DECISION
> "Khi nào em quyết định 301 sang domain khác và khi nào em không 301?"
- [ ] **Transcript**: 301 redirect recognized
- [ ] **Intent**: `REDIRECT_301`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Decision criteria (manual action vs domain upgrade)
- **Notes**:

---

### Q12 — CORE UPDATE DROP
> "Site đang top 3 nhưng sau Core Update organic traffic giảm 40%. Referring domain không mất, canonical và indexing vẫn bình thường. Em kiểm tra gì tiếp theo?"
- [ ] **Transcript**: `40%` recognized (NOT money)
- [ ] **Intent**: `CORE_UPDATE_RECOVERY`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: SERP intent shifts, helpful content quality, competitor changes
- **Notes**:

---

### Q13 — GSC DATA INTERPRETATION
> "Trong GSC impressions chỉ giảm 5% nhưng click giảm 40%, average position từ 3.2 xuống 6.8. Em đọc dữ liệu này như thế nào?"
- [ ] **Transcript**: Impressions `-5%`, clicks `-40%`, position `3.2 -> 6.8`
- [ ] **Intent**: `GSC_RANKING_DROP`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Rank drop for money keywords causing CTR collapse
- **Notes**:

---

### Q14 — SPAM BACKLINKS
> "Site đột nhiên nhận hàng chục nghìn backlink spam và ranking giảm. Em làm sao phân biệt negative SEO với vấn đề của chính website?"
- [ ] **Transcript**: Clean
- [ ] **Intent**: `NEGATIVE_SEO`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Ahrefs spike check, GSC manual action, crawl anomalies
- **Notes**:

---

### Q15 — DISAVOW
> "Nếu nghi negative SEO thì em có disavow ngay không?"
- [ ] **Transcript**: Clean
- [ ] **Intent**: `NEGATIVE_SEO`
- [ ] **Latency**: < 500ms
- [ ] **Answer Alignment**: Sentence 1 states direct decision (no panic disavow)
- **Notes**:

---

### Q16 — SHORT FOLLOW-UP
> "Tại sao?"
- [ ] **Transcript**: Clean
- [ ] **Intent**: Resolved from previous turn (or marked `SHORT_FOLLOWUP_CONTEXT_NOT_RESOLVED`)
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Follow-up rationale for previous disavow stance
- **Notes**:

---

### Q17 — INTERRUPTED QUESTION
> Partial: *"Giả sử site đang..."* $\rightarrow$ *"à khoan"* $\rightarrow$ Restart: *"Giả sử site đang top 5 mà impression tăng nhưng CTR giảm mạnh thì em check gì?"*
- [ ] **Transcript**: Clean restart without stale evidence
- [ ] **Intent**: `GSC_RANKING_DROP`
- [ ] **Latency**: Clean turn reset
- [ ] **Answer Alignment**: SERP snippet, title tag, competitor SERP feature inspection
- **Notes**:

---

### Q18 — MIXED VIETNAMESE / ENGLISH
> "Backlink profile nhìn vẫn clean nhưng organic traffic tụt, average position cũng tụt thì em ưu tiên check technical, content hay off-page trước?"
- [ ] **Transcript**: Mixed SEO terminology parsed cleanly
- [ ] **Intent**: `GSC_RANKING_DROP` / `ONPAGE_DIAGNOSIS`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Prioritization order (technical indexing $\rightarrow$ content intent $\rightarrow$ off-page)
- **Notes**:

---

### Q19 — FAST QUESTION
> "DR cao traffic zero với DR thấp traffic thật chọn con nào?"
- [ ] **Transcript**: Clean
- [ ] **Intent**: `DOMAIN_SELECTION`
- [ ] **Latency**: < 500ms
- [ ] **Answer Alignment**: Sentence 1 chooses real traffic domain immediately
- **Notes**:

---

### Q20 — FINAL STRATEGY QUESTION
> "Anh giao cho em một money site betting mới hoàn toàn, budget tháng đầu 20 triệu. Competitor top đầu có hơn 2.000 referring domains, còn site mình chưa có authority, backlink hay organic traffic. Trong 30 ngày đầu em triển khai Content, Entity, backlink nền, Guest Post, PBN và internal link theo thứ tự nào? Và em dựa vào tín hiệu gì để thay đổi strategy?"
- [ ] **Transcript**: Money `20 triệu`, all 6 entities parsed
- [ ] **Intent**: `BUDGET_ALLOCATION` / `STRATEGY_PLAN`
- [ ] **Latency**: < 1000ms
- [ ] **Answer Alignment**: Direct workflow allocation (Content/Entity first $\rightarrow$ GSC indexing trigger $\rightarrow$ GP/PBN)
- **Notes**:
