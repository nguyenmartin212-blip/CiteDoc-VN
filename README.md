# CiteDoc-VN

Đồ án Machine Learning về hỏi đáp có trích dẫn trên tài liệu tiếng Việt. Mốc đầu tiên chuyển tài liệu của ba miền thành các đoạn JSONL có thông tin nguồn.

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

Có thể đổi thư mục đầu vào bằng `--input` và đường dẫn JSONL bằng `--output`. Ba thư mục miền là `giao_trinh`, `quy_che` và `bai_bao`. PDF scan cần OCR trước. TXT dùng UTF-8.

## Dữ liệu đầu ra

Mặc định, chương trình ghi `data/processed/chunks.jsonl`. Mỗi dòng lưu định danh đoạn, đường dẫn tài liệu tương đối, văn bản gốc, trang PDF tính từ 1, đề mục nhận diện được và miền tài liệu. Với TXT, trường trang là `null`. Cửa sổ chia đoạn tính theo cụm ký tự phân cách bằng khoảng trắng, giới hạn trong từng trang và đề mục nhận diện được.

`data/eval/questions.jsonl` có ba câu hỏi mẫu. Mỗi câu gắn với tài liệu, trang và trích đoạn nguyên văn để có thể đối chiếu khi đổi cách chia đoạn. Nội dung minh họa do dự án tự soạn và chưa đại diện cho bộ đánh giá chính thức.
