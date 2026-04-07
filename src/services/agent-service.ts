/**
 * Agent 服务实现
 */

import type { AgentService, ExecutionContext } from './types.js';
import type { Agent } from '../core/agent/index.js';
import type { Session } from '../core/session/index.js';
import { getAgentManager } from '../core/agent/index.js';

/**
 * Agent 服务实现
 */
export class AgentServiceImpl implements AgentService {
  private agentManager = getAgentManager();

  async getDefaultAgent(): Promise<Agent> {
    return this.agentManager.getDefaultAgent();
  }

  getAgent(id: string): Agent | undefined {
    return this.agentManager.getAgent(id);
  }

  listAgents(): Agent[] {
    return this.agentManager.listAgents();
  }

  async createSession(agentId: string): Promise<Session> {
    return this.agentManager.createSession(agentId);
  }

  async executeMessage(message: string, context?: ExecutionContext): Promise<void> {
    const agent = await this.getDefaultAgent();
    const session = await this.createSession(agent.id);
    await session.sendMessage(message);
  }
}