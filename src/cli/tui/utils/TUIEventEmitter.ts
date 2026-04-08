/**
 * TUI 事件发射器
 * 
 * 封装事件发射逻辑，供核心模块使用
 */

import { 
  emitEvent, 
  emitEventAsync,
  EventType,
  type AgentMessageEvent,
  type UIMessageEvent,
  type UIStreamEvent,
  type UICodeEvent,
  type UIShellEvent,
  type WorkflowEvent,
} from '../../core/event-bus.js';

/**
 * TUI 事件发射器
 */
export class TUIEventEmitter {
  /**
   * 发射 Agent 消息事件
   */
  static emitAgentMessage(agentId: string, message: string): void {
    emitEvent(EventType.AGENT_MESSAGE, {
      agentId,
      message,
      timestamp: Date.now(),
    } as AgentMessageEvent);
  }

  /**
   * 发射 UI 消息添加事件
   */
  static emitUIMessage(
    id: string,
    role: 'user' | 'assistant' | 'system',
    content: string
  ): void {
    emitEvent(EventType.UI_MESSAGE_ADD, {
      id,
      role,
      content,
      timestamp: Date.now(),
    } as UIMessageEvent);
  }

  /**
   * 发射流式消息事件
   */
  static emitUIStream(id: string, chunk: string, isComplete: boolean): void {
    emitEvent(EventType.UI_MESSAGE_STREAM, {
      id,
      chunk,
      isComplete,
    } as UIStreamEvent);
  }

  /**
   * 发射流式结束事件
   */
  static emitUIStreamEnd(id: string): void {
    emitEvent(EventType.UI_STREAM_END, { id, chunk: '', isComplete: true });
  }

  /**
   * 发射代码编辑开始事件
   */
  static emitCodeStart(filePath: string, content?: string): void {
    emitEvent(EventType.UI_CODE_START, {
      filePath,
      content,
      status: 'start',
    } as UICodeEvent);
  }

  /**
   * 发射代码编辑更新事件
   */
  static emitCodeUpdate(filePath: string, line: number, content?: string): void {
    emitEvent(EventType.UI_CODE_UPDATE, {
      filePath,
      line,
      content,
      status: 'update',
    } as UICodeEvent);
  }

  /**
   * 发射代码编辑结束事件
   */
  static emitCodeEnd(filePath: string): void {
    emitEvent(EventType.UI_CODE_END, {
      filePath,
      status: 'end',
    } as UICodeEvent);
  }

  /**
   * 发射 Shell 开始事件
   */
  static emitShellStart(command: string, cwd?: string): void {
    emitEvent(EventType.UI_SHELL_START, {
      command,
      cwd,
      status: 'start',
    } as UIShellEvent);
  }

  /**
   * 发射 Shell 输出事件
   */
  static emitShellOutput(command: string, output: string): void {
    emitEvent(EventType.UI_SHELL_OUTPUT, {
      command,
      output,
      status: 'output',
    } as UIShellEvent);
  }

  /**
   * 发射 Shell 结束事件
   */
  static emitShellEnd(command: string, exitCode: number | null): void {
    emitEvent(EventType.UI_SHELL_END, {
      command,
      exitCode,
      status: 'end',
    } as UIShellEvent);
  }

  /**
   * 发射工作流开始事件
   */
  static emitWorkflowStart(workflowId: string): void {
    emitEvent(EventType.WORKFLOW_START, {
      workflowId,
      status: 'start',
    } as WorkflowEvent);
  }

  /**
   * 发射工作流节点开始事件
   */
  static emitWorkflowNodeStart(workflowId: string, nodeId: string, nodeName: string): void {
    emitEvent(EventType.WORKFLOW_NODE_START, {
      workflowId,
      nodeId,
      nodeName,
      status: 'node_start',
    } as WorkflowEvent);
  }

  /**
   * 发射工作流节点结束事件
   */
  static emitWorkflowNodeEnd(workflowId: string, nodeId: string, nodeName: string): void {
    emitEvent(EventType.WORKFLOW_NODE_END, {
      workflowId,
      nodeId,
      nodeName,
      status: 'node_end',
    } as WorkflowEvent);
  }

  /**
   * 发射工作流结束事件
   */
  static emitWorkflowEnd(workflowId: string): void {
    emitEvent(EventType.WORKFLOW_END, {
      workflowId,
      status: 'end',
    } as WorkflowEvent);
  }

  /**
   * 发射工作流错误事件
   */
  static emitWorkflowError(workflowId: string, error: string): void {
    emitEvent(EventType.WORKFLOW_ERROR, {
      workflowId,
      status: 'error',
      error,
    } as WorkflowEvent);
  }

  /**
   * 发射焦点变化事件
   */
  static emitFocusChange(panel: string): void {
    emitEvent(EventType.UI_FOCUS_CHANGE, { panel });
  }

  /**
   * 发射流式开始事件
   */
  static emitStreamStart(): void {
    emitEvent(EventType.UI_STREAM_START, {});
  }

  /**
   * 发射流式结束事件
   */
  static emitStreamEnd(): void {
    emitEvent(EventType.UI_STREAM_END, {});
  }
}