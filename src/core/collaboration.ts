/**
 * 协作模块 - 向后兼容导出
 * 
 * 此文件重导出 collaboration/ 目录中的所有内容
 * @deprecated 请直接从 './collaboration/index.js' 导入
 */

// 重导出所有内容
export * from './collaboration/index.js';

// 导出主要类（向后兼容）
export {
  AgentMessageBus,
  DelegationManager,
  SharedWorkspaceManager,
  CollaborationManager,
  getCollaborationManager,
  configureCollaborationManager,
} from './collaboration/index.js';

// 导出类型（向后兼容）
export type {
  AgentMessage,
  DelegationRequest,
  ExecutionRecord,
  ReviewRecord,
  ConversationMessage,
  SharedWorkspace,
  WorkspacePermission,
  CollaborationConfig,
} from './collaboration/index.js';