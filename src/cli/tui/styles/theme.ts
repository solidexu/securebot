/**
 * 主题配置
 */

export const theme = {
  colors: {
    primary: 'cyan',
    secondary: 'yellow',
    success: 'green',
    error: 'red',
    warning: 'yellow',
    muted: 'gray',
    text: 'white',
  },

  borders: {
    normal: 'single',
    focus: 'double',
  },

  message: {
    user: { color: 'green', icon: '👤' },
    agent: { color: 'cyan', icon: '🤖' },
    system: { color: 'gray', icon: '⚡' },
    tool: { color: 'blue', icon: '🔧' },
    error: { color: 'red', icon: '❌' },
  },

  agent: {
    idle: { icon: '💤', color: 'gray' },
    working: { icon: '🔄', color: 'yellow' },
    completed: { icon: '✅', color: 'green' },
  },

  layout: {
    chatWidth: '70%',
    statusWidth: '30%',
    contentHeight: '85%',
    inputHeight: '15%',
  },
} as const;

export type Theme = typeof theme;