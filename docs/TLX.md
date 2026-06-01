# **TÀI LIỆU TỔNG QUAN VÀ ĐẶC TẢ CHỨC NĂNG: TLX ENGINE**

## **1\. Mục đích & Định vị Dự án**

* **Tên dự án:** TLX Engine (Tan-Luan eXecution)  
* **Định vị:** Công cụ Local-First UI/UX Testing & Mapping (Kiểm thử và Vẽ bản đồ giao diện chạy cục bộ).  
* **Mục đích cốt lõi:**  
  1. Tự động hóa việc phát hiện lỗi giao diện (đè lấp, tràn viền, vỡ layout) và lỗi logic Frontend ngay tại máy Dev với tốc độ mili-giây.  
  2. Giảm thiểu chi phí và thời gian so với việc dùng 100% LLM bằng **Kiến trúc Lai (Hybrid):** 90% dùng thuật toán hình học/AST miễn phí, 10% dùng Vision LLM xử lý thẩm mỹ UX.  
  3. Tạo ra một hệ sinh thái kết hợp giữa Local CLI (sức mạnh xử lý) và Cloud SaaS (quản trị, làm việc nhóm).

## **2\. Bảng Tổng hợp Chức năng Chi tiết**

Bảng này liệt kê không bỏ sót bất kỳ tính năng nào, chia theo 3 phân hệ chính của kiến trúc: Lõi Local, Giao diện Local và Cloud SaaS.

### **Phân hệ 1: TLX Core Engine (Lõi Xử lý Local)**

*Nhiệm vụ: Chạy ngầm dưới Terminal của Dev, cày cuốc xử lý dữ liệu nặng.*

| Chức năng | Mô tả chi tiết (Nhìn vào biết mình làm gì) | Công nghệ / Thuật toán |
| :---- | :---- | :---- |
| **Nhận diện Dự án** | Tự động đọc file tlx.yaml, nhận diện framework, cấu trúc thư mục, port đang chạy để chuẩn bị quét. | nodejs |
| **Quét Mã nguồn tĩnh (AST)** | Đọc toàn bộ code (.tsx, .ts) mà không cần chạy. Trích xuất danh sách Component, Page, API được gọi. | TypeScript \+ Tree-sitter (Node bindings)  |
| **Incremental Caching** | Băm (Hash) nội dung code. Chỉ chạy test lại những file bị đổi code so với lần trước. Lưu cache vào folder .tlx/. | Node.js Crypto module  |
| **Khởi động Trình duyệt ngầm** | Mở Chromium ẩn, truy cập vào Port của Dev để chụp ảnh màn hình và lấy tọa độ DOM (X, Y, Width, Height). | Playwright (Native Node.js version)  |
| **Kiểm tra Đè lấp & Tràn viền** | Duyệt qua các tọa độ DOM, chạy toán học để xem Nút A có đè lên Chữ B không, hoặc Form có bị tràn màn hình không. | Thuật toán AABB Collision |
| **Đánh giá Tương phản (A11y)** | Trích xuất mã màu (Hex/RGB), tính toán tỷ lệ tương phản Text/Background xem có đạt chuẩn \>4.5:1 không. | Công thức WCAG 2.1 Math |
| **Auto-Crawler (Spider Bot)** | Tự động quét tìm các thẻ \<input\>, \<button\>, tự điền Mock Data và click để tìm các trang gây crash / lỗi 404\. | Thuật toán Đồ thị DFS/BFS |
| **Local API Server** | Mở một server nội bộ ngầm (Port 8080\) để bắn dữ liệu báo cáo lên UI, xử lý tín hiệu Ctrl+C để tắt an toàn. | Node.js \+ Express/Fastify kết hợp Async/Await  |

### **Phân hệ 2: Local Web Dashboard (Giao diện báo cáo)**

*Nhiệm vụ: Nhúng thẳng vào file nhị phân Go, hiển thị trực quan cho Dev xem.*

| Chức năng | Mô tả chi tiết (Nhìn vào biết mình làm gì) | Công nghệ / Thư viện |
| :---- | :---- | :---- |
| **Bản đồ Dự án (Project Map)** | Render toàn bộ dự án thành Sơ đồ tư duy (Cây node). Hỗ trợ kéo thả, zoom, click vào để xem chi tiết component. | Next.js \+ React Flow |
| **Interactive Inspector** | Click vào Node trên bản đồ sẽ hiện panel bên phải: File path, Component con, API đang gọi bên trong. | Next.js \+ Tailwind |
| **Phân tích Ảnh hưởng (Impact)** | Nhập tên file bị sửa \-\> Hệ thống bôi đỏ toàn bộ các Page/Component khác bị ảnh hưởng bởi file này. | Thuật toán Đồ thị (UI) |
| **Testing Heatmap** | Đổi màu Sơ đồ cây: Xanh (Test Pass), Đỏ (Test Fail), Xám (Chưa test) để Dev biết vùng nào đang nguy hiểm. | Next.js \+ State Management |
| **Visual Bug Viewer** | Hiển thị ảnh chụp màn hình do Go gửi lên, vẽ khung đỏ chót (Highlight) ngay tại vị trí UI bị đè lấp hoặc vỡ. | HTML5 Canvas / CSS Box |
| **AI UX Consultant** | Tích hợp hộp chat. Dev gửi component bị nghi ngờ \-\> Gắn RAG (Brand Guidelines) \-\> AI trả lời nút này phối màu hợp lý chưa. | Vision LLM (GPT-4o/Gemini) |

### **Phân hệ 3: Cloud SaaS & Workspace (Quản trị từ xa)**

*Nhiệm vụ: Triển khai trên máy chủ thật (AWS), phục vụ Team Work và thu tiền.*

| Chức năng | Mô tả chi tiết (Nhìn vào biết mình làm gì) | Công nghệ / Framework |
| :---- | :---- | :---- |
| **Multi-tenancy Workspace** | Tạo không gian làm việc riêng biệt cho từng Công ty/Team. Dữ liệu cách ly an toàn. | Python (FastAPI) \+ PostgreSQL |
| **Phân quyền (RBAC)** | Phân chia Role: Admin (Quản lý), Editor (Đẩy code/test lên), Viewer (Chỉ xem báo cáo). | FastAPI Security (JWT) |
| **Cloud Sync & Upload** | Nhận file report.json và Ảnh chụp từ máy Local của Dev bắn lên, lưu trữ trên hệ thống đám mây. | FastAPI \+ AWS S3 |
| **Thanh toán & Gói cước** | Xử lý Subscription (Free, Pro, Team). Lắng nghe Webhooks để tự động gia hạn hoặc khóa tài khoản khi hết tiền. | Stripe Webhooks |
| **API Testing Workspace** | Cho phép Import file Swagger/OpenAPI. Tự động sinh ra kịch bản test API (Mã 400, 500, Latency) và chạy giám sát. | Python \+ API Runner Logic |

## **3\. Cấu trúc Dự án (Repository Structure)**

Sử dụng mô hình **Monorepo** cho Core Engine và **Cloud Repo** tách biệt:

tlx-workspace/           (Monorepo quản lý bằng PNPM Workspaces / Turborepo)  
├── package.json         \# Quản lý workspaces chung  
├── pnpm-workspace.yaml    
├── apps/  
│   ├── cli/             \# Lõi TLX Engine (Thay thế hoàn toàn cho thư mục Go)  
│   │   ├── bin/         \# Điểm khởi chạy CLI (tlx.js)  
│   │   ├── src/         \# Logic nghiệp vụ (Parser, Playwright, Graph, API)  
│   │   ├── package.json  
│   │   └── tsconfig.json  
│   │  
│   └── ui/              \# Dashboard Next.js  
│       ├── src/         \# App Router  
│       ├── package.json  
│       └── out/         \# Thư mục build tĩnh (CLI sẽ trỏ file server vào đây)  
│  
└── tlx-cloud/           (Repo SaaS Python giữ nguyên)  
    ├── app/  
    └── requirements.txt

## **4\. Tầm nhìn & Tính năng Mở rộng trong tương lai**

Nếu còn thời gian hoặc để định hướng phát triển sau khi ra trường:

1. **DevSecOps (SAST & DAST):** Quét mã nguồn để tìm API Key bị rò rỉ (SAST) và thả Playwright để thử tấn công XSS, SQL Injection vào form đăng nhập (DAST).  
2. **Auto-Fix PR Bot:** Không chỉ báo lỗi, TLX dùng LLM để tự động viết lại đoạn code .tsx fix lỗi giao diện và mở trực tiếp Pull Request lên GitHub.  
3. **CI/CD Pipeline Integration:** Xuất bản TLX thành một *GitHub Action* chính thức trên Marketplace, chặn merge code nếu giao diện bị vỡ.

## **5\. Yêu cầu Hệ thống để Phát triển**

Để code và chạy được dự án này, môi trường của Tân và Luân cần:

* **Backend & CLI:** Nodejs+ (Cần thiết cho các tính năng module và tối ưu bộ nhớ).  
* **Frontend UI:** Node.js 18+ (Dành cho Next.js App Router).  
* **SaaS Backend:** Python 3.10+ (Để sử dụng các tính năng Type Hinting mạnh mẽ của FastAPI).  
* **Dependencies OS:** Playwright yêu cầu cài đặt một số thư viện hệ thống của Linux/Fedora để mở được Chromium Headless (Lệnh: playwright install \--with-deps).  
* **Database (Cho Cloud):** PostgreSQL (Dữ liệu quan hệ) và Redis (Lưu cache/Session cho API).

## **6\. Các Vấn đề rủi ro cần lưu ý (Risks & Caveats)**

Khi bảo vệ đồ án, Hội đồng rất thích sinh viên tự nhận thức được giới hạn của dự án:

1. **Playwright OS Dependency:** Playwright chạy rất mượt trên máy Dev, nhưng nếu đẩy lên CI/CD (như Docker/GitHub Actions), container đó phải khá nặng (khoảng \~1GB) vì phải chứa toàn bộ lõi trình duyệt.  
2. **Giới hạn của AST (Tree-sitter):** AST quét code tĩnh cực nhanh, nhưng nó sẽ "bó tay" nếu Dev dùng các hàm sinh code động (Dynamic eval) hoặc inject class Tailwind bằng string nội suy quá phức tạp lúc runtime.  
3. **Tốc độ & Chi phí của Vision LLM:** Dù chỉ chiếm 10% khối lượng, nhưng việc gửi ảnh lên GPT-4o/Gemini vẫn bị độ trễ mạng (latency) từ 2-4 giây và tốn token. Do đó, tính năng "AI UX Consultant" phải được thiết kế dạng *Opt-in* (User bấm mới chạy), không được nhét vào luồng chạy tự động mặc định.

