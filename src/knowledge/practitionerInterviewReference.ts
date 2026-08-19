import type { QuestionIntentCategory } from "../question-detector/intentClassifier";
import type { QuestionShape } from "../question-detector/questionShapeClassifier";

export type SourceConfidence = "PRACTITIONER_PATTERN" | "HEURISTIC" | "EXAMPLE_ONLY";

export interface PractitionerPlaybookEntry {
  id: string;
  topics: string[];
  intents?: QuestionIntentCategory[];
  questionShapes?: QuestionShape[];
  interviewerPatterns?: string[];
  guidance: string[];
  practitionerGuidance: string[];
  decisionSignals?: string[];
  practitionerExamples?: string[];
  followUpTriggers?: string[];
  cautions?: string[];
  applicableEntities?: string[];
  sourceConfidence: SourceConfidence;
  candidateClaimAllowed: false;
}

export type PractitionerInterviewReference = PractitionerPlaybookEntry;

export const SEEDED_PRACTITIONER_REFERENCES: PractitionerPlaybookEntry[] = [
  // A. SITE INITIAL EXECUTION
  {
    id: "ref:project-initial-execution",
    topics: ["PROJECT_EXPERIENCE", "SITE_SETUP", "SILO", "CONTENT", "ENTITY", "BACKLINK_FOUNDATION", "INDEXING"],
    intents: ["BUDGET_ALLOCATION", "STRATEGY_PLAN", "PROJECT_EXPERIENCE"],
    questionShapes: ["ALLOCATION", "WORKFLOW", "TIMING", "GENERAL"],
    interviewerPatterns: [
      "Quy trình nhận site iGaming mới trong 30 ngày đầu của em như thế nào?",
      "Khi nhận một money site mới hoàn toàn em triển khai những bước nào trước?",
      "Anh giao cho em site mới thì thứ tự đi Content, Entity và Link như thế nào?"
    ],
    guidance: [
      "Quy trình triển khai site iGaming mới: (1) Chuẩn bị kỹ thuật & kiến trúc Silo/URL -> (2) Sản xuất content chuẩn search intent -> (3) Xây dựng Entity đa tầng và backlink nền tảng (social profile, trust sources) -> (4) Triển khai link bổ trợ (GOV chất lượng nếu có, forum uy tín, blog comment liên quan, Web 2.0 tạo nền) -> (5) Tối ưu luồng internal link -> (6) Theo dõi tín hiệu index / bot crawl / keyword trên Google Search Console (GSC) -> (7) Tăng cường link mạnh (Guest Post, PBN) tùy theo tiến độ nhận key.",
      "Phân bổ nguồn lực theo từng giai đoạn: Hoàn thiện On-page, Content, Entity và link nền trước; chỉ giải ngân link mạnh khi site đã có tín hiệu index sạch và nhận keyword bước đầu."
    ],
    practitionerGuidance: [
      "Quy trình triển khai site iGaming mới: (1) Chuẩn bị kỹ thuật & kiến trúc Silo/URL -> (2) Sản xuất content chuẩn search intent -> (3) Xây dựng Entity đa tầng và backlink nền tảng (social profile, trust sources) -> (4) Triển khai link bổ trợ (GOV chất lượng nếu có, forum uy tín, blog comment liên quan, Web 2.0 tạo nền) -> (5) Tối ưu luồng internal link -> (6) Theo dõi tín hiệu index / bot crawl / keyword trên Google Search Console (GSC) -> (7) Tăng cường link mạnh (Guest Post, PBN) tùy theo tiến độ nhận key.",
      "Phân bổ nguồn lực theo từng giai đoạn: Hoàn thiện On-page, Content, Entity và link nền trước; chỉ giải ngân link mạnh khi site đã có tín hiệu index sạch và nhận keyword bước đầu."
    ],
    decisionSignals: [
      "Googlebot crawl đều đặn trên GSC",
      "URL chính index sạch không lỗi canonical",
      "Xuất hiện impression đầu tiên trên GSC"
    ],
    practitionerExamples: [
      "Ví dụ foundation links: GOV-type sources khi có sẵn, diễn đàn chuyên ngành, blog comment theo ngữ cảnh, Web 2.0 và social trust profile."
    ],
    followUpTriggers: ["Tín hiệu nào?", "Khi nào mới tăng link?"],
    cautions: [
      "Quy trình là mẫu tham khảo từ practitioner, KHÔNG PHẢI sự thật lịch sử cá nhân của ứng viên.",
      "TUYỆT ĐỐI KHÔNG nhận vơ 'Ở dự án UU88 của em...' trừ khi có trong VERIFIED_CANDIDATE_FACTS."
    ],
    applicableEntities: [
      "20 triệu",
      "20m",
      "ngân sách khởi điểm",
      "chia ngân sách",
      "phân bổ ngân sách",
      "kickoff site mới",
      "quy trình nhận site mới",
      "tháng đầu triển khai"
    ],
    sourceConfidence: "PRACTITIONER_PATTERN",
    candidateClaimAllowed: false
  },

  // B. INITIAL BUDGET
  {
    id: "ref:initial-budget-allocation",
    topics: ["BUDGET", "BUDGET_ALLOCATION", "STAGED_ROLLOUT"],
    intents: ["BUDGET_ALLOCATION"],
    questionShapes: ["ALLOCATION", "WORKFLOW"],
    interviewerPatterns: [
      "Budget 20 triệu tháng đầu em chia thế nào?",
      "Ngân sách ban đầu khoảng 20-25 triệu thì phân bổ cho Content, Entity, Link nền, GP và PBN ra sao?"
    ],
    guidance: [
      "Phân bổ ngân sách khởi điểm theo từng giai đoạn tham khảo: Khoảng 20–25 triệu VNĐ ban đầu chia cho Content chất lượng, Entity, Backlink nền tảng (GOV, Forum, Blog comment, Web 2.0), và giữ phần ngân sách còn lại cho Guest Post (GP) / Private Blog Network (PBN) sau khi có tín hiệu đo lường.",
      "Nguyên tắc giải ngân: Không dồn toàn bộ tiền đi link mạnh ngay tháng đầu khi on-page chưa cắn tín hiệu."
    ],
    practitionerGuidance: [
      "Phân bổ ngân sách khởi điểm theo từng giai đoạn tham khảo: Khoảng 20–25 triệu VNĐ ban đầu chia cho Content chất lượng, Entity, Backlink nền tảng (GOV, Forum, Blog comment, Web 2.0), và giữ phần ngân sách còn lại cho Guest Post (GP) / Private Blog Network (PBN) sau khi có tín hiệu đo lường.",
      "Nguyên tắc giải ngân: Không dồn toàn bộ tiền đi link mạnh ngay tháng đầu khi on-page chưa cắn tín hiệu."
    ],
    decisionSignals: [
      "Độ sẵn sàng của On-page và Entity",
      "Tiến độ index và emergence của impression"
    ],
    practitionerExamples: [
      "Ví dụ phân bổ tham khảo: 30% Content, 20% Entity & Social, 20% Link nền tảng, 30% dự phòng GP/PBN sau khi có impression."
    ],
    cautions: [
      "Con số 20–25 triệu VNĐ chỉ là VÍ DỤ THAM KHẢO, KHÔNG PHẢI quy tắc bắt buộc và KHÔNG PHẢI số tiền ứng viên từng tiêu.",
      "Luôn dùng văn phong đề xuất: 'Với case này em có thể phân bổ khoảng...', 'Em đề xuất khoảng...'."
    ],
    applicableEntities: [
      "20 triệu",
      "25 triệu",
      "20m",
      "25m",
      "phân bổ ngân sách",
      "chia ngân sách",
      "budget ban đầu"
    ],
    sourceConfidence: "EXAMPLE_ONLY",
    candidateClaimAllowed: false
  },

  // C. PBN TIMING
  {
    id: "ref:new-site-pbn-timing",
    topics: ["PBN_TIMING", "PBN", "INDEXING", "GSC", "SIGNALS"],
    intents: ["PBN_TIMING", "STRATEGY_PLAN"],
    questionShapes: ["TIMING", "WORKFLOW", "SIGNAL_REQUEST"],
    interviewerPatterns: [
      "Khi nào mới bắt đầu đi link PBN cho site mới?",
      "Khoảng ngày thứ 10 em bắt đầu PBN, tại sao?",
      "Dựa vào tín hiệu gì trong GSC để em quyết định bơm PBN?"
    ],
    guidance: [
      "Thời điểm đi link Private Blog Network (PBN) bắt buộc dựa trên TÍN HIỆU THỰC TẾ của website:",
      "1. Site đã mở bot bình thường và URL chính đã được Google index sạch không lỗi canonical.",
      "2. Bắt đầu xuất hiện impression đầu tiên trên Google Search Console (GSC) và có chuyển động nhận keyword.",
      "3. Giải thích câu hỏi 'Tại sao là ngày thứ 10?': Khoảng ngày thứ 10 là mốc tham khảo kinh nghiệm khi on-page và bot crawl đã ổn định, TUYỆT ĐỐI không phải quy tắc cố định. Nếu ngày 10 chưa index thì chưa đi PBN; ngược lại nếu ngày 6-7 đã có tín hiệu tốt thì có thể bắt đầu tăng link."
    ],
    practitionerGuidance: [
      "Thời điểm đi link Private Blog Network (PBN) bắt buộc dựa trên TÍN HIỆU THỰC TẾ của website:",
      "1. Site đã mở bot bình thường và URL chính đã được Google index sạch không lỗi canonical.",
      "2. Bắt đầu xuất hiện impression đầu tiên trên Google Search Console (GSC) và có chuyển động nhận keyword.",
      "3. Giải thích câu hỏi 'Tại sao là ngày thứ 10?': Khoảng ngày thứ 10 là mốc tham khảo kinh nghiệm khi on-page và bot crawl đã ổn định, TUYỆT ĐỐI không phải quy tắc cố định. Nếu ngày 10 chưa index thì chưa đi PBN; ngược lại nếu ngày 6-7 đã có tín hiệu tốt thì có thể bắt đầu tăng link."
    ],
    decisionSignals: [
      "Google Search Console (GSC) bắt đầu ghi nhận impression",
      "Bot crawl ổn định hàng ngày không lỗi 5xx/4xx",
      "URL chính nằm trong chỉ mục tìm kiếm"
    ],
    practitionerExamples: [
      "Ví dụ thực chiến: Bắt đầu kết nối PBN chọn lọc xung quanh ngày thứ 10 sau khi xác nhận on-page và bot crawl đã ổn định."
    ],
    followUpTriggers: ["Tại sao là ngày thứ 10?", "Tín hiệu nào?"],
    cautions: [
      "'Ngày thứ 10' là HEURISTIC / VÍ DỤ quan sát, KHÔNG PHẢI quy tắc SEO phổ quát.",
      "Không bao giờ trả lời máy móc rằng cứ đến ngày thứ 10 là đi PBN nếu thiếu tín hiệu GSC."
    ],
    applicableEntities: [
      "ngày 10",
      "ngày thứ 10",
      "day 10",
      "10 ngày",
      "thời điểm đi pbn",
      "khi nào đi pbn",
      "khi nào bắn pbn",
      "thời điểm bắn pbn",
      "pbn timing",
      "bắt đầu pbn",
      "pbn sau bao lâu",
      "đi pbn chưa",
      "bắn pbn chưa",
      "có nên đi pbn",
      "triển khai pbn"
    ],
    sourceConfidence: "HEURISTIC",
    candidateClaimAllowed: false
  },

  // D. DOMAIN HUNTING & EVALUATION
  {
    id: "ref:domain-hunting-evaluation",
    topics: ["DOMAIN_SELECTION", "EXPIRED_DOMAIN", "WAYBACK", "REFERRING_DOMAIN", "ORGANIC_TRAFFIC", "DR"],
    intents: ["DOMAIN_SELECTION"],
    questionShapes: ["DECISION", "COMPARISON", "SIGNAL_REQUEST", "WORKFLOW", "GENERAL"],
    interviewerPatterns: [
      "Tiêu chí săn domain iGaming của em là gì?",
      "DR cao có phải domain tốt không?",
      "Domain A DR 55 traffic 0 vs Domain B DR 20 có traffic thật em chọn con nào?",
      "Wayback sạch nhưng anchor profile từng spam thì em có mua domain này không?",
      "Domain từng redirect 2 lần thì em đánh giá thế nào?",
      "Domain mất index rồi có mua không?"
    ],
    guidance: [
      "Bộ tiêu chí săn và đánh giá Expired Domain trong SEO iGaming:",
      "1. Soi lịch sử Wayback Machine: Kiểm tra chủ đề quá khứ (topical relevance), loại trừ triệt để domain từng dính redirect độc hại, lịch sử cờ bạc nát hoặc sai lệch ngôn ngữ/thị trường.",
      "2. Audit Backlink Profile & Referring Domain (RD): Kiểm tra RD tự nhiên trên Ahrefs, anchor text sạch (không dính spam anchor tiếng Trung, Nhật, casino bẩn).",
      "3. Organic Traffic vs Domain Rating (DR): DR chỉ là chỉ số tham khảo hỗ trợ (supporting metric), KHÔNG PHẢI yếu tố quyết định. Domain có organic traffic lịch sử thật và RD cùng niche luôn được ưu tiên hơn domain DR cao ảo nhưng traffic = 0.",
      "4. Trạng thái Index: Kiểm tra khả năng index thực tế và tính sạch sẽ của domain.",
      "5. Phân loại mục đích: Đánh giá phù hợp làm Money Site trực tiếp hay chỉ làm vệ tinh / chuyển hướng 301."
    ],
    practitionerGuidance: [
      "Bộ tiêu chí săn và đánh giá Expired Domain trong SEO iGaming:",
      "1. Soi lịch sử Wayback Machine: Kiểm tra chủ đề quá khứ (topical relevance), loại trừ triệt để domain từng dính redirect độc hại, lịch sử cờ bạc nát hoặc sai lệch ngôn ngữ/thị trường.",
      "2. Audit Backlink Profile & Referring Domain (RD): Kiểm tra RD tự nhiên trên Ahrefs, anchor text sạch (không dính spam anchor tiếng Trung, Nhật, casino bẩn).",
      "3. Organic Traffic vs Domain Rating (DR): DR chỉ là chỉ số tham khảo hỗ trợ (supporting metric), KHÔNG PHẢI yếu tố quyết định. Domain có organic traffic lịch sử thật và RD cùng niche luôn được ưu tiên hơn domain DR cao ảo nhưng traffic = 0.",
      "4. Trạng thái Index: Kiểm tra khả năng index thực tế và tính sạch sẽ của domain.",
      "5. Phân loại mục đích: Đánh giá phù hợp làm Money Site trực tiếp hay chỉ làm vệ tinh / chuyển hướng 301."
    ],
    decisionSignals: [
      "Lịch sử Wayback Machine cùng chủ đề không đứt đoạn",
      "Anchor text profile tự nhiên không chứa anchor spam",
      "Organic traffic lịch sử thật trên Ahrefs/Semrush",
      "Referring Domain (RD) từ các nguồn uy tín"
    ],
    practitionerExamples: [
      "Ví dụ so sánh: Chọn Domain B (DR 20, traffic thật 5k, backlink đúng niche) thay vì Domain A (DR 55, traffic = 0, backlink rác)."
    ],
    followUpTriggers: ["Vì sao chọn domain đó?", "Tín hiệu nào?"],
    cautions: [
      "DR cao ảo không đảm bảo chất lượng; luôn soi Wayback và lịch sử traffic thật.",
      "Không khẳng định domain mất index vĩnh viễn không thể dùng, nhưng phải kiểm tra kỹ nguyên nhân penalty."
    ],
    applicableEntities: [
      "expired domain",
      "domain cũ",
      "tên miền cũ",
      "săn domain",
      "săn tên miền",
      "mua domain",
      "đánh giá domain",
      "so sánh domain",
      "chọn domain",
      "chọn con nào",
      "domain a",
      "domain b",
      "con a",
      "con b",
      "wayback",
      "wayback machine"
    ],
    sourceConfidence: "PRACTITIONER_PATTERN",
    candidateClaimAllowed: false
  },

  // E. TLD TESTING EXPERIMENTATION
  {
    id: "ref:tld-testing-experimentation",
    topics: ["TLD_TESTING", "DOMAIN_SELECTION", "INDEXING_SIGNALS"],
    intents: ["DOMAIN_SELECTION"],
    questionShapes: ["DECISION", "COMPARISON", "SIGNAL_REQUEST"],
    interviewerPatterns: [
      "Em test .in và .me như thế nào?",
      "Tín hiệu nào cho em biết nên giữ .in hay .me?",
      "Vì sao em lại thử nghiệm các đuôi .in, .me, .my, .nl, .co.in?",
      "Làm sao phân biệt hiệu ứng TLD với history của domain?"
    ],
    guidance: [
      "Thử nghiệm Top-Level Domain (TLD) thực chiến trong SEO iGaming:",
      "1. Quan điểm kỹ thuật: Không khẳng định Google thuật toán ưu tiên thiên vị một đuôi TLD cụ thể; coi TLD testing là phương pháp THỬ NGHIỆM ĐO LƯỜNG TÍN HIỆU.",
      "2. Cách triển khai test: Chạy song song các đuôi (.in, .me, .my, .nl, .co.in) cùng cấu trúc on-page và content tương đồng để theo dõi phản ứng của Googlebot.",
      "3. Tín hiệu quan sát quyết định giữ/đẩy: Tốc độ index trên Google Search Console (GSC), thời gian xuất hiện impression đầu tiên, độ nhạy nhận từ khóa (keyword pickup), và độ ổn định thứ hạng trong 2-4 tuần đầu."
    ],
    practitionerGuidance: [
      "Thử nghiệm Top-Level Domain (TLD) thực chiến trong SEO iGaming:",
      "1. Quan điểm kỹ thuật: Không khẳng định Google thuật toán ưu tiên thiên vị một đuôi TLD cụ thể; coi TLD testing là phương pháp THỬ NGHIỆM ĐO LƯỜNG TÍN HIỆU.",
      "2. Cách triển khai test: Chạy song song các đuôi (.in, .me, .my, .nl, .co.in) cùng cấu trúc on-page và content tương đồng để theo dõi phản ứng của Googlebot.",
      "3. Tín hiệu quan sát quyết định giữ/đẩy: Tốc độ index trên Google Search Console (GSC), thời gian xuất hiện impression đầu tiên, độ nhạy nhận từ khóa (keyword pickup), và độ ổn định thứ hạng trong 2-4 tuần đầu."
    ],
    decisionSignals: [
      "Tốc độ index URL của Googlebot",
      "Impression xuất hiện nhanh trên GSC",
      "Độ nhạy nhận từ khóa mục tiêu (keyword pickup)",
      "Chuyển động thứ hạng và độ ổn định SERP"
    ],
    practitionerExamples: [
      "Ví dụ: Test song song .in và .me, con nào cắn impression và nhận keyword trước sau 10-14 ngày thì ưu tiên dồn lực link bổ trợ cho con đó."
    ],
    followUpTriggers: ["Tín hiệu nào?", "Bao lâu không có tín hiệu thì bỏ?"],
    cautions: [
      "KHÔNG BAO GIỜ khẳng định riêng đuôi TLD tự thân làm tăng ranking.",
      "Phải phân biệt: Hiệu ứng TLD vs Lịch sử domain vs Authority backlink vs Content/Internal link."
    ],
    applicableEntities: [
      "tld testing",
      "thử nghiệm tld",
      "đuôi tên miền",
      "đuôi domain",
      ".in",
      ".me",
      ".my",
      ".nl",
      ".co.in"
    ],
    sourceConfidence: "PRACTITIONER_PATTERN",
    candidateClaimAllowed: false
  },

  // F. NO-KEYWORD TROUBLESHOOTING
  {
    id: "ref:no-keyword-signal-troubleshooting",
    topics: ["NO_KEYWORD_SIGNAL", "ONPAGE", "SAPO", "TITLE_META", "SEARCH_INTENT", "INTERNAL_LINK", "CANONICAL"],
    intents: ["NO_KEYWORD_SIGNAL", "ONPAGE_DIAGNOSIS"],
    questionShapes: ["DIAGNOSIS", "NEXT_STEP", "SIGNAL_REQUEST"],
    interviewerPatterns: [
      "Site index rồi nhưng hai tuần vẫn không nhận key, em làm gì?",
      "Mở bot 2 tuần mà GSC không có impression thì xử lý sao?",
      "Nếu sửa on-page và ép index rồi mà vẫn không nhận key thì bước tiếp theo là gì?"
    ],
    guidance: [
      "Quy trình chẩn đoán tuần tự khi site index 2 tuần nhưng chưa nhận keyword hoặc chưa có impression:",
      "1. Re-check Search Intent & On-page: Kiểm tra Title, Meta Description và đoạn Sapo/mở đầu có khớp chính xác thực thể và search intent của người dùng không.",
      "2. URL Inspection & Canonical trên GSC: Kiểm tra URL Inspection xem Google chọn canonical nào (loại trừ bị trỏ canonical sai sang URL khác), không bị chặn render.",
      "3. Tối ưu Homepage & Internal Link: Điều hướng anchor text nội bộ từ homepage và các bài liên quan về thẳng money page.",
      "4. Ép re-index và theo dõi tín hiệu bot.",
      "5. Chỉ đánh giá lại domain hoặc cấu trúc homepage sau khi đã tối ưu on-page/internal link nhiều lần mà vẫn không có biến chuyển."
    ],
    practitionerGuidance: [
      "Quy trình chẩn đoán tuần tự khi site index 2 tuần nhưng chưa nhận keyword hoặc chưa có impression:",
      "1. Re-check Search Intent & On-page: Kiểm tra Title, Meta Description và đoạn Sapo/mở đầu có khớp chính xác thực thể và search intent của người dùng không.",
      "2. URL Inspection & Canonical trên GSC: Kiểm tra URL Inspection xem Google chọn canonical nào (loại trừ bị trỏ canonical sai sang URL khác), không bị chặn render.",
      "3. Tối ưu Homepage & Internal Link: Điều hướng anchor text nội bộ từ homepage và các bài liên quan về thẳng money page.",
      "4. Ép re-index và theo dõi tín hiệu bot.",
      "5. Chỉ đánh giá lại domain hoặc cấu trúc homepage sau khi đã tối ưu on-page/internal link nhiều lần mà vẫn không có biến chuyển."
    ],
    decisionSignals: [
      "Trạng thái URL Inspection trong GSC (User canonical vs Google canonical)",
      "Mật độ từ khóa và thực thể trong đoạn Sapo",
      "Luồng anchor text internal link từ trang chủ"
    ],
    practitionerExamples: [
      "Ví dụ: Viết lại đoạn Sapo chứa trực diện thực thể ngách, trỏ 2 internal links anchor chính xác từ homepage, và ép index lại."
    ],
    followUpTriggers: ["Nếu vẫn không lên thì sao?", "Bước tiếp theo là gì?"],
    cautions: [
      "TUYỆT ĐỐI KHÔNG khuyến nghị đổi domain hoặc đập site làm lại như hành động đầu tiên.",
      "Luôn ưu tiên chẩn đoán on-page, search intent, sapo, internal link và canonical trước."
    ],
    applicableEntities: [
      "chưa nhận key",
      "không nhận key",
      "chưa nhận keyword",
      "không nhận keyword",
      "chưa có impression",
      "không có impression",
      "2 tuần chưa nhận",
      "hai tuần chưa nhận",
      "2 tuần không có impression",
      "mở bot không nhận",
      "mở bot chưa nhận",
      "không cắn key",
      "chưa cắn key",
      "không lên key"
    ],
    sourceConfidence: "PRACTITIONER_PATTERN",
    candidateClaimAllowed: false
  },

  // G. RANKING MAINTENANCE & TOP RETENTION
  {
    id: "ref:ranking-maintenance-301",
    topics: ["RANKING_MAINTENANCE", "MONITORING", "GUEST_POST", "BACKUP_DOMAIN"],
    intents: ["REDIRECT_301", "GSC_RANKING_DROP"],
    questionShapes: ["DECISION", "TIMING", "WORKFLOW", "SIGNAL_REQUEST"],
    interviewerPatterns: [
      "Site đang top thì em giữ top thế nào?",
      "Duy trì top trong iGaming em làm những việc gì?",
      "Site đang top tại sao em chuẩn bị domain 301?"
    ],
    guidance: [
      "Chiến lược duy trì thứ hạng (Top Retention) trong môi trường iGaming biến động mạnh:",
      "1. Guest Post (GP) chọn lọc: Bổ sung định kỳ các link GP chất lượng từ site cùng chủ đề có traffic thật để duy trì dòng authority đều đặn.",
      "2. Giám sát liên tục GSC: Theo dõi biến động CTR, vị trí trung bình (average position), và tần suất crawl của Googlebot.",
      "3. Audit backlink định kỳ: Phát hiện sớm rớt link hoặc đối thủ bắn link bẩn.",
      "4. Chuẩn bị sẵn Domain dự phòng (Backup Domains): Nuôi và làm ấm (warm-up) sẵn các domain ứng viên sạch ngay trong khi money site đang trên top để luôn chủ động phương án migration nếu site chính gặp sự cố cấp domain."
    ],
    practitionerGuidance: [
      "Chiến lược duy trì thứ hạng (Top Retention) trong môi trường iGaming biến động mạnh:",
      "1. Guest Post (GP) chọn lọc: Bổ sung định kỳ các link GP chất lượng từ site cùng chủ đề có traffic thật để duy trì dòng authority đều đặn.",
      "2. Giám sát liên tục GSC: Theo dõi biến động CTR, vị trí trung bình (average position), và tần suất crawl của Googlebot.",
      "3. Audit backlink định kỳ: Phát hiện sớm rớt link hoặc đối thủ bắn link bẩn.",
      "4. Chuẩn bị sẵn Domain dự phòng (Backup Domains): Nuôi và làm ấm (warm-up) sẵn các domain ứng viên sạch ngay trong khi money site đang trên top để luôn chủ động phương án migration nếu site chính gặp sự cố cấp domain."
    ],
    decisionSignals: [
      "Tín hiệu CTR và average position trên GSC",
      "Độ ổn định của Referring Domains (RD)",
      "Trạng thái sẵn sàng của domain backup"
    ],
    practitionerExamples: [
      "Ví dụ: Nuôi ấm 1-2 domain backup sạch trong lúc money site đang top 1-3 để phòng ngừa biến động đột ngột."
    ],
    followUpTriggers: ["Site tụt thì khi nào 301?", "Domain nào đủ điều kiện làm backup?"],
    cautions: [
      "TUYỆT ĐỐI KHÔNG 301 vội vã khi site vừa dao động thứ hạng ngắn hạn.",
      "Site tụt nhẹ không đồng nghĩa với 301 ngay lập tức.",
      "301 chỉ kích hoạt khi có sự cố nghiêm trọng không thể hồi phục ở tầng domain."
    ],
    applicableEntities: [
      "duy trì top",
      "top maintenance",
      "giữ top",
      "chuẩn bị domain 301",
      "backup domain cho 301",
      "domain dự phòng",
      "chuẩn bị domain để 301"
    ],
    sourceConfidence: "PRACTITIONER_PATTERN",
    candidateClaimAllowed: false
  },

  // H. 301 REDIRECT CONTINGENCY & MIGRATION
  {
    id: "ref:301-redirect-contingency",
    topics: ["REDIRECT_301", "URL_MAPPING", "TRIGGER_CONDITIONS", "MIGRATION_MONITORING"],
    intents: ["REDIRECT_301"],
    questionShapes: ["DECISION", "TIMING", "WORKFLOW"],
    interviewerPatterns: [
      "Điều kiện kích hoạt chuyển hướng 301 là gì?",
      "Quy trình 301 từ site cũ sang site mới em làm như thế nào?",
      "Sau khi 301 em theo dõi những chỉ số nào?"
    ],
    guidance: [
      "Quy trình và điều kiện kích hoạt chuyển hướng 301 trong SEO iGaming:",
      "1. Điều kiện kích hoạt: 301 chỉ được thực hiện khi: (a) Suy giảm ranking kéo dài không thể khắc phục bằng on-page/link; (b) Xác định lỗi ở cấp độ domain (penalty/manual action/toxic history); (c) Đã chuẩn bị sẵn domain backup có độ tương thích cao.",
      "2. Kỹ thuật 301: Map chính xác URL-to-URL (trang đích tương đương, không trỏ toàn bộ link về homepage gây loãng equity).",
      "3. Theo dõi sau 301: Giám sát tốc độ chuyển dịch index, traffic và keyword pickup trên GSC của domain mới."
    ],
    practitionerGuidance: [
      "Quy trình và điều kiện kích hoạt chuyển hướng 301 trong SEO iGaming:",
      "1. Điều kiện kích hoạt: 301 chỉ được thực hiện khi: (a) Suy giảm ranking kéo dài không thể khắc phục bằng on-page/link; (b) Xác định lỗi ở cấp độ domain (penalty/manual action/toxic history); (c) Đã chuẩn bị sẵn domain backup có độ tương thích cao.",
      "2. Kỹ thuật 301: Map chính xác URL-to-URL (trang đích tương đương, không trỏ toàn bộ link về homepage gây loãng equity).",
      "3. Theo dõi sau 301: Giám sát tốc độ chuyển dịch index, traffic và keyword pickup trên GSC của domain mới."
    ],
    decisionSignals: [
      "Suy giảm ranking kéo dài không hồi phục",
      "Domain backup đã được index và warm-up",
      "Bảng map URL 1-1 chính xác"
    ],
    practitionerExamples: [
      "Ví dụ: Lập bảng map 1-1 cho các money pages chính, trỏ 301 ở cấp độ server nginx/cloudflare và theo dõi chuyển dịch GSC trong 7-14 ngày."
    ],
    cautions: [
      "TUYỆT ĐỐI KHÔNG 301 vội vã khi site vừa dao động thứ hạng ngắn hạn do Core Update.",
      "Không trỏ 301 toàn bộ URL về trang chủ."
    ],
    applicableEntities: [
      "redirect 301",
      "quyết định 301",
      "khi nào 301",
      "chuẩn bị 301",
      "chuyển hướng 301",
      "domain để 301"
    ],
    sourceConfidence: "PRACTITIONER_PATTERN",
    candidateClaimAllowed: false
  },

  // I. PBN INFRASTRUCTURE & FOOTPRINT AWARENESS
  {
    id: "ref:pbn-infrastructure-footprint",
    topics: ["PBN", "INFRASTRUCTURE", "FOOTPRINT_SEPARATION", "NETWORK_DIVERSITY"],
    intents: ["STRATEGY_PLAN", "PROJECT_EXPERIENCE"],
    questionShapes: ["WORKFLOW", "GENERAL"],
    interviewerPatterns: [
      "Hệ thống PBN của em tách footprint như thế nào?",
      "Tiêu chuẩn dựng một con PBN an toàn là gì?"
    ],
    guidance: [
      "Nguyên tắc tách Footprint và xây dựng hệ thống Private Blog Network (PBN) an toàn:",
      "1. Đa dạng hóa hạ tầng: Sử dụng khác dải IP (Class C/B), khác nhà cung cấp hosting, khác DNS/nameservers và Cloudflare accounts.",
      "2. Đa dạng hóa giao diện và CMS: Không dùng chung 1 theme, 1 plugin hay cùng mẫu cấu trúc chân trang/sidebar.",
      "3. Content và Linking tự nhiên: Content trên PBN phải có giá trị đọc thực tế, không bắn link đồng loạt 100% về money site, phân bổ anchor text đa dạng (brand, generic, partial-match)."
    ],
    practitionerGuidance: [
      "Nguyên tắc tách Footprint và xây dựng hệ thống Private Blog Network (PBN) an toàn:",
      "1. Đa dạng hóa hạ tầng: Sử dụng khác dải IP (Class C/B), khác nhà cung cấp hosting, khác DNS/nameservers và Cloudflare accounts.",
      "2. Đa dạng hóa giao diện và CMS: Không dùng chung 1 theme, 1 plugin hay cùng mẫu cấu trúc chân trang/sidebar.",
      "3. Content và Linking tự nhiên: Content trên PBN phải có giá trị đọc thực tế, không bắn link đồng loạt 100% về money site, phân bổ anchor text đa dạng (brand, generic, partial-match)."
    ],
    decisionSignals: [
      "Mức độ phân tách IP/Hosting",
      "Tính tự nhiên của anchor text profile trên PBN",
      "Trạng thái index độc lập của các site vệ tinh"
    ],
    practitionerExamples: [
      "Ví dụ: Dùng hosting đa IP, theme WordPress tùy biến riêng biệt, và chỉ trỏ 1-2 link ngữ cảnh tự nhiên về money page sau khi bài viết vệ tinh đã index."
    ],
    cautions: [
      "Không khẳng định PBN là phương án an toàn tuyệt đối 100% không rủi ro.",
      "Footprint separation là biện pháp giảm thiểu rủi ro thuật toán."
    ],
    applicableEntities: [
      "footprint",
      "hệ thống pbn",
      "dựng pbn",
      "tách footprint",
      "ip class c"
    ],
    sourceConfidence: "PRACTITIONER_PATTERN",
    candidateClaimAllowed: false
  },

  // J. NEGATIVE SEO & LINK RISK DEFENSE
  {
    id: "ref:negative-seo-defense",
    topics: ["NEGATIVE_SEO", "LINK_RISK", "SPAM_AUDIT", "DISAVOW"],
    intents: ["NEGATIVE_SEO"],
    questionShapes: ["DECISION", "DIAGNOSIS", "WORKFLOW"],
    interviewerPatterns: [
      "Bị đối thủ bắn link bẩn anchor cờ bạc đen thì xử lý thế nào?",
      "Site đột nhiên nhận hàng chục nghìn backlink spam thì em có disavow ngay không?",
      "Làm sao phân biệt negative SEO với vấn đề nội tại của site?"
    ],
    guidance: [
      "Quy trình xử lý khi nghi ngờ bị Negative SEO / đối thủ bắn link bẩn:",
      "1. Chẩn đoán và cô lập: Kiểm tra trên Ahrefs và GSC xem các link spam đó đã thực sự được Google index chưa và có tương quan trực tiếp với biến động ranking không.",
      "2. Không disavow hoảng loạn: Nếu ranking chỉ dao động bình thường và link spam chưa index, tiếp tục theo dõi; nếu xuất hiện dấu hiệu ảnh hưởng rõ rệt, lập danh sách domain rác để Disavow ở cấp độ domain (domain:example.com).",
      "3. Cân bằng lại hồ sơ liên kết: Đẩy thêm link Entity, social trust và Guest Post sạch để pha loãng anchor text spam về ngưỡng an toàn."
    ],
    practitionerGuidance: [
      "Quy trình xử lý khi nghi ngờ bị Negative SEO / đối thủ bắn link bẩn:",
      "1. Chẩn đoán và cô lập: Kiểm tra trên Ahrefs và GSC xem các link spam đó đã thực sự được Google index chưa và có tương quan trực tiếp với biến động ranking không.",
      "2. Không disavow hoảng loạn: Nếu ranking chỉ dao động bình thường và link spam chưa index, tiếp tục theo dõi; nếu xuất hiện dấu hiệu ảnh hưởng rõ rệt, lập danh sách domain rác để Disavow ở cấp độ domain (domain:example.com).",
      "3. Cân bằng lại hồ sơ liên kết: Đẩy thêm link Entity, social trust và Guest Post sạch để pha loãng anchor text spam về ngưỡng an toàn."
    ],
    decisionSignals: [
      "Tương quan thời điểm xuất hiện link spam và biến động vị trí",
      "Trạng thái index của các link rác trên Google",
      "Tỷ lệ anchor text độc hại trong tổng profile"
    ],
    practitionerExamples: [
      "Ví dụ: Lập file disavow nộp lên GSC ở cấp độ domain kết hợp củng cố Entity để bảo vệ site khi đối thủ tấn công anchor text cờ bạc đen."
    ],
    followUpTriggers: ["Có disavow ngay không?", "Tại sao?"],
    cautions: [
      "Không khuyến nghị disavow ngay lập tức nếu chưa kiểm tra mức độ index và ảnh hưởng thực tế của link rác.",
      "Ưu tiên pha loãng anchor và củng cố Entity song song với disavow."
    ],
    applicableEntities: [
      "negative seo",
      "link bẩn",
      "spam link",
      "bắn link bẩn",
      "bắn link spam",
      "anchor cờ bạc đen",
      "bị đối thủ bắn",
      "disavow"
    ],
    sourceConfidence: "PRACTITIONER_PATTERN",
    candidateClaimAllowed: false
  }
];
