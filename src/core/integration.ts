/**
 * 集成初始化
 * 
 * 统一初始化所有核心管理器
 */

import { getTaskManager, TaskManager } from './task-manager.js';
import { getMemoryManager, MemoryManager } from './memory.js';
import { getConfirmationManager, ConfirmationManager } from './confirmation.js';
import { getCollaborationManager, CollaborationManager } from './collaboration.js';
import { getErrorHandler, ErrorHandler, RetryExecutor } from './error-handler.js';

// ============ 类型定义 ============

export interface AppManagers {
  taskManager: TaskManager;
  memoryManager: MemoryManager;
  confirmationManager: ConfirmationManager;
  collaborationManager: CollaborationManager;
  errorHandler: ErrorHandler;
  retryExecutor: RetryExecutor;
}

export interface AppConfig {
  agentId: string;
  sessionId: string;
  enableCheckpoint?: boolean;
  enableSummary?: boolean;
  enableCollaboration?: boolean;
}

// ============ 全局实例 ============

let globalManagers: AppManagers | null = null;

// ============ 初始化函数 ============

/**
 * 初始化所有管理器
 */
export async function initializeManagers(config: AppConfig): Promise<AppManagers> {
  // 任务管理器
  const taskManager = getTaskManager({
    enableCheckpoint: config.enableCheckpoint ?? true,
  });

  // 记忆管理器
  const memoryManager = getMemoryManager({
    autoSummary: config.enableSummary ?? true,
  });
  await memoryManager.initialize();

  // 确认管理器
  const confirmationManager = getConfirmationManager();

  // 协作管理器
  const collaborationManager = getCollaborationManager();

  // 错误处理器
  const errorHandler = getErrorHandler({
    retry: {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      retryableTypes: ['network', 'timeout', 'rate_limit', 'service'],
    },
  });

  // 重试执行器
  const retryExecutor = new RetryExecutor(errorHandler);

  // 注册协作处理器
  if (config.enableCollaboration ?? true) {
    // 注册消息处理器
    collaborationManager.getMessageBus().registerHandler(
      config.agentId,
      async (message) => {
        // 记录收到的消息
        await memoryManager.remember(
          config.agentId,
          `收到来自 ${message.fromAgent} 的消息: ${message.content}`,
          'conversation',
          3
        );
      }
    );

    // 注册委派处理器
    collaborationManager.getDelegationManager().registerHandler(
      config.agentId,
      async (_request) => {
        // 自动接受委派（可配置）
        return true;
      }
    );
  }

  // 设置用户介入处理器
  errorHandler.setUserInterventionHandler(async (prompt, options) => {
    // 在实际应用中，这应该通过 REPL 询问用户
    // 这里返回默认选项
    console.log(`\n⚠️ ${prompt}`);
    console.log('选项:', options.join(', '));
    return options[0] ?? 'skip';
  });

  globalManagers = {
    taskManager,
    memoryManager,
    confirmationManager,
    collaborationManager,
    errorHandler,
    retryExecutor,
  };

  return globalManagers;
}

/**
 * 获取已初始化的管理器
 */
export function getManagers(): AppManagers {
  if (!globalManagers) {
    throw new Error('管理器未初始化，请先调用 initializeManagers()');
  }
  return globalManagers;
}

/**
 * 重置所有管理器
 */
export async function resetManagers(): Promise<void> {
  // 清理资源
  if (globalManagers) {
    // 保存检查点
    const status = globalManagers.taskManager.getStatus();
    if (status.inProgress > 0) {
      globalManagers.taskManager.saveCheckpoint();
    }

    // 清理过期消息
    globalManagers.collaborationManager.getMessageBus().cleanupExpired();
  }

  // 重置
  globalManagers = null;
}

/**
 * 创建任务上下文
 */
export async function createTaskContext(
  userRequest: string,
  agentId: string
): Promise<{
  taskId: string;
  checkpointId: string;
}> {
  const managers = getManagers();
  
  // 开始任务
  const sessionId = `session-${Date.now()}`;
  managers.taskManager.start(sessionId, agentId, userRequest);

  // 记录到记忆
  await managers.memoryManager.remember(
    agentId,
    `新任务: ${userRequest}`,
    'task',
    4
  );

  // 保存初始检查点
  const checkpointId = managers.taskManager.saveCheckpoint();

  return {
    taskId: sessionId,
    checkpointId,
  };
}

/**
 * 执行带错误处理的操作
 */
export async function executeWithErrorHandling<T>(
  operation: () => Promise<T>,
  context?: {
    tool?: string;
    params?: Record<string, unknown>;
  }
): Promise<T> {
  const managers = getManagers();
  
  return managers.retryExecutor.execute(operation, {
    ...context,
    onRetry: (attempt, delay) => {
      console.log(`重试中... 第 ${attempt} 次，${delay}ms 后重试`);
    },
  });
}

/**
 * 发送协作消息
 */
export async function sendCollaborationMessage(
  fromAgent: string,
  toAgent: string,
  content: string,
  type: 'request' | 'notification' | 'query' = 'notification'
): Promise<void> {
  const managers = getManagers();
  
  await managers.collaborationManager.getMessageBus().sendMessage({
    fromAgent,
    toAgent,
    type,
    content,
    priority: 'normal',
  });
}

/**
 * 委派任务给其他 Agent
 */
export async function delegateToAgent(
  delegator: string,
  delegatee: string,
  task: string,
  options?: {
    context?: string;
    deadline?: number;
    priority?: 'low' | 'normal' | 'high';
  }
): Promise<string> {
  const managers = getManagers();
  
  const delegation = await managers.collaborationManager.delegateTask(
    delegator,
    delegatee,
    task,
    options
  );

  // 记录到记忆
  await managers.memoryManager.remember(
    delegator,
    `委派任务给 ${delegatee}: ${task}`,
    'task',
    4
  );

  return delegation.id;
}

/**
 * 获取应用状态摘要
 */
export function getAppStatus(): {
  task: ReturnType<TaskManager['getStatus']>;
  memory: ReturnType<MemoryManager['getStats']>;
  collaboration: ReturnType<CollaborationManager['getStats']>;
  errors: ReturnType<ErrorHandler['getStats']>;
} {
  const managers = getManagers();

  return {
    task: managers.taskManager.getStatus(),
    memory: managers.memoryManager.getStats(),
    collaboration: managers.collaborationManager.getStats(),
    errors: managers.errorHandler.getStats(),
  };
}