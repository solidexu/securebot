/**
 * Memory Viewer CLI 命令
 */

import { startViewerServer, stopViewerServer } from '../viewer/server.js';

export async function viewerCommand(args: string[]): Promise<void> {
  const action = args[0] || 'start';

  switch (action) {
    case 'start':
      console.log('[Viewer] Starting Memory Viewer...');
      await startViewerServer();
      console.log('[Viewer] Press Ctrl+C to stop');
      // 保持进程运行
      process.on('SIGINT', async () => {
        await stopViewerServer();
        process.exit(0);
      });
      break;

    case 'stop':
      await stopViewerServer();
      break;

    default:
      console.log('Usage: viewer [start|stop]');
      console.log('');
      console.log('Commands:');
      console.log('  start  - 启动 Memory Viewer (默认端口 37777)');
      console.log('  stop   - 停止 Memory Viewer');
  }
}
