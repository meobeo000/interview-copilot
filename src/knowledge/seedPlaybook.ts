import type { KnowledgeChunk } from "./types";
import { validateAndEnforceSafety } from "./types";

export const DEFAULT_PRACTITIONER_PLAYBOOK_CHUNKS: KnowledgeChunk[] = [
  validateAndEnforceSafety({
    id: "practitioner:budget:20m-workflow",
    sourceType: "practitioner_playbook",
    topic: "BUDGET",
    title: "Phân bổ ngân sách khởi điểm 20 triệu VNĐ cho site iGaming mới",
    content:
      "Kinh nghiệm từ practitioner: Với dự án iGaming khởi điểm ngân sách khoảng 20 triệu VNĐ, quy trình triển khai thực tế gồm các bước tuần tự: (1) Chuẩn bị site kỹ lưỡng & book content chuẩn search intent; (2) Xây dựng Entity đa tầng và backlink nền tảng (social trust, profile); (3) Triển khai tầng link bổ trợ (forum chất lượng, blog comment liên quan, Web 2.0 tạo nền); (4) Sau đó mới phân bổ ngân sách cho PBN/Guest Post tùy theo tín hiệu nhận key và độ ổn định index của site.",
    tags: ["budget", "ngân sách", "20 triệu", "entity", "web 2.0", "backlink nền", "forum", "phân bổ chi phí", "igaming"],
    sourceName: "SEO Practitioner Notes (iGaming Workflow)",
    market: "iGaming",
    geo: "VN"
  }),

  validateAndEnforceSafety({
    id: "practitioner:pbn:timing-signal-workflow",
    sourceType: "practitioner_playbook",
    topic: "PBN_TIMING",
    title: "Thời điểm đi PBN theo tín hiệu site (Ví dụ thực chiến ~ngày 10)",
    content:
      "Kinh nghiệm từ practitioner: Trong một case study thực tế, practitioner bắt đầu bắn PBN xung quanh ngày thứ 10 sau khi site đã được mở bot và có tín hiệu index sạch. Lưu ý: Đây là quy trình tham khảo dựa trên tín hiệu crawl và phản hồi của Google trên site cụ thể, không phải quy tắc SEO cứng nhắc. Nguyên tắc cốt lõi là chỉ đi PBN khi site đã hoàn thiện on-page, có link nền trust và không dính lỗi crawl/indexing.",
    tags: ["pbn", "thời điểm", "ngày 10", "tín hiệu site", "pbn timing", "bắn link", "vệ tinh"],
    sourceName: "SEO Practitioner Notes (PBN Rollout)",
    market: "iGaming",
    geo: "VN"
  }),

  validateAndEnforceSafety({
    id: "practitioner:indexing:no-keyword-signal-diagnosis",
    sourceType: "practitioner_playbook",
    topic: "NO_KEYWORD_SIGNAL",
    title: "Xử lý site đã mở bot / index 2 tuần nhưng chưa nhận keyword",
    content:
      "Kinh nghiệm từ practitioner: Khi site đã mở bot và index bình thường nhưng sau 2 tuần vẫn chưa nhận keyword hoặc không có impression/ranking, practitioner ưu tiên quy trình chẩn đoán: (1) Không vội vàng bơm backlink ồ ạt; (2) Recheck on-page, tối ưu lại Title, Meta Description và đoạn Sapo mở đầu theo đúng search intent ngách; (3) Ép re-index các URL trọng điểm; (4) Tối ưu lại cấu trúc homepage và điều hướng internal link về money page; (5) Đánh giá lại chất lượng domain và kiểm tra GSC để loại trừ canonical sai hoặc hạn chế crawl.",
    tags: ["no keyword signal", "chưa nhận key", "mở bot", "2 tuần", "title", "meta", "sapo", "internal link", "indexing", "gsc"],
    sourceName: "SEO Practitioner Notes (Indexing & Ranking Signal)",
    market: "iGaming",
    geo: "VN"
  }),

  validateAndEnforceSafety({
    id: "practitioner:domain:selection-tld-testing",
    sourceType: "practitioner_playbook",
    topic: "DOMAIN_SELECTION",
    title: "Đánh giá Domain, Expired Domain và Thử nghiệm TLD ngách iGaming",
    content:
      "Kinh nghiệm từ practitioner: Lựa chọn domain là yếu tố sống còn trong SEO iGaming. Practitioner chú trọng kiểm tra kỹ: (1) Lịch sử Wayback Machine tránh dính link bẩn, redirect độc hại hoặc lịch sử cờ bạc nát; (2) Backlink profile sạch với referring domain tự nhiên; (3) DR/UR thực chất có organic traffic thật chứ không phải link kéo ảo. Ngoài ra, practitioner từng thử nghiệm hiệu quả các đuôi tên miền (TLD) như .in, .me, .my, .nl, .co.in để đánh giá tốc độ index và độ nhạy nhận key.",
    tags: ["domain", "expired domain", "tld", ".in", ".me", ".my", ".nl", ".co.in", "wayback", "referring domain", "dr"],
    sourceName: "SEO Practitioner Notes (Domain & TLD Selection)",
    market: "iGaming",
    geo: "VN"
  }),

  validateAndEnforceSafety({
    id: "practitioner:ranking:maintenance-and-301",
    sourceType: "practitioner_playbook",
    topic: "RANKING_MAINTENANCE",
    title: "Duy trì thứ hạng sau khi lên top và chuẩn bị phương án Redirect 301",
    content:
      "Kinh nghiệm từ practitioner: Sau khi từ khóa đã lên top ổn định, chiến lược tiếp theo gồm: (1) Tiếp tục đi Guest Post chọn lọc từ các nguồn cùng chủ đề có traffic thật để củng cố authority; (2) Theo dõi sát biến động thứ hạng và CTR trên GSC; (3) Luôn nuôi và chuẩn bị sẵn các domain dự phòng sạch (warm-up trước) để sẵn sàng triển khai kịch bản 301 chuyển hướng giữ juice khi domain chính gặp rủi ro biến động.",
    tags: ["ranking maintenance", "duy trì top", "guest post", "301", "redirect 301", "dự phòng", "gsc"],
    sourceName: "SEO Practitioner Notes (Post-Ranking & 301)",
    market: "iGaming",
    geo: "VN"
  }),

  validateAndEnforceSafety({
    id: "practitioner:negative-seo:disavow-workflow",
    sourceType: "practitioner_playbook",
    topic: "NEGATIVE_SEO",
    title: "Xử lý đòn tấn công Negative SEO và spam backlink từ đối thủ",
    content:
      "Kinh nghiệm từ practitioner: Khi phát hiện dấu hiệu bị bắn link bẩn (anchor text cờ bạc đen, anchor tiếng lạ, đột biến referring domain rác): (1) Audit ngay Ahrefs/GSC để cô lập danh sách domain độc hại; (2) Lập file disavow nộp lên GSC ở cấp độ domain (domain:example.com); (3) Củng cố lại Entity và đẩy thêm link trust sạch từ social/báo để cân bằng lại tỷ lệ anchor text an toàn.",
    tags: ["negative seo", "link bẩn", "spam link", "disavow", "anchor text", "đối thủ", "gsc"],
    sourceName: "SEO Practitioner Notes (Negative SEO Defense)",
    market: "iGaming",
    geo: "VN"
  })
];
