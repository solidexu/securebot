import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConversationMessage } from '../core/collaboration.js';

export class ConversationStorage {
  private conversationFile: string;

  constructor(workspacePath: string, delegationId: string) {
    const conversationDir = join(workspacePath, '.conversations');
    if (!existsSync(conversationDir)) {
      mkdirSync(conversationDir, { recursive: true });
    }
    this.conversationFile = join(conversationDir, `${delegationId}.json`);
  }

  loadConversation(): ConversationMessage[] {
    if (!existsSync(this.conversationFile)) {
      return [];
    }

    try {
      const data = readFileSync(this.conversationFile, 'utf-8');
      const messages = JSON.parse(data) as ConversationMessage[];
      return messages.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      console.error('加载对话历史失败:', error);
      return [];
    }
  }

  saveConversation(messages: ConversationMessage[]): void {
    try {
      const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);
      writeFileSync(this.conversationFile, JSON.stringify(sortedMessages, null, 2), 'utf-8');
    } catch (error) {
      console.error('保存对话历史失败:', error);
    }
  }

  appendMessage(message: ConversationMessage): void {
    const existing = this.loadConversation();
    existing.push(message);
    this.saveConversation(existing);
  }

  getConversationFilePath(): string {
    return this.conversationFile;
  }
}