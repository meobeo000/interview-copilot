import type { QuestionIntentCategory } from "../question-detector/intentClassifier";
import type { QuestionShape } from "../question-detector/questionShapeClassifier";

export interface PractitionerInterviewReference {
  id: string;
  topics: string[];
  intents?: QuestionIntentCategory[];
  questionShapes?: QuestionShape[];
  applicableEntities?: string[];
  guidance: string[];
  practitionerExamples?: string[];
  cautions?: string[];
}

export const SEEDED_PRACTITIONER_REFERENCES: PractitionerInterviewReference[] = [
  {
    id: "ref:project-initial-execution",
    topics: ["PROJECT_EXPERIENCE", "BUDGET", "BACKLINK_FOUNDATION", "ENTITY", "CONTENT", "INTERNAL_LINK", "INDEXING", "GSC"],
    intents: ["BUDGET_ALLOCATION", "STRATEGY_PLAN", "PROJECT_EXPERIENCE"],
    questionShapes: ["ALLOCATION", "WORKFLOW", "TIMING", "GENERAL"],
    applicableEntities: [
      "20 triệu",
      "20m",
      "ngân sách 20",
      "budget 20",
      "ngân sách khởi điểm",
      "chia ngân sách",
      "phân bổ ngân sách",
      "kickoff site mới",
      "quy trình nhận site mới",
      "tháng đầu triển khai"
    ],
    guidance: [
      "Quy trình triển khai site iGaming mới: (1) Chuẩn bị site kỹ lưỡng & cấu trúc website -> (2) Sản xuất content chuẩn search intent -> (3) Xây dựng Entity đa tầng và backlink nền tảng (social profile, trust sources) -> (4) Triển khai link bổ trợ (GOV chất lượng nếu có, forum uy tín, blog comment liên quan, Web 2.0 tạo nền) -> (5) Tối ưu luồng internal link -> (6) Theo dõi tín hiệu index / bot crawl / keyword trên GSC -> (7) Tăng cường link mạnh (Guest Post, PBN) tùy theo tiến độ nhận key.",
      "Phân bổ ngân sách khởi điểm theo từng giai đoạn: Ưu tiên hoàn thiện On-page, Content, Entity và link nền trước; chỉ giải ngân cho PBN/Guest Post khi site đã có tín hiệu index sạch và nhận keyword bước đầu."
    ],
    practitionerExamples: [
      "Ví dụ phân bổ ngân sách khởi điểm tham khảo từ practitioner: Khoảng 20 triệu VNĐ ban đầu chia cho Content, Entity, Backlink nền tảng (GOV, Forum, Blog comment, Web 2.0), và giữ phần ngân sách còn lại cho Guest Post/PBN sau khi có tín hiệu.",
      "Ví dụ các nguồn foundation backlink thường được thảo luận: GOV-type sources khi có sẵn, diễn đàn chuyên ngành/liên quan, blog comment theo ngữ cảnh, Web 2.0 và social trust profile."
    ],
    cautions: [
      "Mức 20 triệu VNĐ chỉ là MỘT VÍ DỤ tham khảo từ practitioner, KHÔNG PHẢI ngân sách phổ quát bắt buộc cho mọi dự án và KHÔNG PHẢI sự thật lịch sử của ứng viên.",
      "TUYỆT ĐỐI KHÔNG khẳng định hoặc nhận vơ 'Ở dự án UU88 của em, em đã chi 20 triệu...' trừ khi thông tin này tồn tại trong VERIFIED_CANDIDATE_FACTS.",
      "Không trình bày các con số đề xuất như sự thật lịch sử đã qua; luôn dùng văn phong đề xuất: 'Với case này em có thể phân bổ khoảng...', 'Em đề xuất khoảng...'."
    ]
  },
  {
    id: "ref:new-site-pbn-timing",
    topics: ["PBN_TIMING", "PBN", "INDEXING", "GSC", "BACKLINK_FOUNDATION", "INTERNAL_LINK"],
    intents: ["PBN_TIMING", "STRATEGY_PLAN"],
    questionShapes: ["TIMING", "WORKFLOW", "SIGNAL_REQUEST"],
    applicableEntities: [
      "ngày 10",
      "ngày thứ 10",
      "day 10",
      "thời điểm đi pbn",
      "khi nào đi pbn",
      "khi nào bắn pbn",
      "thời điểm bắn pbn",
      "pbn timing",
      "bắt đầu pbn",
      "pbn sau bao lâu",
      "có nên đi pbn chưa"
    ],
    guidance: [
      "Quy trình triển khai site mới: Nhận/dựng site -> Hoàn thiện cấu trúc website -> Đặt/sản xuất Content -> Xây Entity -> Xây dựng backlink nền tảng -> Thiết lập internal link -> Quan sát tín hiệu indexing / keyword / GSC -> Tăng cường link mạnh hơn như Guest Post hoặc PBN tùy theo từng case.",
      "Thời điểm đi PBN bắt buộc dựa trên TÍN HIỆU THỰC TẾ của site: Site đã mở bot bình thường, URL chính đã được Google index sạch, không dính lỗi crawl/canonical, và bắt đầu có impression ban đầu trong GSC.",
      "Nếu người phỏng vấn hỏi 'Tại sao là ngày thứ 10?': Cần giải thích bằng tư duy tín hiệu (khoảng thời gian này site thường đã hoàn tất index on-page và bot crawl ổn định để sẵn sàng đón nhận link equity), KHÔNG ĐƯỢC coi ngày thứ 10 là mốc thần thánh hay quy tắc cứng."
    ],
    practitionerExamples: [
      "Ví dụ thực chiến: Một số practitioner có thể bắt đầu hoạt động PBN mạnh xung quanh ngày thứ 10 sau khi xác nhận bot crawl sạch và on-page đã vững."
    ],
    cautions: [
      "'Ngày thứ 10' chỉ là ví dụ quan sát từ practitioner, KHÔNG PHẢI quy tắc SEO phổ quát.",
      "Không bao giờ trả lời máy móc rằng cứ đến ngày thứ 10 là phải đi PBN; nếu site chưa index hoặc chưa có tín hiệu bot thì phải dừng lại chẩn đoán."
    ]
  },
  {
    id: "ref:no-keyword-signal-troubleshooting",
    topics: ["NO_KEYWORD_SIGNAL", "INDEXING", "ONPAGE", "INTERNAL_LINK", "TECHNICAL_SEO", "GSC", "DOMAIN_SELECTION"],
    intents: ["NO_KEYWORD_SIGNAL", "ONPAGE_DIAGNOSIS"],
    questionShapes: ["DIAGNOSIS", "NEXT_STEP", "SIGNAL_REQUEST"],
    applicableEntities: [
      "chưa nhận key",
      "không nhận key",
      "chưa nhận keyword",
      "không nhận keyword",
      "chưa có impression",
      "không có impression",
      "2 tuần chưa nhận",
      "hai tuần chưa nhận",
      "mở bot không nhận",
      "mở bot chưa nhận",
      "không cắn key",
      "chưa cắn key"
    ],
    guidance: [
      "Khi site đã index / mở bot 2 tuần nhưng chưa nhận keyword hoặc không có impression trong GSC, thực hiện quy trình chẩn đoán tuần tự, TUYỆT ĐỐI không bơm link ồ ạt:",
      "1. Re-check on-page và Search Intent: Đảm bảo nội dung thực sự giải quyết đúng search intent của người dùng iGaming ngách đó.",
      "2. Tối ưu lại Title, Meta Description và đoạn Sapo/mở đầu trực diện chứa đúng thực thể và keyword trọng tâm.",
      "3. Kiểm tra GSC URL Inspection: Xác nhận trạng thái indexing, canonical chuẩn (không bị trỏ nhầm canonical sang URL khác), không bị chặn render/bot.",
      "4. Tối ưu lại sức mạnh Homepage và luồng Internal Link: Điều hướng anchor text nội bộ từ homepage và các bài vệ tinh về thẳng money page.",
      "5. Chỉ sau khi đã tối ưu on-page, internal link nhiều lần mà vẫn không có tín hiệu GSC sau một thời gian theo dõi, mới tiến hành đánh giá lại chất lượng domain hoặc cấu trúc homepage."
    ],
    practitionerExamples: [
      "Ví dụ từ practitioner: Một số team có thể thay đổi/rebuild cấu trúc homepage hoặc đánh giá lại domain sau khi đã tối ưu lặp lại nhiều lần nhưng không nhận được tín hiệu keyword."
    ],
    cautions: [
      "TUYỆT ĐỐI KHÔNG khuyến nghị đổi domain hoặc đập homepage làm lại như hành động đầu tiên.",
      "Luôn ưu tiên chẩn đoán on-page, search intent, sapo, internal link và canonical trước."
    ]
  },
  {
    id: "ref:domain-hunting-evaluation",
    topics: ["DOMAIN_SELECTION", "EXPIRED_DOMAIN", "TLD_TESTING", "REFERRING_DOMAIN", "ANCHOR_TEXT", "REDIRECT_301"],
    intents: ["DOMAIN_SELECTION"],
    questionShapes: ["DECISION", "COMPARISON", "SIGNAL_REQUEST", "WORKFLOW", "GENERAL"],
    applicableEntities: [
      "expired domain",
      "domain cũ",
      "tên miền cũ",
      "săn domain",
      "mua domain",
      "đánh giá domain",
      "chọn domain",
      "wayback",
      "wayback machine",
      ".in",
      ".me",
      ".my",
      ".nl",
      ".co.in",
      "tld testing",
      "thử nghiệm tld",
      "đuôi tên miền",
      "domain dự phòng cho 301",
      "domain nhận 301",
      "chọn domain dự phòng"
    ],
    guidance: [
      "Bộ tiêu chí săn và đánh giá Expired Domain trong SEO iGaming:",
      "1. Kiểm tra lịch sử Wayback Machine: Xác định chủ đề quá khứ (topical relevance), loại trừ triệt để domain từng dính redirect độc hại, lịch sử cờ bạc nát, hoặc lệch ngôn ngữ/thị trường (language/history mismatch).",
      "2. Audit Backlink Profile: Kiểm tra Referring Domains tự nhiên, anchor text profile sạch (không bị spam anchor tiếng Trung, Nhật, casino bẩn).",
      "3. Organic Traffic & DR: DR chỉ là chỉ số tham khảo hỗ trợ (supporting metric), KHÔNG PHẢI yếu tố quyết định duy nhất. Domain có organic traffic lịch sử thật và referring domain chất lượng luôn được ưu tiên hơn domain DR cao ảo nhưng traffic = 0.",
      "4. Trạng thái Index: Kiểm tra khả năng index thực tế và tính sạch sẽ của domain.",
      "5. Mục đích sử dụng: Đánh giá độ phù hợp của domain để làm Money Site trực tiếp hay chỉ phù hợp làm vệ tinh / 301.",
      "6. Thử nghiệm TLD thực chiến: Practitioner thường test song song nhiều đuôi domain (.in, .me, .my, .nl, .co.in) để quan sát tín hiệu (tốc độ index, xuất hiện impression, độ nhạy nhận keyword, tốc độ thăng hạng và độ ổn định).",
      "7. Chuẩn bị domain dự phòng: Luôn nuôi sẵn các domain backup sạch trong quá trình vận hành."
    ],
    practitionerExamples: [
      "Ví dụ thực chiến về TLD testing: Một số practitioner thử nghiệm các đuôi domain như .in, .me, .my, .nl, .co.in và theo dõi xem con nào nhận tín hiệu index và impression trên GSC nhanh nhất để đẩy mạnh.",
      "Tín hiệu quan sát khi test domain/TLD: Hành vi index của Googlebot, impression xuất hiện trên GSC, độ nhạy nhận từ khóa, chuyển động thứ hạng và độ ổn định SERP."
    ],
    cautions: [
      "KHÔNG BAO GIỜ khẳng định rằng riêng cái đuôi TLD tự thân nó làm tăng thứ hạng mà không có bằng chứng.",
      "Khi trả lời các câu hỏi đào sâu của người phỏng vấn, phải phân biệt rõ ràng: Hiệu ứng TLD vs Lịch sử domain vs Hồ sơ backlink vs Authority có sẵn vs Khác biệt về content/internal link.",
      "DR cao ảo không đảm bảo chất lượng domain; bắt buộc phải soi Wayback và lịch sử traffic thật."
    ]
  },
  {
    id: "ref:ranking-maintenance-301",
    topics: ["REDIRECT_301", "RANKING_MAINTENANCE", "DOMAIN_SELECTION", "GSC", "GUEST_POST", "BACKLINK_FOUNDATION"],
    intents: ["REDIRECT_301", "GSC_RANKING_DROP"],
    questionShapes: ["DECISION", "TIMING", "WORKFLOW", "SIGNAL_REQUEST"],
    applicableEntities: [
      "redirect 301",
      "quyết định 301",
      "khi nào 301",
      "chuẩn bị 301",
      "duy trì top",
      "top maintenance",
      "giữ top",
      "chuẩn bị domain 301",
      "backup domain cho 301",
      "chuyển hướng 301"
    ],
    guidance: [
      "Chiến lược duy trì thứ hạng (Top Maintenance) trong môi trường SERP iGaming biến động mạnh:",
      "1. Duy trì các Guest Post chọn lọc từ các nguồn cùng chủ đề có traffic thật để duy trì authority đều đặn.",
      "2. Giám sát liên tục biến động thứ hạng, CTR và tín hiệu bot trên GSC.",
      "3. Theo dõi sát sao hồ sơ liên kết (link profile) để phát hiện sớm các đợt rớt link hoặc bị đối thủ bắn link bẩn.",
      "4. Chuẩn bị sẵn Domain dự phòng (Backup Domains): Nuôi và làm ấm (warm-up) sẵn các domain ứng viên phù hợp ngay trong khi money site đang trên top, nhằm chủ động phương án chuyển hướng / migration nếu site chính bị suy giảm nghiêm trọng.",
      "5. Điều kiện kích hoạt 301: 301 KHÔNG PHẢI hành động phản xạ tức thì khi thấy site vừa tụt nhẹ. Quyết định 301 chỉ được đưa ra khi: có sự suy giảm kéo dài không hồi phục, xác định rõ lỗi ở cấp độ domain (penalty/toxic history), domain backup có độ tương thích cao, và đã có bằng chứng loại trừ nguyên nhân từ on-page/content/technical."
    ],
    practitionerExamples: [
      "Ví dụ thực chiến: Practitioner chuẩn bị sẵn domain dự phòng trong lúc money site đang top để luôn có phương án 301 kịp thời khi domain chính gặp sự cố cấp độ tên miền."
    ],
    cautions: [
      "TUYỆT ĐỐI KHÔNG phát biểu: 'Site tụt top -> ngay lập tức 301'.",
      "301 là quyết định có điều kiện khắt khe; cần giải thích rõ ràng các trigger kích hoạt (suy giảm kéo dài, vấn đề cấp domain, đánh giá rủi ro) khi được hỏi."
    ]
  },
  {
    id: "ref:negative-seo-defense",
    topics: ["NEGATIVE_SEO", "REFERRING_DOMAIN", "ANCHOR_TEXT", "GSC"],
    intents: ["NEGATIVE_SEO"],
    questionShapes: ["DECISION", "DIAGNOSIS", "WORKFLOW"],
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
    guidance: [
      "Quy trình xử lý khi phát hiện dấu hiệu Negative SEO / bị đối thủ bắn link bẩn:",
      "1. Chẩn đoán và cô lập: Kiểm tra trên Ahrefs/GSC xem các link spam đó đã thực sự được Google index chưa và có tương quan trực tiếp với biến động ranking không.",
      "2. Không disavow hoảng loạn: Nếu ranking chỉ dao động bình thường và link spam chưa index, tiếp tục theo dõi; nếu xuất hiện dấu hiệu ảnh hưởng rõ rệt, lập danh sách domain rác để Disavow ở cấp độ domain (domain:example.com).",
      "3. Cân bằng lại hồ sơ liên kết: Đẩy thêm link Entity, social trust và Guest Post sạch để pha loãng anchor text spam về ngưỡng an toàn."
    ],
    practitionerExamples: [
      "Ví dụ từ practitioner: Lập file disavow nộp lên GSC ở cấp độ domain kết hợp củng cố Entity để bảo vệ site khi đối thủ tấn công anchor text cờ bạc đen."
    ],
    cautions: [
      "Không khuyến nghị disavow ngay lập tức nếu chưa kiểm tra mức độ index và ảnh hưởng thực tế của link rác."
    ]
  }
];
