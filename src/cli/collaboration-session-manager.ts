import chalk from 'chalk';
import * as readline from 'node:readline';
import { EventEmitter } from 'node:events';
import { CollaborationFileSync } from './collaboration-sync.js';

export interface DecisionOption {
  key: string;
  label: string;
  description?: string;
}

export interface DecisionRequest {
  id: string;
  title: string;
  options: DecisionOption[];
  urgent: boolean;
  timestamp: number;
}

export class CollaborationSessionManager extends EventEmitter {
  private fileSync: CollaborationFileSync;
  private decisionRequests: Map<string, DecisionRequest> = new Map();
  private blinkInterval: NodeJS.Timeout | null = null;
  private isBlinking: boolean = false;

  constructor() {
    super();
    this.fileSync = new CollaborationFileSync({ debounceMs: 100 });
    this.setupFileSyncListeners();
  }

  private setupFileSyncListeners(): void {
    this.fileSync.on('change', (filePath: string) => {
      this.emit('fileChanged', filePath);
    });
  }

  startWatching(delegationId: string, dataDir: string): void {
    this.fileSync.watchDelegationFile(delegationId, dataDir);
  }

  stopWatching(): void {
    this.fileSync.stopWatching();
    this.stopBlinking();
  }

  detectMention(content: string, delegatee: string): boolean {
    const mentionPattern = new RegExp(`@${delegatee}\\b`, 'i');
    return mentionPattern.test(content);
  }

  async showAutoAcceptDialog(
    rl: readline.Interface,
    delegator: string,
    delegatee: string
  ): Promise<'auto' | 'manual' | 'cancel'> {
    console.log(chalk.yellow.bold('\n  ⚡⚡⚡ 检测到任务接受请求'));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    console.log(chalk.white(`  ${delegator} 请求 ${delegatee} 接受任务`));
    console.log();
    console.log(chalk.white('  [a] 自动接受（推荐）'));
    console.log(chalk.white('  [m] 等待被委托者登录确认'));
    console.log(chalk.white('  [c] 取消'));
    console.log(chalk.gray('  ' + '─'.repeat(50)));

    const answer = await rl.question(chalk.yellow('\n  请选择: '));
    
    switch (answer.toLowerCase()) {
      case 'a':
        return 'auto';
      case 'm':
        return 'manual';
      case 'c':
        return 'cancel';
      default:
        return 'cancel';
    }
  }

  createDecisionRequest(
    title: string,
    options: DecisionOption[],
    urgent: boolean = false
  ): DecisionRequest {
    const id = `decision-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const request: DecisionRequest = {
      id,
      title,
      options,
      urgent,
      timestamp: Date.now()
    };
    
    this.decisionRequests.set(id, request);
    
    if (urgent) {
      this.startBlinking();
    }
    
    return request;
  }

  async showDecisionDialog(
    rl: readline.Interface,
    request: DecisionRequest
  ): Promise<string | null> {
    this.stopBlinking();
    
    console.log(chalk.yellow.bold('\n  ⚡⚡⚡ 需要您的决策'));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    console.log(chalk.white(`  ${request.title}`));
    console.log();
    
    for (const option of request.options) {
      const desc = option.description ? ` - ${option.description}` : '';
      console.log(chalk.white(`  [${option.key}] ${option.label}${chalk.gray(desc)}`));
    }
    
    console.log(chalk.gray('  ' + '─'.repeat(50)));

    const answer = await rl.question(chalk.yellow('\n  请选择: '));
    
    const selected = request.options.find(o => o.key === answer.toLowerCase());
    if (selected) {
      this.decisionRequests.delete(request.id);
      return selected.key;
    }
    
    return null;
  }

  private startBlinking(): void {
    if (this.blinkInterval) return;
    
    this.isBlinking = true;
    let toggle = false;
    
    this.blinkInterval = setInterval(() => {
      toggle = !toggle;
      if (toggle) {
        process.stdout.write('\x1b[5m\x1b[33m⚡ URGENT ⚡\x1b[0m');
      } else {
        process.stdout.write('\x1b[0m         ');
      }
    }, 500);
  }

  private stopBlinking(): void {
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
      this.isBlinking = false;
      process.stdout.write('\x1b[0m');
    }
  }

  playNotificationSound(): void {
    try {
      process.stdout.write('\x07');
    } catch (error) {
      // Ignore sound errors
    }
  }

  showUrgentHighlight(message: string): void {
    const border = '═'.repeat(60);
    console.log(chalk.red.bold(`\n  ${border}`));
    console.log(chalk.yellow.bold(`  ⚡⚡⚡ ${message} ⚡⚡⚡`));
    console.log(chalk.red.bold(`  ${border}\n`));
  }

  getPendingDecisionCount(): number {
    return this.decisionRequests.size;
  }

  hasUrgentDecisions(): boolean {
    for (const request of this.decisionRequests.values()) {
      if (request.urgent) return true;
    }
    return false;
  }

  cleanup(): void {
    this.stopWatching();
    this.decisionRequests.clear();
    this.removeAllListeners();
  }
}