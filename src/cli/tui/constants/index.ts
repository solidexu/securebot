/**
 * TUI 常量定义
 * 
 * 统一管理所有魔法数字和配置值
 */

// ============ 动画配置 ============

/** 代码写入动画间隔 (ms) */
export const CODE_WRITE_INTERVAL = 35;

/** 代码编辑动画间隔 (ms) */
export const CODE_EDIT_INTERVAL = 100;

/** 闪烁持续时间 (ms) */
export const BLINK_DURATION = 200;

/** 闪烁间隔 (ms) */
export const BLINK_INTERVAL = 50;

/** 闪烁次数 */
export const BLINK_COUNT = 6;

/** 编辑器自动关闭延迟 (ms) */
export const EDITOR_CLOSE_DELAY = 800;

/** Shell 输出自动关闭延迟 (ms) */
export const SHELL_CLOSE_DELAY = 3000;

// ============ UI 配置 ============

/** 消息窗口高度 */
export const MESSAGE_WINDOW_HEIGHT = 30;

/** 日志窗口高度 */
export const LOG_WINDOW_HEIGHT = 15;

/** 最大输入历史记录数 */
export const MAX_INPUT_HISTORY = 100;

/** 最大日志记录数 */
export const MAX_LOG_ENTRIES = 100;

/** 打字机速度 (字符/秒) */
export const TYPEWRITER_SPEED = 600;

/** 每帧字符数 */
export const CHARS_PER_FRAME = 15;

// ============ 颜色配置 ============

/** 状态颜色映射 */
export const STATUS_COLORS = {
  idle: 'gray',
  working: 'yellow',
  success: 'green',
  error: 'red',
} as const;

/** 日志级别颜色映射 */
export const LOG_LEVEL_COLORS = {
  debug: 'gray',
  info: 'white',
  warn: 'yellow',
  error: 'red',
} as const;

/** 消息类型颜色映射 */
export const MESSAGE_TYPE_COLORS = {
  user: 'cyan',
  agent: 'green',
  system: 'blue',
  tool: 'magenta',
  error: 'red',
  skill: 'yellow',
  warn: 'yellow',
} as const;

// ============ Agent 配置 ============

/** 默认 Agent ID */
export const DEFAULT_AGENT_ID = 'dev';

/** Agent 状态更新间隔 (ms) */
export const AGENT_STATUS_INTERVAL = 5000;

// ============ 路径配置 ============

/** 默认工作目录 */
export const DEFAULT_WORK_DIR = '~/.securebot/workspaces';

/** 配置文件目录 */
export const CONFIG_DIR = '~/.securebot';

/** 数据目录 */
export const DATA_DIR = '~/.securebot/data';