# CiteDoc-VN

Đồ án Machine Learning về hỏi đáp có trích dẫn trên tài liệu tiếng Việt. Mốc đầu tiên chuyển tài liệu của ba miền thành các đoạn JSONL có thông tin nguồn.

## Chạy CiteDoc-VN

Cần Python 3.10 trở lên và Node.js 22.14 trở lên. Chạy từ thư mục gốc của repo trong PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm --prefix ui ci
npm --prefix ui run build
$env:PYTHONPATH = "src"
.\.venv\Scripts\python.exe -m uvicorn citedoc.api:app --host 127.0.0.1 --port 8000
```

Mở [CiteDoc-VN](http://127.0.0.1:8000/) để dùng giao diện hoặc [tài liệu API](http://127.0.0.1:8000/docs) để thử API. Khi sửa frontend, giữ backend chạy và dùng `npm --prefix ui run dev` trong terminal khác. Vite chuyển các yêu cầu `/api` đến cổng `8000`. Có thể đặt `CITEDOC_API_URL` trước khi chạy Vite nếu backend dùng cổng khác.

- **Thư viện** nhập TXT UTF-8, văn bản chính trong DOCX và PDF có lớp văn bản. Tệp gốc, văn bản theo trang và các đoạn được lưu trong `data/processed/catalog.sqlite3`. Có thể đổi đường dẫn bằng `CITEDOC_DB`. Tệp trùng nội dung trong cùng miền dùng lại tài liệu đã lưu. PDF scan hiện trạng thái **Cần OCR**.
- **Hỏi đáp** xếp hạng các đoạn trong miền đã chọn bằng BM25, TF-IDF hoặc Hybrid (kết hợp hai điểm lexical). Bộ trả lời trích xuất hỗ trợ các dạng câu hỏi như thời hạn, số lượng, điều kiện, vị trí và định nghĩa. Kết quả là câu nguyên văn trong tài liệu. Khi thiếu bằng chứng trực tiếp hoặc dạng câu hỏi nằm ngoài phạm vi hỗ trợ, hệ thống từ chối. Nút mở nguồn đưa người xem đến đúng số trang vật lý của PDF.
- **So sánh** đối chiếu đoạn xếp hạng đầu với câu trả lời đã lọc theo bằng chứng. **Thí nghiệm** chạy backend trên 20 câu tổng hợp từ ba miền và có thể xuất CSV. Recall@k, MRR và nDCG@k tính trên nhóm có đáp án. Bảng còn hiển thị số trích dẫn đúng và số lần từ chối đúng ở nhóm thiếu bằng chứng. Bộ mẫu phục vụ kiểm tra và minh họa.

Tệp YAML tùy chọn nhận các trường sau:

```yaml
domain: quy_che
strategy: section
retrieval: hybrid
topK: 5
normalize: true
verify: true
```

### Kiểm thử

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:PYTHONPATH = "src"
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Ca kiểm thử tạo PDF hai trang, nhập qua API, hỏi một câu mới và xác nhận trích dẫn mở đúng trang 2 ngay cả sau khi khởi động lại. Các ca khác kiểm tra từ chối câu hỏi sai loại thông tin, tài liệu trùng, phạm vi miền, DOCX, PDF cần OCR và bộ đánh giá.

## Chạy trên PowerShell

Cần Python 3.10 trở lên. Để chạy với ba tài liệu TXT minh họa:

```powershell
$env:PYTHONPATH = "src"
python -m citedoc.prepare
```

Để đọc thêm PDF có lớp văn bản, cài PyMuPDF và đặt tài liệu vào các thư mục miền tương ứng dưới `data/raw/`:

```powershell
python -m pip install -r requirements.txt
python -m citedoc.prepare --size 120 --overlap 20
```

Có thể đổi thư mục đầu vào bằng `--input` và đường dẫn JSONL bằng `--output`. Ba thư mục miền là `giao_trinh`, `quy_che` và `bai_bao`. PDF scan cần OCR trước. TXT dùng UTF-8. Văn bản đọc từ PDF và TXT được chuẩn hóa Unicode NFC.

## Dữ liệu đầu ra

Mặc định, chương trình ghi `data/processed/chunks.jsonl`. Mỗi dòng lưu định danh đoạn, đường dẫn tài liệu tương đối, văn bản gốc, vị trí trang trong file PDF tính từ 1 (có thể khác số in trên trang), đề mục nhận diện được và miền tài liệu. Với TXT, trường trang là `null`. Cửa sổ chia đoạn tính theo cụm ký tự phân cách bằng khoảng trắng, giới hạn trong từng trang và đề mục nhận diện được.

`data/eval/questions.jsonl` gồm 14 câu có đáp án kèm tài liệu, trang và trích đoạn nguyên văn, cùng 6 câu thiếu bằng chứng gắn với miền đánh giá. Nội dung minh họa do dự án tự soạn.

### PDF nhiều cột

Mặc định PDF được đọc theo vị trí trên trang. Nếu cách này trộn hai cột và PDF đã lưu văn bản theo thứ tự đọc, chọn thứ tự gốc riêng cho tài liệu đó:

```powershell
python -m citedoc.prepare --pdf-native-order bai_bao/ten_bai.pdf
```

Dùng đường dẫn tương đối dưới thư mục đầu vào, với dấu `/`. Có thể lặp lại cờ cho nhiều PDF. Kiểm tra một trang mẫu vì thứ tự lưu trong PDF phụ thuộc vào tài liệu. Văn bản đầu/chân trang có thể xuất hiện trong đoạn; số trang trích dẫn luôn lấy từ vị trí vật lý trong file.
