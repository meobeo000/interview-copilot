import { matchUnicodePattern, normalizeSemanticText } from "../shared/semanticTextMatcher";

export type QuestionShape =
  | "DECISION"
  | "DIAGNOSIS"
  | "ALLOCATION"
  | "TIMING"
  | "WORKFLOW"
  | "COMPARISON"
  | "SIGNAL_REQUEST"
  | "NEXT_STEP"
  | "GENERAL";

export interface QuestionShapeResult {
  primaryShape: QuestionShape;
  secondaryShapes: QuestionShape[];
  confidence: number;
  signals: string[];
}

/**
 * Deterministically classifies the pragmatic "question shape" of an interview inquiry.
 * This identifies WHAT the interviewer is asking for (a decision, a diagnosis, an allocation,
 * a timing threshold, a workflow, etc.) independently of specific SEO topic keywords.
 */
export function classifyQuestionShape(questionText: string): QuestionShapeResult {
  const text = normalizeSemanticText(questionText).toLowerCase();
  const signals: string[] = [];
  const detectedShapes: { shape: QuestionShape; weight: number }[] = [];

  // 1. DECISION (Choose between options, buy vs skip, disavow vs wait, rebuild vs redirect)
  const decisionPatterns = [
    "(?:chọn|lấy|mua|ưu\\s+tiên)\\s+(?:con|domain|site|cái|cách|phương\\s+án|bài)?\\s*(?:nào|gì|[ab]|cũ|mới)",
    "(?:chọn|lấy|mua)\\s*(?:con|domain|site)?\\s*[ab]",
    "(?:nên|có\\s+nên|em\\s+có|có)\\s+(?:disavow|redirect|301|mua|lấy|bỏ|chặn|xóa)\\s+(?:ngay|luôn|không|chưa|expired\\s+domain)?",
    "(?:rebuild|dựng\\s+site\\s+riêng|làm\\s+site\\s+mới)\\s+hay\\s+(?:301|redirect)",
    "domain\\s+a\\s+hay\\s+domain\\s+b|con\\s+a\\s+hay\\s+con\\s+b|site\\s+a\\s+hay\\s+site\\s+b|toàn\\s+trang\\s+hay\\s+chỉ\\s+redirect",
    "giữ\\s+lại\\s+hay\\s+bỏ|lấy\\s+hay\\s+không|có\\s+mua\\s+không|mua\\s+không|merge\\s+bài\\s+hay\\s+sửa"
  ];
  for (const pattern of decisionPatterns) {
    const match = matchUnicodePattern(text, pattern);
    if (match) {
      signals.push(`decision:${match[0]}`);
      detectedShapes.push({ shape: "DECISION", weight: 7 });
      break;
    }
  }

  // 2. DIAGNOSIS (Investigate, inspect, root-cause, find why something dropped or failed)
  const diagnosisPatterns = [
    "(?:check|kiểm\\s+tra|bóc\\s+tách|soi|đo|audit|rà\\s+soát)\\s+(?:gì|những\\s+gì|cái\\s+gì|chỉ\\s+số\\s+nào|yếu\\s+tố\\s+nào|ở\\s+đâu|trước|đầu\\s+tiên|search\\s+intent|ahrefs)",
    "(?:nguyên\\s+nhân|lý\\s+do|tại\\s+sao|vì\\s+sao|do\\s+đâu)\\s+(?:tụt|giảm|mất|không\\s+lên|không\\s+nhận|rớt|bị\\s+phạt|cannibalize|ăn\\s+thịt)",
    "(?:xử\\s+lý|khắc\\s+phục|sửa|cứu|handle|tối\\s+ưu\\s+tiếp)\\s+(?:thế\\s+nào|ra\\s+sao|như\\s+thế\\s+nào|sao)",
    "(?:tụt|giảm|rớt|mất)\\s+(?:traffic|ranking|top|thứ\\s+hạng|click|impression|từ\\s+khóa|một\\s+nửa)",
    "cannibalization|ăn\\s+thịt\\s+từ\\s+khóa|trùng\\s+lặp\\s+intent|cạnh\\s+tranh\\s+lẫn\\s+nhau|cùng\\s+rank|nhận\\s+nhầm\\s+url|kẹt\\s+ở\\s+top|lẹt\\s+đẹt\\s+top|chưa\\s+vào\\s+top",
    "em\\s+check\\s+gì\\s+trước|em\\s+kiểm\\s+tra\\s+gì\\s+đầu\\s+tiên|bước\\s+đầu\\s+em\\s+check\\s+gì|hướng\\s+xử\\s+lý\\s+của\\s+em|em\\s+bóc\\s+tách\\s+lỗi\\s+gì|em\\s+làm\\s+gì\\s+đầu\\s+tiên|tiêu\\s+chí\\s+săn|bóc\\s+tách\\s+những\\s+metric\\s+nào|khi\\s+traffic\\s+giảm"
  ];
  for (const pattern of diagnosisPatterns) {
    const match = matchUnicodePattern(text, pattern);
    if (match) {
      signals.push(`diagnosis:${match[0]}`);
      detectedShapes.push({ shape: "DIAGNOSIS", weight: 6 });
      break;
    }
  }

  // 3. ALLOCATION (Distribution of money, budget, percentages, anchor text ratios)
  const allocationPatterns = [
    "phân\\s+bổ|chia|tỷ\\s+lệ|phần\\s+trăm|dành\\s+bao\\s+nhiêu|bao\\s+nhiêu\\s*%|allocate",
    "chia\\s+ngân\\s+sách|phân\\s+bổ\\s+ngân\\s+sách|chia\\s+tiền|chia\\s+budget|ngân\\s+sách\\s+link\\s+building",
    "chia\\s+anchor|tỷ\\s+lệ\\s+anchor|phân\\s+bổ\\s+anchor|chia\\s+anchor\\s+text|tỷ\\s+lệ\\s+anchor\\s+text",
    "brand\\s+bao\\s+nhiêu|exact\\s+match\\s+bao\\s+nhiêu|generic\\s+bao\\s+nhiêu|tỷ\\s+lệ\\s+thế\\s+nào|chia\\s+tiền\\s+cho|phân\\s+bổ\\s+content"
  ];
  for (const pattern of allocationPatterns) {
    const match = matchUnicodePattern(text, pattern);
    if (match) {
      signals.push(`allocation:${match[0]}`);
      detectedShapes.push({ shape: "ALLOCATION", weight: 6 });
      break;
    }
  }

  // 4. TIMING (When to start/stop, threshold signals for launching a phase)
  const timingPatterns = [
    "(?:khi\\s+nào|bao\\s+giờ|mốc\\s+nào|thời\\s+điểm\\s+nào|giai\\s+đoạn\\s+nào|stage\\s+nào)\\s*(?:thì|bắt\\s+đầu|em|mới|nên|dừng|tăng|đi|mới\\s+quyết\\s+định)",
    "(?:bao\\s+lâu|mấy\\s+ngày|mấy\\s+tuần|mấy\\s+tháng)\\s*(?:thì|bắt\\s+đầu|mới|dừng|đi\\s+link|tăng\\s+link)",
    "(?:tín\\s+hiệu\\s+nào|dựa\\s+vào\\s+tín\\s+hiệu\\s+nào|nhìn\\s+vào\\s+chỉ\\s+số\\s+nào|đạt\\s+mức\\s+nào|tới\\s+mức\\s+nào|tín\\s+hiệu\\s+tới\\s+mức\\s+nào)(?:.*?)(?:bật|tăng|đi\\s+link|triển\\s+khai|bắt\\s+đầu|dừng)",
    "khi\\s+nào\\s+em\\s+dừng|khi\\s+nào\\s+thì\\s+dừng|bao\\s+lâu\\s+thì\\s+dừng|stage\\s+nào\\s+của\\s+site|khoảng\\s+khi\\s+nào"
  ];
  for (const pattern of timingPatterns) {
    const match = matchUnicodePattern(text, pattern);
    if (match) {
      signals.push(`timing:${match[0]}`);
      detectedShapes.push({ shape: "TIMING", weight: 6 });
      break;
    }
  }

  // 5. WORKFLOW (Sequential roadmap, 30-day plan, audit steps from scratch)
  const workflowPatterns = [
    "trong\\s+\\d+\\s+ngày\\s+đầu|tháng\\s+đầu|giai\\s+đoạn\\s+đầu|tuần\\s+đầu",
    "từ\\s+lúc\\s+nhận\\s+site|từ\\s+đầu|các\\s+bước\\s+triển\\s+khai|quy\\s+trình|roadmap|kế\\s+hoạch|kế\\s+hoạch\\s+triển\\s+khai",
    "theo\\s+thứ\\s+tự\\s+nào|thứ\\s+tự\\s+triển\\s+khai|trước\\s+sau\\s+như\\s+thế\\s+nào|xây\\s+dựng\\s+cấu\\s+trúc",
    "audit\\s+site\\s+mới|nhận\\s+site\\s+mới|triển\\s+khai\\s+từ\\s+đầu|tối\\s+ưu\\s+on-page\\s+title"
  ];
  for (const pattern of workflowPatterns) {
    const match = matchUnicodePattern(text, pattern);
    if (match) {
      signals.push(`workflow:${match[0]}`);
      detectedShapes.push({ shape: "WORKFLOW", weight: 5 });
      break;
    }
  }

  // 6. COMPARISON (Compare two items, metrics, or methods)
  const comparisonPatterns = [
    "so\\s+sánh|khác\\s+nhau\\s+thế\\s+nào|khác\\s+gì|ưu\\s+nhược\\s+điểm",
    "giữa\\s+.+\\s+và\\s+.+|so\\s+với"
  ];
  for (const pattern of comparisonPatterns) {
    const match = matchUnicodePattern(text, pattern);
    if (match) {
      signals.push(`comparison:${match[0]}`);
      detectedShapes.push({ shape: "COMPARISON", weight: 4 });
      break;
    }
  }

  // 7. SIGNAL_REQUEST (What signals or metrics are used to make decisions)
  const signalPatterns = [
    "tín\\s+hiệu\\s+nào|dựa\\s+vào\\s+đâu|dựa\\s+trên\\s+tín\\s+hiệu\\s+nào|nhìn\\s+vào\\s+metric\\s+nào|dựa\\s+trên\\s+cơ\\s+sở\\s+nào|nhìn\\s+vào\\s+metric\\s+gì",
    "chỉ\\s+số\\s+nào|dấu\\s+hiệu\\s+nào|căn\\s+cứ\\s+vào\\s+đâu"
  ];
  for (const pattern of signalPatterns) {
    const match = matchUnicodePattern(text, pattern);
    if (match) {
      signals.push(`signal:${match[0]}`);
      detectedShapes.push({ shape: "SIGNAL_REQUEST", weight: 5 });
      break;
    }
  }

  // 8. NEXT_STEP (Continuation on failure or next action)
  const nextStepPatterns = [
    /\b(bước tiếp theo là gì|bước tiếp theo làm gì|làm gì tiếp theo|tiếp theo làm gì|vậy em check gì tiếp)\b/i,
    /\b(nếu vẫn không lên thì sao|nếu không lên thì sao|nếu vẫn tụt thì sao|nếu không hiệu quả thì sao)\b/i
  ];
  for (const pattern of nextStepPatterns) {
    const match = text.match(pattern);
    if (match) {
      signals.push(`next_step:${match[0]}`);
      detectedShapes.push({ shape: "NEXT_STEP", weight: 5 });
      break;
    }
  }

  if (detectedShapes.length === 0) {
    return {
      primaryShape: "GENERAL",
      secondaryShapes: [],
      confidence: 0.5,
      signals: []
    };
  }

  // Sort by weight descending
  detectedShapes.sort((a, b) => b.weight - a.weight);

  const primaryShape = detectedShapes[0].shape;
  const secondaryShapes = Array.from(
    new Set(detectedShapes.slice(1).map((s) => s.shape))
  ).filter((s) => s !== primaryShape);

  const confidence = Math.min(0.98, 0.7 + detectedShapes[0].weight * 0.05);

  return {
    primaryShape,
    secondaryShapes,
    confidence,
    signals
  };
}
