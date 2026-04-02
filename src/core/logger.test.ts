/**
 * 日志模块测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger, LogManager, getLogger, configureLogger } from './logger.js';

describe('Logger', () => {
  let mockOutput: ReturnType<typeof vi.fn>;
  let logger: Logger;

  beforeEach(() => {
    mockOutput = vi.fn();
    logger = new Logger('test', { output: mockOutput, minLevel: 'debug' });
  });

  describe('基本日志功能', () => {
    it('应该输出 debug 级别日志', () => {
      logger.debug('test message', { key: 'value' });

      expect(mockOutput).toHaveBeenCalledTimes(1);
      const entry = mockOutput.mock.calls[0][0];
      expect(entry.level).toBe('debug');
      expect(entry.message).toBe('test message');
      expect(entry.context).toBe('test');
      expect(entry.key).toBe('value');
    });

    it('应该输出 info 级别日志', () => {
      logger.info('info message');

      expect(mockOutput).toHaveBeenCalledTimes(1);
      const entry = mockOutput.mock.calls[0][0];
      expect(entry.level).toBe('info');
    });

    it('应该输出 warn 级别日志', () => {
      logger.warn('warning message');

      expect(mockOutput).toHaveBeenCalledTimes(1);
      const entry = mockOutput.mock.calls[0][0];
      expect(entry.level).toBe('warn');
    });

    it('应该输出 error 级别日志', () => {
      const error = new Error('test error');
      logger.error('error message', error, { extra: 'data' });

      expect(mockOutput).toHaveBeenCalledTimes(1);
      const entry = mockOutput.mock.calls[0][0];
      expect(entry.level).toBe('error');
      expect(entry.error).toBeDefined();
      expect(entry.error?.name).toBe('Error');
      expect(entry.error?.message).toBe('test error');
      expect(entry.extra).toBe('data');
    });
  });

  describe('日志级别过滤', () => {
    it('应该过滤低于最小级别的日志', () => {
      const filteredLogger = new Logger('filtered', { output: mockOutput, minLevel: 'warn' });

      filteredLogger.debug('debug message');
      filteredLogger.info('info message');
      filteredLogger.warn('warn message');
      filteredLogger.error('error message');

      expect(mockOutput).toHaveBeenCalledTimes(2); // only warn and error
    });
  });

  describe('追踪 ID', () => {
    it('应该设置追踪 ID', () => {
      logger.setTraceId('trace-123', 'span-456');
      logger.info('tracked message');

      const entry = mockOutput.mock.calls[0][0];
      expect(entry.traceId).toBe('trace-123');
      expect(entry.spanId).toBe('span-456');
    });

    it('应该清除追踪 ID', () => {
      logger.setTraceId('trace-123');
      logger.clearTraceId();
      logger.info('untracked message');

      const entry = mockOutput.mock.calls[0][0];
      expect(entry.traceId).toBeUndefined();
    });
  });

  describe('子日志器', () => {
    it('应该创建子日志器', () => {
      logger.setTraceId('trace-123');
      const childLogger = logger.child('submodule');

      childLogger.info('child message');

      const entry = mockOutput.mock.calls[0][0];
      expect(entry.context).toBe('test:submodule');
      expect(entry.traceId).toBe('trace-123');
    });
  });

  describe('计时日志', () => {
    it('应该测量异步操作时间', async () => {
      const result = await logger.time('async operation', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'done';
      });

      expect(result).toBe('done');
      expect(mockOutput).toHaveBeenCalledTimes(1);
      const entry = mockOutput.mock.calls[0][0];
      expect(entry.message).toContain('completed');
      expect(entry.elapsedMs).toBeDefined();
      expect(entry.elapsedMs).toBeGreaterThanOrEqual(50);
    });

    it('应该测量同步操作时间', () => {
      const result = logger.time('sync operation', () => {
        return 'sync-done';
      });

      expect(result).toBe('sync-done');
      expect(mockOutput).toHaveBeenCalledTimes(1);
      const entry = mockOutput.mock.calls[0][0];
      expect(entry.elapsedMs).toBeDefined();
    });

    it('应该记录失败操作', async () => {
      try {
        await logger.time('failing operation', async () => {
          throw new Error('operation failed');
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      expect(mockOutput).toHaveBeenCalledTimes(1);
      const entry = mockOutput.mock.calls[0][0];
      expect(entry.level).toBe('error');
      expect(entry.error).toBeDefined();
    });
  });
});

describe('LogManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该返回单例实例', () => {
    const instance1 = LogManager.getInstance();
    const instance2 = LogManager.getInstance();

    expect(instance1).toBe(instance2);
  });

  it('应该管理多个日志器', () => {
    const manager = LogManager.getInstance();
    const logger1 = manager.getLogger('module1');
    const logger2 = manager.getLogger('module2');

    expect(logger1).not.toBe(logger2);
    expect(manager.getLogger('module1')).toBe(logger1); // 相同的日志器
  });

  it('应该设置全局配置', () => {
    const manager = LogManager.getInstance();
    const mockOutput = vi.fn();

    manager.setConfig({ output: mockOutput });

    const logger = manager.getLogger('test');
    logger.info('test');

    expect(mockOutput).toHaveBeenCalled();
  });

  it('应该设置全局追踪 ID', () => {
    const manager = LogManager.getInstance();
    const mockOutput = vi.fn();
    manager.setConfig({ output: mockOutput });

    const logger1 = manager.getLogger('module1');
    const logger2 = manager.getLogger('module2');

    manager.setGlobalTraceId('global-trace');

    logger1.info('message1');
    logger2.info('message2');

    expect(mockOutput.mock.calls[0][0].traceId).toBe('global-trace');
    expect(mockOutput.mock.calls[1][0].traceId).toBe('global-trace');
  });
});

describe('全局函数', () => {
  it('getLogger 应该返回日志器', () => {
    const logger = getLogger('test');
    expect(logger).toBeInstanceOf(Logger);
  });

  it('configureLogger 应该配置全局日志', () => {
    const mockOutput = vi.fn();
    configureLogger({ output: mockOutput });

    const logger = getLogger('configured');
    logger.info('test');

    expect(mockOutput).toHaveBeenCalled();
  });
});