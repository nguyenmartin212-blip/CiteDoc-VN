# CiteDoc-VN

Đồ án Machine Learning về hỏi đáp có trích dẫn trên tài liệu tiếng Việt. Mốc đầu tiên chuyển tài liệu của ba miền thành các đoạn JSONL có thông tin nguồn.

## Chạy giao diện demo

Cần Node.js 22.14 trở lên. Chạy từ thư mục gốc của repo:

```powershell
cd ui
npm ci
npm run dev
```

Mở `http://localhost:5173`. Dùng `npm run build` để tạo bản tĩnh trong `ui/dist` và `npm run preview` để xem bản build.

- **Hỏi đáp** dùng văn bản trong `data/raw` và câu hỏi trong `data/eval`. Demo hiển thị đáp án mẫu khi tìm lại được đoạn bằng chứng, trích nguyên văn khi có đoạn liên quan, và từ chối khi bằng chứng quá ít. Truy xuất và chuẩn hóa chạy trong trình duyệt.
- **Thư viện** đọc TXT UTF-8, DOCX và PDF có lớp văn bản trong phiên hiện tại. PDF scan hiện trạng thái cần OCR. Các tệp thêm vào thư viện được dùng ngay trong tra cứu theo miền đã chọn.
- **So sánh** đối chiếu đoạn xếp hạng đầu với đáp án từ bộ câu hỏi mẫu. **Thí nghiệm** tính Recall@k, MRR và nDCG@k trực tiếp từ bộ mẫu và có thể xuất CSV. Tệp YAML tùy chọn nhận các trường `domain`, `strategy`, `retrieval`, `topK`, `normalize` và `verify`, ví dụ:

```yaml
domain: quy_che
strategy: section
retrieval: hybrid
topK: 5
normalize: true
verify: true
```

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

`data/eval/questions.jsonl` có ba câu hỏi mẫu. Mỗi câu gắn với tài liệu, trang và trích đoạn nguyên văn để có thể đối chiếu khi đổi cách chia đoạn. Nội dung minh họa do dự án tự soạn và chưa đại diện cho bộ đánh giá chính thức.

### PDF nhiều cột

Mặc định PDF được đọc theo vị trí trên trang. Nếu cách này trộn hai cột và PDF đã lưu văn bản theo thứ tự đọc, chọn thứ tự gốc riêng cho tài liệu đó:

```powershell
python -m citedoc.prepare --pdf-native-order bai_bao/ten_bai.pdf
```

Dùng đường dẫn tương đối dưới thư mục đầu vào, với dấu `/`. Có thể lặp lại cờ cho nhiều PDF. Kiểm tra một trang mẫu vì thứ tự lưu trong PDF phụ thuộc vào tài liệu. Văn bản đầu/chân trang có thể xuất hiện trong đoạn; số trang trích dẫn luôn lấy từ vị trí vật lý trong file.
