import {Command} from 'commander';
import {createServer} from '../server/index';
import {exec} from 'child_process';
import os from 'os';

const uiCommand = new Command('ui')
const API_PORT = 8080;

function openBrowser(url: string) {
    const startCmd = 
        os.platform() === 'win32' ? `start ${url}` :
        os.platform() === 'darwin' ? `open ${url}` :
        `xdg-open ${url}`;
    exec(startCmd, (err) => {
        if (err) {
            console.error('Không thể mở trình duyệt:', err);
        }
    });
}
uiCommand
.description('Khởi chạy cli và mở dashboard')
.action(()=>{
    console.log('=== TLX ENGINE ĐANG KHỞI CHẠY ===');
    const app = createServer();
    const server = app.listen(API_PORT, () => {
      console.log(`[Server] API đang mở tại: http://localhost:${API_PORT}`);
      openBrowser(`http://localhost:${API_PORT}`);
    });
    process.on('SIGINT', () => {
      console.log('Đang tắt server...');
        server.close(() => {
            console.log('Server đã tắt.');
            process.exit(0);
        });
    });
})
export default uiCommand;