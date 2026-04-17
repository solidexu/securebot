/**
 * Memory Viewer Server
 */

import express, { Request, Response } from 'express';
import { createServer } from 'http';
import path from 'path';
import { getMemoryManager } from '../core/memory.js';

const PORT = process.env.MEMORY_VIEWER_PORT || 37777;
const HOST = process.env.MEMORY_VIEWER_HOST || 'localhost';

const app = express();
const server = createServer(app);

// 静态文件目录（相对于项目根目录）
const PUBLIC_DIR = path.join(process.cwd(), 'public');

// 中间件
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ============ API 端点 ============

app.get('/api/memory/stats', async (req: Request, res: Response) => {
  try {
    const mm = getMemoryManager();
    await mm.initialize();
    const stats = mm.getStats();
    const profile = mm.getUserProfile();
    res.json({ success: true, data: {
      dailyMemoryCount: stats.dailyMemoryCount,
      totalEntries: stats.totalEntries,
      agentCount: stats.agentCount,
      factsCount: profile?.facts?.length || 0,
      updatedAt: profile?.updatedAt || new Date().toISOString(),
    }});
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/memory/list', async (req: Request, res: Response) => {
  try {
    const mm = getMemoryManager();
    await mm.initialize();
    const limit = parseInt(req.query.limit as string) || 50;
    const agentId = req.query.agentId as string;
    const entries = await mm.getWorkingMemory(agentId);
    const sorted = [...entries].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ).slice(0, limit);
    res.json({ success: true, data: sorted.map(e => ({
      id: e.id, type: e.type, content: e.content.slice(0, 100),
      fullContent: e.content, timestamp: e.timestamp,
      importance: e.importance, confidence: e.confidence, tags: e.tags,
    })), meta: { total: entries.length, limit }});
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/memory/search', async (req: Request, res: Response) => {
  try {
    const mm = getMemoryManager();
    await mm.initialize();
    const query = req.query.q as string;
    const mode = (req.query.mode as string) || 'compact';
    const limit = parseInt(req.query.limit as string) || 20;
    if (!query) return res.status(400).json({ success: false, error: 'Missing q' });
    if (mode === 'compact') {
      const results = await mm.searchCompact(query, { limit });
      res.json({ success: true, data: results, meta: { mode, count: results.length }});
    } else {
      const entries = await mm.search(query, { limit });
      res.json({ success: true, data: entries.map(e => ({
        id: e.id, type: e.type, content: e.content,
        timestamp: e.timestamp, importance: e.importance,
      })), meta: { mode, count: entries.length }});
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/memory/:id', async (req: Request, res: Response) => {
  try {
    const mm = getMemoryManager();
    await mm.initialize();
    const entries = await mm.getByIds([req.params.id]);
    if (entries.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    const entry = entries[0]!;
    const timeline = await mm.getTimeline(req.params.id);
    res.json({ success: true, data: {
      entry: {
        id: entry.id, type: entry.type, content: entry.content,
        timestamp: entry.timestamp, importance: entry.importance,
        confidence: entry.confidence, tags: entry.tags, agentId: entry.agentId,
      },
      timeline: {
        before: timeline.before.map(e => ({ id: e.id, content: e.content.slice(0, 50), timestamp: e.timestamp })),
        after: timeline.after.map(e => ({ id: e.id, content: e.content.slice(0, 50), timestamp: e.timestamp })),
      },
    }});
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/memory/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write('data: {"type":"connected"}\n\n');
  const heartbeat = setInterval(() => res.write('data: {"type":"heartbeat"}\n\n'), 30000);
  req.on('close', () => { clearInterval(heartbeat); res.end(); });
});

app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(PUBLIC_DIR, 'viewer.html'));
});

// ============ 启动/停止 ============

export function startViewerServer(): Promise<void> {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[Viewer] Started at http://${HOST}:${PORT}`);
      resolve();
    });
  });
}

export function stopViewerServer(): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => { console.log('[Viewer] Stopped'); resolve(); });
  });
}

if (process.argv[1].includes('server')) {
  startViewerServer().catch(console.error);
}
