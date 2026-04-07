/**
 * Zustand Store 统一导出
 * 
 * 提供 TUI 状态管理的统一入口
 */

// 消息状态
export {
  useMessageStore,
  useMessageList,
  useMessageActions,
  useSelectedMessage,
} from './message-store.js';

// UI 状态
export {
  useUIStore,
  useFocus,
  useScroll,
  useHistory,
  useLogs,
} from './ui-store.js';

// 编辑器状态
export {
  useEditorStore,
  useCodeEditor,
  useShellOutput,
} from './editor-store.js';

// 协作状态（待实现）
// export { useCollaborationStore } from './collaboration-store.js';