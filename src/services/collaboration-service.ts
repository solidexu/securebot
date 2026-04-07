/**
 * 协作服务实现
 */

import type { CollaborationService, DelegationRequestParams } from './types.js';
import { getCollaborationManager } from '../core/collaboration/collaboration-manager.js';
import type { SharedWorkspace } from '../core/collaboration/workspace-manager.js';
import type { GraphExecutor } from '../core/collaboration/executor.js';

/**
 * 协作服务实现
 */
export class CollaborationServiceImpl implements CollaborationService {
  private manager = getCollaborationManager();

  async sendMessage(from: string, to: string, content: string): Promise<string> {
    const message = await this.manager.sendMessage(from, to, content);
    return message.id;
  }

  async createDelegation(request: DelegationRequestParams): Promise<string> {
    return this.manager.createDelegation(
      request.delegator,
      request.delegatee,
      request.task,
      {
        priority: request.priority,
        context: request.context,
        deadline: request.deadline,
      }
    );
  }

  getWorkspace(id: string): SharedWorkspace | undefined {
    return this.manager.getWorkspace(id);
  }

  getGraphExecutor(graphId: string): GraphExecutor | undefined {
    // 如果需要图执行器，可以从管理器获取
    // 这需要扩展 CollaborationManager
    return undefined;
  }
}