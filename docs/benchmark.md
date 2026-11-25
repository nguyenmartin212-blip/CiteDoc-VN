# Kết quả thử nghiệm CiteDoc-VN

## Thiết lập

Corpus đi kèm gồm 10 tài liệu trong ba miền. Tập phát triển có 20 câu. Tập kiểm tra có 24 câu riêng, gồm 15 câu có đáp án và 9 câu thiếu bằng chứng. Ba câu có đáp án yêu cầu hai đoạn thuộc các tài liệu khác nhau. Các bài viết kỹ thuật trong corpus là bản tóm lược tiếng Việt của nguồn đã dẫn. Quy chế trong corpus là tình huống mô phỏng.

Ba thuật toán dùng cùng corpus, chia đoạn Điều – Mục, chuẩn hóa truy vấn và lấy 5 đoạn. Hybrid trung bình hóa điểm BM25 và TF-IDF sau khi chuẩn hóa điểm trong mỗi truy vấn. Recall tính tỷ lệ bằng chứng tìm được. MRR dùng hạng của đoạn liên quan đầu tiên. nDCG tính điểm theo hạng và mỗi đoạn chỉ tăng điểm khi nó bổ sung bằng chứng chưa thấy. Câu trả lời được tính đúng khi tất cả bằng chứng gán nhãn có mặt trong các trích dẫn nguyên văn và mỗi trích dẫn chứa ít nhất một bằng chứng gán nhãn. Trường hợp từ chối được đo riêng trên 9 câu thiếu bằng chứng.

## Truy xuất và câu trả lời theo quy tắc

Số liệu gộp trên ba miền, làm tròn đến ba chữ số thập phân.

| Truy xuất | Recall@5 | MRR | nDCG@5 | Câu trích đủ bằng chứng | Từ chối đúng |
|---|---:|---:|---:|---:|---:|
| BM25 | 1,000 | 0,967 | 0,974 | 5/15 | 9/9 |
| TF-IDF | 1,000 | 0,967 | 0,974 | 5/15 | 9/9 |
| Hybrid | 1,000 | 0,967 | 0,974 | 5/15 | 9/9 |

Ba phương pháp cho cùng điểm trên corpus nhỏ này. Điểm truy xuất cao đi kèm nhiều ca thiếu câu trả lời vì bộ quy tắc đòi hỏi từ khóa chủ đề và dấu hiệu của đúng loại thông tin. Ví dụ, `test-qc-02` dùng cụm “đặt chỗ” trong câu hỏi và “giữ chỗ” trong nguồn. `test-gt-05` yêu cầu đồng thời hai bằng chứng về vai trò tập kiểm thử và thời điểm chia dữ liệu.

## So sánh với AI cục bộ

Cả hai cách trả lời nhận cùng top 5 đoạn Hybrid. Qwen chạy bản Q4_K_M trên CPU i5-1235U. Mô hình chọn ID câu, còn ứng dụng lấy nguyên văn câu tương ứng.

| Bộ trả lời | Câu trích đủ bằng chứng | Từ chối đúng |
|---|---:|---:|
| Quy tắc | 5/15 | 9/9 |
| Qwen2.5-0.5B-Instruct | 0/15 | 0/9 |

Qwen chọn câu cho cả 24 truy vấn và mất trung bình khoảng 9,5 giây mỗi câu trong lần chạy này. Ví dụ, `test-qc-06` hỏi tiền phạt, nhưng mô hình chọn các đoạn về lịch mở cửa và số tài liệu. Đây là lỗi chọn bằng chứng: câu được chép đúng từ nguồn nhưng không trả lời câu hỏi. Bản demo dùng quy tắc cho màn hình Hỏi đáp và dành Qwen cho màn hình So sánh. Không suy rộng kết quả của một mô hình nhỏ trên 24 câu sang các mô hình AI khác. [Bản phát hành Qwen](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF)

## Kiểm thử tài liệu và chạy lại

Đã nhập bản PDF PhoBERT công khai, lập chỉ mục 37 đoạn trên 6 trang, tìm đoạn về kích thước dữ liệu tiền huấn luyện ở trang vật lý 2 và xác nhận tải lại đúng tệp nguồn. Đã OCR một PDF ảnh tiếng Việt, tra cứu được lịch mở cửa và nhận trích dẫn về trang 1. Nhận dạng có thể dính từ ở một số cụm, vì vậy bản demo giữ câu OCR nguyên văn để người dùng đối chiếu với ảnh gốc. [PDF PhoBERT gốc](https://aclanthology.org/2020.findings-emnlp.92.pdf)

Chạy `python -m citedoc.benchmark --split test` với `PYTHONPATH=src` để tạo `summary.csv` và `cases.csv`. Xem README để chạy thêm mô hình AI. Số liệu phù hợp để trình bày phương pháp, so sánh và phân tích lỗi trên bộ minh họa hiện có.
