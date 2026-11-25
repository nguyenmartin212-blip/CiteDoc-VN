# CiteDoc-VN

Đồ án Machine Learning về hỏi đáp có trích dẫn trên tài liệu tiếng Việt. Giao diện tra cứu ba miền tài liệu và mở bằng chứng theo trang PDF.

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

- **Thư viện** nhập TXT UTF-8, văn bản chính trong DOCX và PDF. Tệp gốc, văn bản theo trang và các đoạn được lưu trong `data/processed/catalog.sqlite3`. Có thể đổi đường dẫn bằng `CITEDOC_DB`. Tệp trùng nội dung trong cùng miền dùng lại tài liệu đã lưu. Với PDF scan, bấm **Chạy OCR** để đọc các trang chưa có văn bản và cập nhật chỉ mục.
- **Hỏi đáp** xếp hạng các đoạn trong miền đã chọn bằng BM25, TF-IDF hoặc Hybrid (kết hợp hai điểm lexical). Bộ trả lời trích xuất hỗ trợ các dạng câu hỏi như thời hạn, số lượng, điều kiện, vị trí và định nghĩa. Kết quả là câu nguyên văn trong tài liệu. Khi thiếu bằng chứng trực tiếp hoặc dạng câu hỏi nằm ngoài phạm vi hỗ trợ, hệ thống từ chối. Nút mở nguồn đưa người xem đến đúng số trang vật lý của PDF.
- **So sánh** dùng cùng các đoạn truy xuất cho bộ trả lời theo quy tắc và mô hình AI cục bộ. Mô hình chọn ID câu bằng chứng, rồi backend lấy nguyên văn câu đã chọn và đối chiếu nguồn.
- **Thí nghiệm** có tập phát triển 20 câu và tập kiểm tra 24 câu. Bảng và CSV gồm Recall@k, MRR, nDCG@k, số câu trích đủ bằng chứng và số lần từ chối đúng. Benchmark dùng corpus đi kèm repo để các lần chạy có cùng dữ liệu.

### Thiết lập OCR và AI trên Windows

Chạy `./scripts/setup-runtime.ps1` một lần để tải dữ liệu OCR tiếng Việt và tiếng Anh. PyMuPDF thực hiện nhận dạng trên máy. Có thể dùng `CITEDOC_TESSDATA` để trỏ tới thư mục dữ liệu ngôn ngữ khác. PDF nhiều ảnh lớn cần nhiều thời gian hơn, và trang không nhận dạng được vẫn hiện trạng thái **Cần OCR**.

Để bật so sánh với Qwen2.5-0.5B-Instruct, chạy `./scripts/setup-runtime.ps1 -WithAI`. Lệnh tải mô hình khoảng 491 MB và runtime CPU. Mở terminal riêng và chạy:

```powershell
node scripts/local-reader.mjs data/processed/runtime/qwen2.5-0.5b-instruct-q4_k_m.gguf
```

Trong terminal của backend, đặt biến sau trước khi chạy Uvicorn:

```powershell
$env:CITEDOC_AI_MODEL = 'Qwen2.5-0.5B-Instruct-Q4_K_M'
```

Backend gọi AI qua `127.0.0.1:8081`. Nếu đổi `CITEDOC_AI_PORT`, đặt cùng giá trị ở cả hai terminal. Có thể dùng `llama-server` tương thích thay cho runtime Node và giữ cấu hình loopback. Hỏi đáp theo quy tắc vẫn chạy khi dịch vụ mô hình tắt.

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

Sau khi đã thiết lập OCR, bộ kiểm thử cũng tạo và nhận dạng một PDF scan thật. Workflow GitHub Actions chạy kiểm thử API, benchmark và build frontend trên Windows và Ubuntu.

### Tái chạy thí nghiệm

```powershell
$env:PYTHONPATH = 'src'
.\.venv\Scripts\python.exe -X utf8 -m citedoc.benchmark --split test
# Khi runtime AI đang chạy ở cổng 8081
.\.venv\Scripts\python.exe -X utf8 -m citedoc.benchmark --split test --ai-model Qwen2.5-0.5B-Instruct-Q4_K_M
```

`data/processed/benchmark/summary.csv` chứa điểm theo cấu hình và miền. `cases.csv` ghi câu trả lời và loại lỗi theo từng câu. Dùng `--output` để lưu nhiều lần chạy riêng. Xem [kịch bản bảo vệ](docs/demo.md) và [kết quả benchmark](docs/benchmark.md).

## Chạy trên PowerShell

Cần Python 3.10 trở lên. Để xử lý các tài liệu TXT đi kèm bằng CLI:

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

`data/eval/questions.jsonl` là tập phát triển với 14 câu có đáp án và 6 câu thiếu bằng chứng. `data/eval/test.jsonl` là tập kiểm tra với 15 câu có đáp án (3 câu cần nhiều đoạn) và 9 câu thiếu bằng chứng. Tài liệu quy chế là tình huống minh họa. Các bản tóm lược kỹ thuật ghi rõ nguồn tham khảo trong từng tệp.

### PDF nhiều cột

Mặc định PDF được đọc theo vị trí trên trang. Nếu cách này trộn hai cột và PDF đã lưu văn bản theo thứ tự đọc, chọn thứ tự gốc riêng cho tài liệu đó:

```powershell
python -m citedoc.prepare --pdf-native-order bai_bao/ten_bai.pdf
```

Dùng đường dẫn tương đối dưới thư mục đầu vào, với dấu `/`. Có thể lặp lại cờ cho nhiều PDF. Kiểm tra một trang mẫu vì thứ tự lưu trong PDF phụ thuộc vào tài liệu. Văn bản đầu/chân trang có thể xuất hiện trong đoạn; số trang trích dẫn luôn lấy từ vị trí vật lý trong file.
