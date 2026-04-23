/**
 * CLI 人在回路交互层
 * 
 * 提供终端用户在 HITL 中断时的交互能力
 */

import {
  HumanInteractionManager,
  HumanDecision,
  InterruptState,
  HitlLevel,
} from '../core/collaboration/index.js';

/**
 * 格式化时间
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

/**
 * 格式化标签（用于操作和中断类型）
 */
function formatLabel(action: string): string {
  const labels: Record<string, string> = {
    before_node: '节点前',
    after_node: '节点后',
    tool_call: '工具调用',
    approve: '✅ 通过',
    reject: '❌ 拒绝',
    skip: '⏭️ 跳过',
    modify: '✏️ 修改',
    abort: '⛔ 终止',
  };
  return labels[action] || action;
}

/**
 * 格式化中断信息
 */
export function formatInterrupt(interrupt: InterruptState): string {
  const lines: string[] = [];
  
  lines.push(`\n${'─'.repeat(60)}`);
  lines.push(`⏸️  等待人类决策`);
  lines.push(`${'─'.repeat(60)}`);
  lines.push(`  Thread:   ${interrupt.threadId}`);
  lines.push(`  节点:     ${interrupt.nodeId || 'N/A'}`);
  lines.push(`  位置:     ${interrupt.interruptType === 'before_node' ? '节点执行前' : interrupt.interruptType === 'after_node' ? '节点执行后' : interrupt.interruptType || 'N/A'}`);
  lines.push(`  原因:     ${interrupt.reason || '手动中断'}`);
  lines.push(`  级别:     ${formatHitlLevel(interrupt.interruptType)}`);
  lines.push(`  创建时间: ${formatTime(interrupt.createdAt)}`);
  
  if (interrupt.currentState) {
    lines.push(`\n  当前状态:`);
    const snapshot = interrupt.currentState as Record<string, unknown>;
    const keys = Object.keys(snapshot).slice(0, 5);
    for (const key of keys) {
      const value = snapshot[key];
      const display = typeof value === 'string' 
        ? (value.length > 50 ? value.slice(0, 50) + '...' : value)
        : JSON.stringify(value);
      lines.push(`    ${key}: ${display}`);
    }
    if (Object.keys(snapshot).length > 5) {
      lines.push(`    ... +${Object.keys(snapshot).length - 5} more`);
    }
  }
  
  lines.push('');
  return lines.join('\n');
}

/**
 * 格式化 HITL 级别/类型标签
 */
function formatHitlLevel(level: HitlLevel | string | undefined): string {
  const labels: Record<string, string> = {
    before_node: '节点前',
    after_node: '节点后',
    tool_call: '工具调用',
    [HitlLevel.FULL_AUTO]: '全自动',
    [HitlLevel.TOOL_APPROVAL]: '工具审批',
    [HitlLevel.NODE_INTERRUPT]: '节点中断',
    [HitlLevel.STEP_THROUGH]: '逐步执行',
    [HitlLevel.FULL_MANUAL]: '全手动',
  };
  return level ? labels[String(level)] || String(level) : 'N/A';
}

/**
 * 显示中断菜单并等待用户输入
 */
export async function presentDecision(
  interrupt: InterruptState,
  options: { nonInteractive?: boolean } = {}
): Promise<HumanDecision> {
  if (options.nonInteractive || !process.stdin.isTTY) {
    console.log(`\n⚡ 非交互模式，默认批准`);
    return { action: 'approve', reason: 'Auto-approved (non-interactive mode)' };
  }

  console.log(formatInterrupt(interrupt));
  console.log('请选择操作:');
  console.log('  1 - ✅ 通过 (approve)');
  console.log('  2 - ❌ 拒绝 (reject)');
  console.log('  3 - ⏭️ 跳过 (skip)');
  console.log('  4 - ✏️ 修改后继续 (modify)');
  console.log('  5 - ⛔ 终止 (abort)');
  console.log();

  const action = await readChoice();

  let reason: string | undefined;
  let goto: string | undefined;
  let modifiedContent: string | undefined;
  let modifiedState: Record<string, unknown> | undefined;

  switch (action) {
    case 'approve':
      reason = await readOptionalReason();
      break;

    case 'reject':
      console.log('  跳转到节点 (可选，留空跳至下一节点):');
      goto = await readLine();
      if (goto === '') goto = undefined;
      reason = await readOptionalReason();
      break;

    case 'skip':
      reason = await readOptionalReason();
      break;

    case 'modify':
      console.log('  输入状态修改 (JSON 格式，留空跳过):');
      const jsonInput = await readLine();
      if (jsonInput) {
        try {
          modifiedState = JSON.parse(jsonInput);
        } catch {
          console.log('⚠️  JSON 格式无效，忽略修改');
        }
      }
      reason = await readOptionalReason();
      break;

    case 'abort':
      reason = await readOptionalReason();
      break;

    default:
      return { action: 'approve', reason: 'Default approve (invalid choice)' };
  }

  const decision: HumanDecision = {
    action: action as HumanDecision['action'],
    reason,
    goto,
    modifiedContent,
    modifiedState,
  };

  return decision;
}

/**
 * 读取用户选择
 */
function readChoice(): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    
    const onData = (data: string) => {
      const input = data.trim();
      cleanup();
      
      const map: Record<string, string> = {
        '1': 'approve',
        '2': 'reject',
        '3': 'skip',
        '4': 'modify',
        '5': 'abort',
      };
      resolve(map[input] || 'approve');
    };
    
    const cleanup = () => {
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('error', onError);
    };
    
    process.stdin.on('data', onData);
    process.stdin.once('error', onError);
  });
}

/**
 * 读取一行输入
 */
function readLine(): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    
    const onData = (data: string) => {
      cleanup();
      resolve(data.trim());
    };
    
    const cleanup = () => {
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('error', onError);
    };
    
    process.stdin.on('data', onData);
    process.stdin.once('error', onError);
  });
}

/**
 * 读取可选备注
 */
async function readOptionalReason(): Promise<string | undefined> {
  console.log('  备注 (可选，回车跳过):');
  const reason = await readLine();
  return reason || undefined;
}

/**
 * 格式化决策结果
 */
export function formatDecision(decision: HumanDecision): string {
  const lines: string[] = [];
  lines.push(`\n✅ 决策: ${formatLabel(decision.action)}`);
  if (decision.reason) {
    lines.push(`   备注: ${decision.reason}`);
  }
  if (decision.goto) {
    lines.push(`   跳转: ${decision.goto}`);
  }
  return lines.join('\n');
}

/**
 * 格式化待处理中断列表
 */
export function formatPendingInterrupts(interrupts: InterruptState[]): string {
  if (interrupts.length === 0) {
    return '\n✅ 没有待处理的中断';
  }

  const lines: string[] = [];
  lines.push(`\n⏸️  待处理中断 (${interrupts.length} 个):`);
  lines.push(`${'─'.repeat(60)}`);

  for (const interrupt of interrupts) {
    lines.push(`\n  Thread: ${interrupt.threadId}`);
    lines.push(`  节点:   ${interrupt.nodeId || 'N/A'}`);
    lines.push(`  位置:   ${interrupt.interruptType || 'N/A'}`);
    lines.push(`  原因:   ${interrupt.reason || '-'}`);
    lines.push(`  创建:   ${formatTime(interrupt.createdAt)}`);
  }

  return lines.join('\n');
}

/**
 * HITL CLI 辅助类
 */
export class HitlCli {
  constructor(
    private manager: HumanInteractionManager,
    private options: { nonInteractive?: boolean } = {}
  ) {}

  async status(): Promise<string> {
    const interrupts = await this.manager.listPendingInterrupts();
    return formatPendingInterrupts(interrupts);
  }

  async decide(threadId: string, interrupt?: InterruptState): Promise<string> {
    const target = interrupt || await this.findInterruptByThread(threadId);
    if (!target) {
      return `❌ 未找到 thread 对应的中断: ${threadId}`;
    }

    const decision = await presentDecision(target, this.options);
    await this.manager.submitDecision(threadId, decision);
    return formatDecision(decision);
  }

  async approve(threadId: string): Promise<string> {
    await this.manager.submitDecision(threadId, {
      action: 'approve',
      reason: 'CLI quick approve',
    });
    return `✅ 已批准 thread: ${threadId}`;
  }

  async reject(threadId: string, goto?: string): Promise<string> {
    await this.manager.submitDecision(threadId, {
      action: 'reject',
      goto,
      reason: 'CLI quick reject',
    });
    return `❌ 已拒绝 thread: ${threadId}${goto ? ` (跳转至 ${goto})` : ''}`;
  }

  async skip(threadId: string): Promise<string> {
    await this.manager.submitDecision(threadId, {
      action: 'skip',
      reason: 'CLI quick skip',
    });
    return `⏭️ 已跳过 thread: ${threadId}`;
  }

  async abort(threadId: string): Promise<string> {
    await this.manager.submitDecision(threadId, {
      action: 'abort',
      reason: 'CLI abort',
    });
    return `⛔ 已终止 thread: ${threadId}`;
  }

  async editState(threadId: string, valuesJson: string): Promise<string> {
    let values: Record<string, unknown>;
    try {
      values = JSON.parse(valuesJson);
    } catch {
      return `❌ 无效的 JSON 格式`;
    }

    await this.manager.editState(threadId, values);
    return `✏️ 状态已更新 thread: ${threadId}`;
  }

  private async findInterruptByThread(threadId: string): Promise<InterruptState | null> {
    const interrupts = await this.manager.listPendingInterrupts();
    return interrupts.find(i => i.threadId === threadId) || null;
  }
}

/**
 * 创建 HITL CLI 实例
 */
export function createHitlCli(manager: HumanInteractionManager, options?: { nonInteractive?: boolean }): HitlCli {
  return new HitlCli(manager, options);
}
