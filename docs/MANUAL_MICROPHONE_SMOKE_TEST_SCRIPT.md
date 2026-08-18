# SEO iGaming Live Interview Copilot — Manual Microphone Smoke Test Protocol

This document provides a 14-turn spoken script for human microphone validation before a live interview. 
Speak clearly into your microphone at normal conversational volume.

---

### Turn 1: New-Site Workflow (Standalone Strategy)
- **Spoken Text**: `"Khi mới tiếp nhận một domain vừa dựng cho niche cá cược bóng đá, 30 ngày đầu em thiết lập checklist audit kỹ thuật và on-page thế nào?"`
- **Expected Visual Output**: Sentence 1 states 30-day technical roadmap (GSC/GA4, robots/sitemap, on-page canonical/title before backlink spend).

---

### Turn 2: Natural Fragment + Continuation (Pause Handling)
- **Step 1 — Speak Part 1**: `"Nếu traffic organic đột ngột giảm một nửa..."`
- **Step 2 — Human Tester Action**: *[Pause naturally for 1.5 - 2.5 seconds without speaking. Verify UI displays "Listening" or "PossibleEnd" WITHOUT prematurely generating an answer].*
- **Step 3 — Speak Part 2**: `"...mà không phải do Core Update thì bước đầu tiên em check gì?"`
- **Expected Visual Output**: Holds fragment during pause, then commits full question and highlights search intent/on-page diagnosis without blaming Core Update.

---

### Turn 3: Short Decision Follow-Up ("Tại sao?")
- **Spoken Text**: `"Tại sao?"`
- **Expected Visual Output**: Correctly detects `WHY` follow-up, inherits previous turn context without asking "về cái gì", and explains why local on-page/intent is inspected before off-page.

---

### Turn 4: Budget Allocation (27M VND)
- **Spoken Text**: `"Tháng đầu tiên ngân sách 27 triệu, em phân bổ tiền cho Content, Entity, Guest Post và PBN thế nào?"`
- **Expected Visual Output**: Sentence 1 gives concrete allocation across 4 categories (e.g. 10M Content, 7M Entity, 10M Guest Post/PBN), with signal-based off-page spending.

---

### Turn 5: Entity Continuation Follow-Up ("Còn PBN?")
- **Spoken Text**: `"Còn PBN?"`
- **Expected Visual Output**: Inherits 27M budget frame and specifies PBN link pacing/timing condition based on GSC impressions.

---

### Turn 6: Domain Selection (DR 68 vs DR 31 Real Traffic)
- **Spoken Text**: `"Anh có hai con expired domain. Một con DR 68 gần như 0 traffic. Con kia DR 31 nhưng có 3.500 organic traffic thật. Em chọn con nào?"`
- **Expected Visual Output**: Sentence 1 directly picks DR 31 domain with 3,500 real traffic; explains vanity DR 68 manipulation risk and verification via Wayback Machine.

---

### Turn 7: Technical Canonical / Crawl Diagnosis
- **Spoken Text**: `"Một cụm URL bài viết đang bị lỗi canonical trỏ vòng tròn giữa 3 landing page và sitemap không update, em xử lý trong GSC ra sao?"`
- **Expected Visual Output**: Sentence 1 states inspection of URL status in GSC, fixing self-referencing canonicals to the primary money page, and pinging sitemap.

---

### Turn 8: Ranking Drop with Ruled-Out Causes
- **Spoken Text**: `"10 money page tụt top nhưng không có Core Update và không bị manual action, em bóc tách lỗi gì trước?"`
- **Expected Visual Output**: Excludes Core Update and Manual Action; focuses immediately on Search Intent shift, competitor updates, and internal link equity.

---

### Turn 9: Negative SEO / Spam Backlink Spike
- **Spoken Text**: `"Website nhận 13.700 spam backlink từ 650 referring domain rác trong 3 ngày, em có disavow ngay không?"`
- **Expected Visual Output**: Sentence 1 advises caution against immediate disavow; monitors indexation and actual ranking correlation first.

---

### Turn 10: Numeric-Heavy Multi-Metric GSC Case
- **Spoken Text**: `"GSC báo traffic giảm 37%, CTR giảm từ 7.4% xuống 2.3%, position từ 4.1 xuống 9.6. Em đọc dữ liệu này thế nào?"`
- **Expected Visual Output**: Analyzes CTR drop and position loss without corrupting numbers or units.

---

### Turn 11: Adversarial False Premise Challenge
- **Spoken Text**: `"Cứ 301 toàn bộ expired domain DR cao về trang chủ money site là link juice sẽ truyền 100% an toàn mà không lo penalty, đúng không?"`
- **Expected Visual Output**: Sentence 1 explicitly disagrees (*"Không đúng..." / "Không thể truyền 100%..."*), explaining 301 risks and topic relevance decay.

---

### Turn 12: Candidate Experience Trap (Autobiographical Probe)
- **Spoken Text**: `"Em đã trực tiếp vận hành hệ thống 150 PBN private cho nhà cái nào trước đây và đem lại bao nhiêu tỷ doanh thu?"`
- **Expected Visual Output**: Sentence 1 honestly states personal boundary (*"Với quy mô 150 PBN em chưa trực tiếp vận hành trong dự án thực tế trước đây..."*), then outlines safe technical management principles without fabricating fake company names or revenue.

---

### Turn 13: Mixed Vietnamese-English Terminology
- **Spoken Text**: `"Keyword chính bị cannibalize do 2 landing page cùng target chung search intent, em setup canonical hay làm 301 redirect?"`
- **Expected Visual Output**: Decides between 301 redirect vs canonical consolidation based on content uniqueness.

---

### Turn 14: Multi-Factor Money-Site Strategy
- **Spoken Text**: `"Site vừa mở bot 2 tuần đã index 80 URL nhưng chưa có impression từ khóa chính, em tối ưu on-page hay bắt đầu đi guest post?"`
- **Expected Visual Output**: Recommends on-page keyword optimization, internal links, and search intent alignment before spending on guest posts.

---

### Verification Checklist:
- [ ] Turn commit latency $< 500$ ms.
- [ ] First useful token displayed in $< 1.8$ s.
- [ ] Follow-ups maintain context without cross-turn leakage.
- [ ] Zero UI freezes or unhandled errors.
