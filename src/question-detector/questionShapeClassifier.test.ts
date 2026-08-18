import { describe, it, expect } from "vitest";
import { classifyQuestionShape } from "./questionShapeClassifier";

describe("QuestionShapeClassifier", () => {
  it("classifies DECISION shape inquiries accurately", () => {
    expect(classifyQuestionShape("Domain A DR 55 traffic bằng 0, domain B DR 20 có traffic thật. Em chọn domain nào?").primaryShape).toBe("DECISION");
    expect(classifyQuestionShape("Giữa con domain cũ DR cao mà history rác và con domain DR vừa nhưng sạch, em ưu tiên con nào?").primaryShape).toBe("DECISION");
    expect(classifyQuestionShape("Nếu nghi negative SEO thì em có disavow ngay không?").primaryShape).toBe("DECISION");
    expect(classifyQuestionShape("Con expired domain này em dựng site riêng hay 301 về money site?").primaryShape).toBe("DECISION");
    expect(classifyQuestionShape("Con domain này DR 45 nhưng traffic rớt về 0 từ 2 năm trước, em có mua không?").primaryShape).toBe("DECISION");
  });

  it("classifies DIAGNOSIS shape inquiries accurately", () => {
    expect(classifyQuestionShape("Dựa trên tín hiệu từ GSC, khi traffic giảm đột ngột thì em bóc tách những metric nào?").primaryShape).toBe("DIAGNOSIS");
    expect(classifyQuestionShape("Site tụt nhưng không có Core Update và referring domain không thay đổi, em check gì trước?").primaryShape).toBe("DIAGNOSIS");
    expect(classifyQuestionShape("Hai landing page cùng cạnh tranh 1 keyword và ăn thịt lẫn nhau (cannibalization), em xử lý thế nào?").primaryShape).toBe("DIAGNOSIS");
    expect(classifyQuestionShape("URL đã index và có impression trong GSC nhưng ranking chỉ lẹt đẹt top 40, em tối ưu tiếp thế nào?").primaryShape).toBe("DIAGNOSIS");
  });

  it("classifies ALLOCATION shape inquiries accurately", () => {
    expect(classifyQuestionShape("Budget 20 triệu em phân bổ Content, Entity, Guest Post và PBN thế nào?").primaryShape).toBe("ALLOCATION");
    expect(classifyQuestionShape("Em chia tỷ lệ anchor text cho money site thế nào? Brand, URL, generic và exact match phân bổ bao nhiêu %?").primaryShape).toBe("ALLOCATION");
    expect(classifyQuestionShape("Giai đoạn đầu em phân bổ bao nhiêu phần trăm anchor brand và bao nhiêu exact match?").primaryShape).toBe("ALLOCATION");
    expect(classifyQuestionShape("Với 50 triệu ngân sách link building tháng đầu, em chia tiền cho báo và PBN ra sao?").primaryShape).toBe("ALLOCATION");
  });

  it("classifies TIMING shape inquiries accurately", () => {
    expect(classifyQuestionShape("Khoảng khi nào em bắt đầu đi PBN? Dựa vào tín hiệu nào để em tăng link PBN?").primaryShape).toBe("TIMING");
    expect(classifyQuestionShape("Site có tín hiệu tới mức nào thì em mới bật PBN?").primaryShape).toBe("TIMING");
    expect(classifyQuestionShape("PBN nên vào ở stage nào của site? Bao lâu thì dừng nếu không thấy tín hiệu?").primaryShape).toBe("TIMING");
    expect(classifyQuestionShape("Khi nào em mới quyết định redirect 301 expired domain về money site?").primaryShape).toBe("TIMING");
  });

  it("classifies WORKFLOW shape inquiries accurately", () => {
    expect(classifyQuestionShape("Anh giao cho em một money site betting mới hoàn toàn, em lên kế hoạch triển khai từ lúc nhận site như thế nào?").primaryShape).toBe("WORKFLOW");
    expect(classifyQuestionShape("Khi nhận một site mới toanh chưa có gì, trong 30 ngày đầu em audit và triển khai những gì?").primaryShape).toBe("WORKFLOW");
    expect(classifyQuestionShape("Quy trình triển khai SEO từ đầu cho domain mới của em gồm các bước nào?").primaryShape).toBe("WORKFLOW");
    expect(classifyQuestionShape("Em xây dựng cấu trúc internal link và silo cho money site như thế nào?").primaryShape).toBe("WORKFLOW");
  });
});
