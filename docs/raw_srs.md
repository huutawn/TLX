# **TÀI LIỆU ĐẶC TẢ YÊU CẦU PHẦN MỀM (SRS)**

**Dự án:** TLX Engine (Tan-Luan eXecution Engine)

**Định vị:** Nền tảng Hợp nhất Kiểm thử (Testing) và Vận hành (DevOps) theo hướng Local-First.

**Phiên bản:** 1.0.0

**Khung cấp phép (License):** MIT (CLI/Local) & Mã nguồn đóng (SaaS/Cloud).

## **1\. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)**

### **1.1 Mục đích cốt lõi**

TLX Engine là một công cụ dòng lệnh (CLI) lai, kết hợp cùng giao diện quản trị cục bộ, nhằm giải quyết bài toán phân mảnh công cụ của các nhóm phát triển nhỏ (Startups/SMEs). TLX hợp nhất hai vòng đời phát triển phần mềm độc lập vào một nền tảng duy nhất:

1. **Đảm bảo chất lượng (Quality Assurance):** Kiểm thử giao diện (UI/UX), phân tích mã nguồn tĩnh (SAST) và kiểm thử hợp đồng API ngay tại máy cục bộ (Local).  
2. **Quản trị Vận hành (DevOps & Monitoring):** Quản lý cấu hình, triển khai (Deploy) và giám sát tài nguyên máy chủ (Production) từ xa thông qua cơ chế Agent tối ưu băng thông.

### **1.2 Triết lý thiết kế (Design Philosophy)**

* **Local-First:** Mọi phân tích và tính toán nặng đều diễn ra tại máy cá nhân, đảm bảo quyền riêng tư của mã nguồn và triệt tiêu độ trễ mạng.  
* **Pull & Sync Model:** Không duy trì kết nối nền (background connection) ngốn tài nguyên. Dữ liệu giám sát từ Server chỉ được nén và đẩy về Local khi có lệnh yêu cầu (Handshake).  
* **Tiến trình Đơn khối Phân mô-đun (Modular Monolith):** Phân phối thành một khối duy nhất để dễ cài đặt, nhưng phân tách nghiêm ngặt ranh giới chạy tiến trình giữa Golang và Node.js.

## **2\. KIẾN TRÚC HỆ THỐNG & PHÂN HOẠCH MÔ-ĐUN (SYSTEM ARCHITECTURE)**

Hệ thống áp dụng mô hình **Hybrid Process Architecture (Kiến trúc Tiến trình Lai)**.

### **2.1 Phân cấp Tiến trình (Process Hierarchy)**

* **Tiến trình Cha (Main Process \- Golang):** Đóng vai trò là "Nhạc trưởng". Khởi chạy liên tục trong suốt vòng đời câu lệnh. Chịu trách nhiệm định tuyến CLI, quản lý mạng, kết nối Database toàn cục và đóng gói hệ thống.  
* **Tiến trình Con (Sub-process \- Node.js):** Đóng vai trò là "Đặc nhiệm". Chỉ được Golang kích hoạt (Spawn) khi cần tương tác với Trình duyệt (Playwright) hoặc phân tích cây cú pháp (AST). Giao tiếp với tiến trình Cha thông qua STDOUT (Chuỗi JSON) và tự động bị khai tử (Exit) ngay sau khi hoàn thành nhiệm vụ để giải phóng RAM.

### **2.2 Phân công Khối lượng Công việc (Workload Distribution)**

| Phân hệ / Trách nhiệm | Công nghệ | Người thực hiện | Nhiệm vụ kỹ thuật cốt lõi |
| :---- | :---- | :---- | :---- |
| **Lõi Điều phối & DevOps** | Golang (Cobra) | **Tân** | \- Xây dựng CLI Router. \- Giao thức Handshake & Stream nén/giải nén Log. \- Tương tác SQLite toàn cục. \- Nhúng tệp tĩnh và mở Local Server. |
| **Tác tử Kiểm thử UI/AST** | Node.js (TS) | **Luân** | \- Điều khiển Playwright ngầm. \- Thuật toán hình học AABB (Đè lấp layout), WCAG. \- Báo cáo kết quả bằng JSON qua STDOUT. |
| **Local Dashboard (UI)** | Next.js (TS) | **Luân** | \- Vẽ sơ đồ tư duy (React Flow) Project Map. \- Vẽ biểu đồ Monitoring từ dữ liệu SQLite. |

## **3\. CẤU TRÚC LƯU TRỮ DỮ LIỆU (STORAGE ARCHITECTURE)**

Giải quyết triệt để rủi ro xung đột quyền truy cập hệ thống bằng kiến trúc lưu trữ 2 tầng:

1. **Tầng Không gian Dự án (Project-centric):**  
   * **Vị trí:** ./.tlx/ (Nằm trong thư mục dự án đang code).  
   * **Dữ liệu:** File cấu hình tlx.yaml, bộ nhớ đệm băm (Incremental Cache) của Tree-sitter, ảnh chụp màn hình cục bộ tạm thời.  
2. **Tầng Quản trị Toàn cục (Global-centric):**  
   * **Vị trí:** \~/.tlx/ (Thư mục Home của User hệ điều hành).  
   * **Dữ liệu:** File global.db (SQLite).  
   * **Nội dung DB:** Bản đồ liên kết dự án, mã thông báo xác thực (Production Keys), và kho lưu trữ Log/Monitoring nén đã được đồng bộ từ Agent.

## **4\. ĐẶC TẢ YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS)**

### **4.1 Phân hệ 1: Lõi Kiểm thử Cục bộ (Testing Suite)**

*Tiến trình thi hành: Node.js (Sub-process) & Go (API Test)*

* **T1. Quét Mã Nguồn Tĩnh (SAST):** Phân tích AST (Abstract Syntax Tree) để lập danh sách các Component, Page và trích xuất các API Key bị hardcode.  
* **T2. Smart Incremental Test:** Lưu vết băm (Hash) của tệp. Chỉ khởi chạy lại trình duyệt để test những component/file có sự thay đổi (Diff) so với lần quét trước.  
* **T3. Đánh giá Giao diện (UI/UX Collision):**  
  * Mở Chromium ngầm (Headless) truy cập localhost.  
  * Áp dụng thuật toán AABB (Axis-Aligned Bounding Box) phát hiện các thẻ DOM đè lấp, tràn viền màn hình (Overflow).  
  * Tính toán tỷ lệ tương phản màu sắc đạt chuẩn WCAG 2.1 (Tối thiểu 4.5:1).  
* **T4. Auto-Crawler (Spider Bot):** Thuật toán duyệt đồ thị (BFS) để tự động click các liên kết, điền Mock Data vào form, phát hiện các trang gây lỗi 404 hoặc Crash Frontend.  
* **T5. Kiểm thử Hợp đồng API:** Bắn luồng dữ liệu giả mạo (Fuzzing) vào các Endpoints nội bộ để kiểm tra giới hạn chịu tải cục bộ và độ chính xác của JSON schema.

### **4.2 Phân hệ 2: Vận hành & Giám sát (DevOps Suite)**

*Tiến trình thi hành: Golang (Main Process)*

* **D1. Handshake & Auth:** Yêu cầu xác thực Khóa Bí Mật cấp 2 (Production Key) khi mở kết nối từ máy Local lên Agent của Server.  
* **D2. Chunked Log Sync (Đồng bộ Log qua Luồng):** Agent trên VPS đọc file Log, nén trực tiếp bằng luồng (gzip), đẩy về qua HTTP Chunked. Lõi Go tại Local hứng, giải nén và ghi vào SQLite mà không tải toàn bộ file vào RAM.  
* **D3. Performance Metric Pull:** Kéo dữ liệu về CPU, RAM, Disk I/O từ Server Production về Local theo mốc thời gian tùy chọn.  
* **D4. Agent Health-check:** Bắn ping nội bộ để theo dõi trạng thái sống/chết (Uptime) của các vùng chứa (Containers) trên máy chủ thực.

### **4.3 Phân hệ 3: Bảng Điều Khiển Trực Quan (Local Dashboard)**

*Giao diện thi hành: Next.js (Static Export) nhúng qua Go Server*

* **U1. Project Map:** Biểu diễn mã nguồn thành dạng sơ đồ cây trực quan. Hỗ trợ zoom, kéo thả và click để xem thông tin (Imports, Exports, API Calls).  
* **U2. Impact Heatmap (Bản đồ nhiệt rủi ro):** Khi sửa code tại một file, hệ thống bôi đỏ toàn bộ các nhánh đồ thị (Pages/Components) bị ảnh hưởng để Lập trình viên biết vùng cần test lại.  
* **U3. Visual Bug Highlight:** Hiển thị ảnh chụp màn hình do Playwright gửi lên, vẽ khung viền (Bounding Box) khoanh đỏ chính xác tọa độ bị vỡ layout hoặc sai độ tương phản.  
* **U4. Ops Metrics Chart:** Vẽ biểu đồ đường (Line Chart) biểu diễn mức tiêu thụ tài nguyên của Server thật dựa trên dữ liệu đã đồng bộ về máy Local.

## **5\. YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS)**

### **5.1 Tiêu chuẩn Hiệu năng (Performance Benchmarks)**

* **Boot Time:** Thời gian từ lúc gõ lệnh (ví dụ tlx help) đến khi phản hồi không vượt quá **50ms** (Nhờ khởi động bằng Go).  
* **Local RAM Limit (Dashboard):** Trạng thái chờ/giám sát tài nguyên qua UI không được vượt quá **70MB RAM**.  
* **Local RAM Limit (UI Testing):** Khi Playwright bật Chromium, tổng RAM tiêu thụ cho phép đạt đỉnh (Spike) ở mức tối đa:  
  $$RAM\_{Peak} \\approx 600 \\text{ MB} \\pm 10\\%$$  
  Hệ thống phải lập tức giải phóng lượng RAM này sau khi hoàn tất phiên test (trả về trạng thái chờ \< 70MB).  
* **Network Payload:** Quá trình kéo Log từ Agent (ví dụ Log file thô 100MB) bắt buộc phải qua nén luồng, giới hạn băng thông truyền tải dưới **20MB**.

### **5.2 Yêu cầu Bảo mật (Security)**

* Không được lưu trữ plain-text đối với các API Key, Production Token tại file .tlx/ cục bộ. Mọi định danh quan trọng phải được mã hóa tại global.db.  
* Agent trên máy chủ Production từ chối mọi Request nếu thiếu X-TLX-Token hợp lệ trong HTTP Header.  
* Tiến trình Node.js (Sub-process) không được phép truy cập mạng ra ngoài Internet, chỉ được giao tiếp nội bộ qua localhost hoặc STDOUT với tiến trình Go.

## **6\. RỦI RO & PHƯƠNG ÁN KIỂM SOÁT (RISK MITIGATION)**

| Phân loại Rủi ro | Mô tả Rủi ro | Phương án giải quyết (Mitigation) |
| :---- | :---- | :---- |
| **Phụ thuộc Hệ điều hành (Môi trường)** | Máy khách không cài sẵn Node.js hoặc thiếu thư viện C++ của Playwright, gây lỗi Crash tiến trình. | Tích hợp lệnh cảnh báo và tự động tải Node Runtime mini/cài thư viện Playwright trong lần đầu gõ lệnh khởi tạo tlx init. |
| **Giao tiếp IPC lỗi định dạng** | Dữ liệu truyền từ Node.js \-\> Go qua STDOUT bị dính Log rác cảnh báo của NPM, làm vỡ chuỗi JSON. | Đặt toàn bộ cảnh báo của Node.js vào luồng STDERR, đảm bảo chỉ có dữ liệu JSON thuần khiết được in ra luồng STDOUT để Go bắt. |
| **Quá tải Disk I/O** | Ghi log liên tục vào SQLite ở mức độ quá nhanh gây Lock DB. | Áp dụng cơ chế Batch Insert (Ghi gộp theo mẻ) và kích hoạt chế độ WAL (Write-Ahead Logging) cho SQLite. |

