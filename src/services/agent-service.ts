/**
 * Agent 服务实现
 */

import type { AgentService, ExecutionContext } from './types.js';
import type { Agent } from '../core/agent/index.js';
import type { Session } from '../core/session/index.js';
import { getAgentManager } from '../core/agent/index.js';
import { emitEvent, EventType } from '../core/event-bus.js';

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
    
    // 发射 Agent 开始事件
    emitEvent(EventType.AGENT_START, {
      agentId: agent.id,
      timestamp: Date.now(),
    });

    try {
      await session.sendMessage(message);
      
      // 发射 Agent 结束事件
      emitEvent(EventType.AGENT_STOP, {
        agentId: agent.id,
        timestamp: Date.now(),
      });
    } catch (error) {
      // 发射错误事件
      emitEvent(EventType.AGENT_ERROR, {
        agentId: agent.id,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
      throw error;
    }
  }
}