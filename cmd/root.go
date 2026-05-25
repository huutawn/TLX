package cmd

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"syscall"
	"os/signal"
	"time"
	"github.com/go-chi/chi/v5"
	"github.com/spf13/cobra"
)
var rootCmd = &cobra.Command{
	Use:   "tlx",
	Short: "TLX Engine - Local-First UI/UX Testing",
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		if _, err := os.Stat("tlx.yaml"); os.IsNotExist(err) {
			fmt.Println("⚠️ Cảnh báo: Không tìm thấy file tlx.yaml ở thư mục này.")
			os.Exit(1)
		}
		fmt.Println("📦 Đã nhận diện dự án thông qua tlx.yaml")
	},
	Run: func(cmd *cobra.Command, args []string) {
		r := chi.NewRouter()
		r.Get("/api/status", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte(`{"status": "TLX Engine is running"}`))
		})
		srv := &http.Server{Addr: "8080", Handler: r}
		go func(){
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				fmt.Printf("Lỗi khi khởi động server: %v\n", err)
			}
		}()
		url := "http://localhost:8080/api/status"
		fmt.Printf("🚀 TLX Engine đang chạy tại: %s\n", url)
		openBrowser(url)
		
		quit :=make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		<-quit //luồng chính chờ ctrl+c hoặc kill để tắt server
		fmt.Println("\n🛑 Đang tắt TLX Engine...")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
		fmt.Println("✅ TLX Engine đã tắt thành công.")
	},
}
func openBrowser(url string) {
	var err error
	switch runtime.GOOS {
	case "linux":
		err = exec.Command("xdg-open", url).Start() // Fedora của bạn sẽ dùng lệnh này
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	}
	if err != nil {
		fmt.Printf("Không thể tự động mở trình duyệt, vui lòng truy cập tay: %s\n", url)
	}
}
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}