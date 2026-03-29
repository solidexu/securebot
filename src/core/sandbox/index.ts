/**
 * 沙箱管理器
 * 
 * 负责 agent 的沙箱隔离和路径访问控制
 */

import type { 
  SandboxConfig, 
  AccessResult 
} from './types.js';
import { PathFilterSandbox } from './path-filter.js';

// 导出类型
export * from './types.js';

// 导出 PathFilterSandbox
export { PathFilterSandbox } from './path-filter.js';

// 导出 Docker 沙箱
export { 
  DockerSandbox, 
  getDockerSandbox, 
  initDockerSandboxEnvironment,
  listRunningContainers,
  stopAllContainers,
} from './docker.js';

// ============ 沙箱实例管理 ============

/**
 * 全局沙箱实例缓存
 */
const sandboxInstances = new Map<string, PathFilterSandbox>();

/**
 * 获取或创建沙箱实例
 */
export function getSandbox(
  agentId: string, 
  workspace: string,
  config?: Partial<SandboxConfig>
): PathFilterSandbox {
  let sandbox = sandboxInstances.get(agentId);
  
  if (!sandbox) {
    sandbox = new PathFilterSandbox(agentId, {
      ...config,
      workspace,
    });
    sandboxInstances.set(agentId, sandbox);
  }
  
  return sandbox;
}

/**
 * 重置沙箱实例
 */
export function resetSandbox(agentId: string): void {
  const sandbox = sandboxInstances.get(agentId);
  if (sandbox) {
    sandbox.reset();
  }
  sandboxInstances.delete(agentId);
}

/**
 * 检查路径访问权限（便捷方法）
 */
export function checkPathAccess(
  agentId: string,
  path: string,
  operation: 'read' | 'write' | 'execute' = 'read'
): AccessResult {
  const sandbox = sandboxInstances.get(agentId);
  
  if (!sandbox) {
    return {
      allowed: false,
      reason: '沙箱未初始化',
    };
  }
  
  return sandbox.checkAccess({ path, operation });
}

// ============ 沙箱工厂 ============

/**
 * 创建沙箱实例（根据配置选择类型）
 */
export async function createSandbox(
  agentId: string,
  workspace: string,
  config?: Partial<SandboxConfig>
): Promise<PathFilterSandbox> {
  const sandboxType = config?.type ?? 'path-filter';
  
  if (sandboxType === 'docker') {
    const { getDockerSandbox } = await import('./docker.js');
    const dockerSandbox = await getDockerSandbox(agentId, workspace, config);
    
    if (dockerSandbox) {
      // 启动容器
      await dockerSandbox.start();
      return dockerSandbox;
    }
    
    // Docker 不可用，回退到路径过滤
    console.warn('Docker 不可用，使用路径过滤沙箱');
  }
  
  // 默认使用路径过滤沙箱
  return getSandbox(agentId, workspace, config);
}