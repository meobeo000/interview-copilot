import type { QuestionIntentCategory } from "../question-detector/intentClassifier";

export interface SeoBenchmarkCase {
  id: string;
  rawTranscript: string;
  expectedNormalizedTerms: string[];
  expectedIntent: QuestionIntentCategory;
  description: string;
}

export const VIETNAMESE_SEO_BENCHMARK_CASES: SeoBenchmarkCase[] = [
  {
    id: "case-01-igaming-project",
    rawTranscript: "Dự án in gaming gần nhất em từng làm là con nào vậy em?",
    expectedNormalizedTerms: ["iGaming", "dự án"],
    expectedIntent: "PROJECT_EXPERIENCE",
    description: "iGaming phonetic 'in gaming' in project experience question"
  },
  {
    id: "case-02-igaming-casino",
    rawTranscript: "Em đã từng làm qua dự án i gaming casino hay sports betting chưa?",
    expectedNormalizedTerms: ["iGaming"],
    expectedIntent: "PROJECT_EXPERIENCE",
    description: "iGaming spacing 'i gaming' in experience question"
  },
  {
    id: "case-03-no-keyword-signal",
    rawTranscript: "Site mở bot hai tuần vẫn chưa nhận key word thì em xử lý làm sao?",
    expectedNormalizedTerms: ["site", "keyword"],
    expectedIntent: "NO_KEYWORD_SIGNAL",
    description: "Key word compound split with bot opening"
  },
  {
    id: "case-04-no-keyword-phonetic",
    rawTranscript: "Con sai này mở bot hai tuần chưa nhận cây thì em làm gì tiếp theo?",
    expectedNormalizedTerms: ["con site", "keyword"],
    expectedIntent: "NO_KEYWORD_SIGNAL",
    description: "Phonetic 'con sai' and 'chưa nhận cây' in indexing question"
  },
  {
    id: "case-05-onpage-vs-tools",
    rawTranscript: "Em check g s c với ah ref trước hay on-page trước?",
    expectedNormalizedTerms: ["GSC", "Ahrefs", "on-page"],
    expectedIntent: "ONPAGE_DIAGNOSIS",
    description: "Phonetics 'g s c' and 'ah ref' in on-page diagnosis question"
  },
  {
    id: "case-06-onpage-technical-audit",
    rawTranscript: "Em check GSC với ai rép trước hay kiểm tra onpage trước khi nhận project?",
    expectedNormalizedTerms: ["GSC", "Ahrefs", "onpage"],
    expectedIntent: "ONPAGE_DIAGNOSIS",
    description: "Phonetic 'ai rép' in technical audit question"
  },
  {
    id: "case-07-pbn-timing-day10",
    rawTranscript: "Tại sao ngày thứ 10 em mới bắt đầu đi p b n?",
    expectedNormalizedTerms: ["PBN"],
    expectedIntent: "PBN_TIMING",
    description: "PBN phonetic 'p b n' with day 10 timing"
  },
  {
    id: "case-08-pbn-timing-satellite",
    rawTranscript: "Khi nào em mới bắt đầu triển khai bắn bi bi en vào money site?",
    expectedNormalizedTerms: ["PBN"],
    expectedIntent: "PBN_TIMING",
    description: "PBN phonetic 'bi bi en' in tier link timing question"
  },
  {
    id: "case-09-budget-allocation-guestpost-pbn",
    rawTranscript: "Guest port với pi bi en em chia budget thế nào cho hợp lý?",
    expectedNormalizedTerms: ["Guest Post", "PBN", "budget"],
    expectedIntent: "BUDGET_ALLOCATION",
    description: "Phonetics 'guest port' and 'pi bi en' in budget allocation"
  },
  {
    id: "case-10-budget-allocation-backlink",
    rawTranscript: "Ngân sách 50 triệu thì em chia budget cho back link và content ra sao?",
    expectedNormalizedTerms: ["budget", "backlink"],
    expectedIntent: "BUDGET_ALLOCATION",
    description: "Backlink compound split in budget allocation question"
  },
  {
    id: "case-11-domain-dr-high-traffic-zero",
    rawTranscript: "Domain này DR cao nhưng organic traffic bằng 0 thì em có lấy không?",
    expectedNormalizedTerms: ["DR", "organic traffic"],
    expectedIntent: "DOMAIN_SELECTION",
    description: "Expired domain DR vs zero organic traffic evaluation"
  },
  {
    id: "case-12-domain-wayback-backlink-profile",
    rawTranscript: "Em kiểm tra Wayback và back link profile như thế nào trước khi mua domain?",
    expectedNormalizedTerms: ["Wayback", "backlink"],
    expectedIntent: "DOMAIN_SELECTION",
    description: "Wayback history and backlink profile verification"
  },
  {
    id: "case-13-core-update-recovery",
    rawTranscript: "Site bị ảnh hưởng sau co update thì em khắc phục như thế nào?",
    expectedNormalizedTerms: ["site", "Core Update"],
    expectedIntent: "CORE_UPDATE_RECOVERY",
    description: "Phonetic 'co update' in recovery strategy question"
  },
  {
    id: "case-14-core-update-drop",
    rawTranscript: "Con sai mới bị tụt traffic nặng sau core up date của google thì làm sao?",
    expectedNormalizedTerms: ["con site", "Core Update"],
    expectedIntent: "CORE_UPDATE_RECOVERY",
    description: "Phonetic 'con sai' and 'core up date' in algorithm penalty"
  },
  {
    id: "case-15-internal-link-money-page",
    rawTranscript: "Em đi internal links cho money page như thế nào để tối ưu silo?",
    expectedNormalizedTerms: ["internal link", "money page"],
    expectedIntent: "STRATEGY_PLAN",
    description: "Internal link plural form to money page architecture"
  },
  {
    id: "case-16-anchor-text-strategy",
    rawTranscript: "Anh muốn em kiểm tra an co text và referring domain trước khi đẩy link.",
    expectedNormalizedTerms: ["anchor text", "referring domain"],
    expectedIntent: "STRATEGY_PLAN",
    description: "Phonetic 'an co text' in anchor text strategy"
  },
  {
    id: "case-17-anchor-text-ratio",
    rawTranscript: "Tỷ lệ anchor text thương hiệu và an co text chính xác em chia thế nào?",
    expectedNormalizedTerms: ["anchor text"],
    expectedIntent: "STRATEGY_PLAN",
    description: "Phonetic 'an co text' ratio division question"
  },
  {
    id: "case-18-entity-building",
    rawTranscript: "Làm thế nào để build en ti ti chuẩn cho một site iGaming mới?",
    expectedNormalizedTerms: ["Entity", "iGaming"],
    expectedIntent: "STRATEGY_PLAN",
    description: "Phonetic 'en ti ti' in entity building plan"
  },
  {
    id: "case-19-gsc-ranking-drop-clicks",
    rawTranscript: "Kiểm tra g s c thấy click và impression tụt đột ngột thì chẩn đoán ra sao?",
    expectedNormalizedTerms: ["GSC"],
    expectedIntent: "GSC_RANKING_DROP",
    description: "Phonetic 'g s c' with sudden ranking & impression drop"
  },
  {
    id: "case-20-gsc-ranking-loss",
    rawTranscript: "Thứ hạng từ khóa tụt trên Google Search Console thì bước đầu tiên em check gì?",
    expectedNormalizedTerms: ["Google Search Console"],
    expectedIntent: "GSC_RANKING_DROP",
    description: "Direct ranking drop diagnosis on GSC"
  },
  {
    id: "case-21-negative-seo-spam-links",
    rawTranscript: "Site bị đối thủ spam link bẩn và bắn back link xấu thì em disavow thế nào?",
    expectedNormalizedTerms: ["backlink"],
    expectedIntent: "NEGATIVE_SEO",
    description: "Negative SEO spam attack and disavow workflow"
  },
  {
    id: "case-22-negative-seo-defense",
    rawTranscript: "Nếu phát hiện negative SEO bắn hàng nghìn link 18+ thì xử lý sao em?",
    expectedNormalizedTerms: ["negative SEO"],
    expectedIntent: "NEGATIVE_SEO",
    description: "Negative SEO malicious backlinks handling"
  },
  {
    id: "case-23-redirect-301-domain",
    rawTranscript: "Khi chuyển hướng 301 domain cũ sang domain mới em giữ link juice như thế nào?",
    expectedNormalizedTerms: ["301"],
    expectedIntent: "REDIRECT_301",
    description: "301 redirect link juice preservation"
  },
  {
    id: "case-24-redirect-301-expired",
    rawTranscript: "Cách redirect 301 từ expired domain về money site để không bị dính penalty?",
    expectedNormalizedTerms: ["301", "expired domain"],
    expectedIntent: "REDIRECT_301",
    description: "301 redirect from expired domain to money site"
  },
  {
    id: "case-25-ahrefs-domain-audit",
    rawTranscript: "Dùng a href check referring domain và backlink profile của đối thủ như thế nào?",
    expectedNormalizedTerms: ["Ahrefs", "referring domain", "backlink"],
    expectedIntent: "DOMAIN_SELECTION",
    description: "Phonetic 'a href' in competitor domain analysis"
  },
  {
    id: "case-26-guest-post-outreach",
    rawTranscript: "Tiêu chí chọn site đi gét pót chất lượng cao của em là gì?",
    expectedNormalizedTerms: ["Guest Post"],
    expectedIntent: "STRATEGY_PLAN",
    description: "Phonetic 'gét pót' in outreach strategy criteria"
  },
  {
    id: "case-27-false-positive-sai-preservation",
    rawTranscript: "Nếu nhân viên làm sai canonical hoặc nói sai cấu trúc URL thì sửa thế nào?",
    expectedNormalizedTerms: ["làm sai", "nói sai", "canonical"],
    expectedIntent: "ONPAGE_DIAGNOSIS",
    description: "Strict preservation of 'làm sai' and 'nói sai' (never converted to site)"
  },
  {
    id: "case-28-site-satellite-pbn",
    rawTranscript: "Xây dựng hệ thống sai vệ tinh cho i gaming mất bao lâu?",
    expectedNormalizedTerms: ["site vệ tinh", "iGaming"],
    expectedIntent: "PROJECT_EXPERIENCE",
    description: "Conversion of 'sai vệ tinh' to 'site vệ tinh' with iGaming"
  },
  {
    id: "case-29-unknown-casual-greeting",
    rawTranscript: "Alo em có nghe rõ anh nói không, chuẩn bị bắt đầu phỏng vấn nhé.",
    expectedNormalizedTerms: [],
    expectedIntent: "UNKNOWN",
    description: "Background small talk / audio check (must yield UNKNOWN intent)"
  },
  {
    id: "case-30-unknown-interview-logistics",
    rawTranscript: "Anh vừa gửi file qua tin nhắn, em mở lên xem thử đi nhé.",
    expectedNormalizedTerms: [],
    expectedIntent: "UNKNOWN",
    description: "Logistics message without SEO question intent (must yield UNKNOWN)"
  },
  {
    id: "case-31-unknown-filler-speech",
    rawTranscript: "Ờ ừm để anh xem lại một chút thông tin trên CV của em nhé.",
    expectedNormalizedTerms: [],
    expectedIntent: "UNKNOWN",
    description: "Interviewer filler remarks before asking (must yield UNKNOWN)"
  },
  {
    id: "case-32-no-keyword-bot-open",
    rawTranscript: "Site mới mở bot 10 ngày chưa nhận keyword thì phương án xử lý là gì?",
    expectedNormalizedTerms: ["site", "keyword"],
    expectedIntent: "NO_KEYWORD_SIGNAL",
    description: "New site bot crawling but keyword indexing missing"
  }
];
