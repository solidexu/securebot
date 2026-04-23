/**
 * Agent 协作模块
 */

// 核心类型
export * from './types';

// 图相关
export { Graph } from './graph.js';
export { GraphBuilder, createGraph, createNode, keywordsCondition, expressionCondition } from './builder.js';
export { loadFromYaml, loadFromConfig, loadFromFile, validateYamlConfig } from './loader.js';
export { GraphExecutor } from './executor.js';
export type { LLMClient, LLMResponse, ToolDefinition, RunOptions } from './executor.js';
export { LangGraphAdapter } from './langgraph-adapter.js';
export type { LangGraphAdapterConfig, CompiledLangGraphApp, LangGraphModule } from './langgraph-adapter.js';
export { UnifiedOrchestrator, createOrchestrator } from './orchestrator.js';
export type { OrchestratorConfig, RunOptions as OrchestratorRunOptions, OrchestratorEvent } from './orchestrator.js';

// Reducers
export { ReducerRegistry, getReducerRegistry, registerReducer, applyReducer } from './reducers.js';
export type { ReducerFunction, ReducerDefinition } from './types.js';

// Memory Store
export { AgentMemoryStore, getMemoryStore, configureMemoryStore } from './memory-store.js';
export type { MemoryEntry, MemoryType, MemoryQueryOptions, MemoryStoreConfig, SharingPolicy } from './memory-store.js';

// Streaming
export { StreamingExecutor, createStreamingExecutor, runWithStreaming } from './streaming.js';
export type { StreamEvent, StreamEventType, StreamCallback, StreamOptions } from './streaming.js';

// Message Bus & Collaboration (新增)
export { AgentMessageBus } from './message-bus.js';
export type { AgentMessage, MessageStatus } from './message-bus.js';

export { DelegationManager } from './delegation-manager.js';
export type {
  DelegationRequest,
  DelegationStatus,
  ExecutionRecord,
  ReviewRecord,
  ConversationMessage,
  CollaborationConfig,
} from './delegation-manager.js';

export { SharedWorkspaceManager } from './workspace-manager.js';
export type { SharedWorkspace, WorkspacePermission, WorkspaceFile } from './workspace-manager.js';

export {
  CollaborationManager,
  getCollaborationManager,
  configureCollaborationManager,
  resetCollaborationManager,
} from './collaboration-manager.js';
// Human-in-the-Loop
export { HumanInteractionManager, createHitlManager, isAbortDecision, isSkipDecision, hasStateModification, getDecisionGoto } from './hitl-manager.js';
export type { HitlEventEmitter } from './hitl-manager.js';
export { MemoryInterruptStore, FileInterruptStore } from './hitl-store.js';
export type { InterruptStore, CheckpointData, FileStoreConfig } from './hitl-store.js';
export { HitlLevel, InterruptType } from './hitl-types.js';
export type {
  HitlConfig,
  HitlEvent,
  HumanDecision,
  DecisionAction,
  InterruptState,
  InterruptType,
  AgentHitlConfig,
} from './hitl-types.js';
