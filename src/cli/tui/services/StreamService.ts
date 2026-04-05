/**
 * 流式输出服务
 * 
 * 管理 Agent 响应的流式输出
 */

import type { Message } from '../types/message.js';

export interface StreamConfig {
  updateInterval: number;
  batchSize: number;
}

const DEFAULT_CONFIG: StreamConfig = {
  updateInterval: 50,
  batchSize: 10,
};

export class StreamService {
  private config: StreamConfig;
  private currentMessageId: string | null = null;
  private buffer: string = '';
  private wordBuffer: string = '';
  private lastUpdate: number = 0;
  private onChunk: ((chunk: string) => void) | null = null;
  private onComplete: ((content: string) => void) | null = null;
  private aborted: boolean = false;

  constructor(config: Partial<StreamConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setOnChunk(callback: (chunk: string) => void): void {
    this.onChunk = callback;
  }

  setOnComplete(callback: (content: string) => void): void {
    this.onComplete = callback;
  }

  start(messageId: string): void {
    this.currentMessageId = messageId;
    this.buffer = '';
    this.wordBuffer = '';
    this.lastUpdate = Date.now();
    this.aborted = false;
  }

  append(content: string): void {
    if (this.aborted || !this.currentMessageId) return;

    this.wordBuffer += content;

    const now = Date.now();
    const shouldUpdate =
      now - this.lastUpdate >= this.config.updateInterval ||
      this.wordBuffer.includes(' ') ||
      this.wordBuffer.includes('\n') ||
      this.wordBuffer.length >= this.config.batchSize;

    if (shouldUpdate && this.onChunk) {
      this.buffer += this.wordBuffer;
      this.onChunk(this.wordBuffer);
      this.wordBuffer = '';
      this.lastUpdate = now;
    }
  }

  complete(finalContent?: string): void {
    if (this.aborted || !this.currentMessageId) return;

    if (this.wordBuffer && this.onChunk) {
      this.buffer += this.wordBuffer;
      this.onChunk(this.wordBuffer);
    }

    const content = finalContent || this.buffer;

    if (this.onComplete) {
      this.onComplete(content);
    }

    this.currentMessageId = null;
    this.buffer = '';
    this.wordBuffer = '';
  }

  abort(): void {
    this.aborted = true;
    if (this.wordBuffer && this.onChunk) {
      this.buffer += this.wordBuffer;
      this.onChunk(this.wordBuffer);
    }
    if (this.onComplete) {
      this.onComplete(this.buffer);
    }
    this.currentMessageId = null;
  }

  isAborted(): boolean {
    return this.aborted;
  }

  getCurrentContent(): string {
    return this.buffer + this.wordBuffer;
  }
}

/**
 * 创建流式输出处理器
 */
export function createStreamHandler(
  onChunk: (chunk: string) => void,
  onComplete: (content: string) => void,
  config?: Partial<StreamConfig>
): StreamService {
  const service = new StreamService(config);
  service.setOnChunk(onChunk);
  service.setOnComplete(onComplete);
  return service;
}