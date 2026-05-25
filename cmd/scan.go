package cmd
import(
	"fmt"
	"github.com/spf13/cobra"
)
var scanCmd = &cobra.Command{
	Use:   "scan",
	Short: "Quét mã nguồn để phát hiện lỗi UI/UX",
	Long:  `Lệnh 'tlx scan' sẽ phân tích mã nguồn dự án để tìm kiếm các lỗi tiềm ẩn về giao diện và trải nghiệm người dùng.`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("🔍 Đang khởi chạy Spider Bot và Playwright để phân tích...")	},
}
func init(){
	rootCmd.AddCommand(scanCmd)
}