/**
 * 服务层入口
 * 
 * 初始化和导出所有服务
 */

import {
  ServiceContainer,
  ServiceNames,
  registerService,
  resolveService,
} from './types.js';
import { AgentServiceImpl } from './agent-service.js';
import { ModelServiceImpl } from './model-service.js';
import { CollaborationServiceImpl } from './collaboration-service.js';

// 导出类型
export type {
  AgentService,
  ModelService,
  CollaborationService,
  ExecutionContext,
  ChatParams,
  ChatResult,
  ModelInfo,
  DelegationRequestParams,
} from './types.js';

// 导出容器
export { ServiceContainer, ServiceNames, registerService, resolveService };

// ============ 服务初始化 ============

let initialized = false;

/**
 * 初始化所有服务
 */
export function initializeServices(config?: {
  provider?: string;
  model?: string;
  client?: unknown;
}): void {
  if (initialized) return;

  const container = new ServiceContainer();

  // 注册 Agent 服务
  container.register(ServiceNames.AGENT_SERVICE, new AgentServiceImpl());

  // 注册模型服务
  container.register(
    ServiceNames.MODEL_SERVICE,
    new ModelServiceImpl({
      provider: config?.provider,
      model: config?.model,
      client: config?.client,
    })
  );

  // 注册协作服务
  container.register(ServiceNames.COLLABORATION_SERVICE, new CollaborationServiceImpl());

  initialized = true;
}

/**
 * 获取 Agent 服务
 */
export function getAgentService() {
  return resolveService<import('./types.js').AgentService>(ServiceNames.AGENT_SERVICE);
}

/**
 * 获取模型服务
 */
export function getModelService() {
  return resolveService<import('./types.js').ModelService>(ServiceNames.MODEL_SERVICE);
}

/**
 * 获取协作服务
 */
export function getCollaborationService() {
  return resolveService<import('./types.js').CollaborationService>(ServiceNames.COLLABORATION_SERVICE);
}