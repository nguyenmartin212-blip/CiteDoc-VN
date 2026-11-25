# Kịch bản demo CiteDoc-VN

1. Mở trang **Hỏi đáp**, chọn **Quy chế / Điều – Mục / Hybrid** và chạy câu mẫu về thời hạn mượn. Bấm số trích dẫn, rồi mở tài liệu gốc để đối chiếu câu chứa `14 ngày`.
2. Hỏi `Sinh viên được mượn tối đa bao nhiêu tài liệu trong 14 ngày kể từ ngày nhận sách?` để thấy hệ thống tìm được đoạn liên quan nhưng từ chối vì thiếu số lượng được mượn.
3. Mở **Thư viện**, nhập PDF scan có một trang chứa nội dung `Phòng mô phỏng mở cửa vào thứ sáu.` ở miền Quy chế. Chọn **Chạy OCR**, xem trích đoạn và hỏi `Phòng mô phỏng mở cửa vào ngày nào?`. Trích dẫn dẫn đến trang ảnh gốc.
4. Mở **So sánh** với mô hình cục bộ đã chạy. Thử `Khu vực trả sách đặt ở đâu?` ở miền Quy chế và đối chiếu các trích dẫn. Sau đó thử `Số tiền phạt khi đến phòng máy quá giờ giữ chỗ là bao nhiêu?` để trình bày một ca AI chọn câu có thật nhưng sai loại thông tin.
5. Mở **Thí nghiệm**, chọn tập **Kiểm tra**, miền **Quy chế**, tab **E2 Truy xuất**. Chạy ba cấu hình và xuất CSV. Giải thích vì sao truy xuất được đoạn liên quan vẫn có thể chưa chọn được đủ bằng chứng.

Chuẩn bị trước tệp scan, tệp CSV và bản demo ở `127.0.0.1:8000`. Thử lại cả luồng sau khi nhập tài liệu và sau khi tải lại trang.
