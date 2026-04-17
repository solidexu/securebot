/**
 * Viewer Server 测试
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startViewerServer, stopViewerServer } from './server.js';

describe('Viewer Server', () => {
  beforeAll(async () => {
    await startViewerServer();
  });

  afterAll(async () => {
    await stopViewerServer();
  });

  it('should start server on port 37777', async () => {
    // 简单的健康检查
    const res = await fetch('http://localhost:37777/api/memory/stats');
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('should return memory list', async () => {
    const res = await fetch('http://localhost:37777/api/memory/list?limit=10');
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('should search memories', async () => {
    const res = await fetch('http://localhost:37777/api/memory/search?q=test&mode=compact');
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it.skip('should return viewer HTML', async () => {
    const res = await fetch('http://localhost:37777/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });
});
