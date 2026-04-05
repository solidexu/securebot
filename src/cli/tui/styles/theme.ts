/**
 * 主题配置 - 现代深色终端风格
 */

export const theme = {
  colors: {
    primary: 'cyan',
    secondary: 'magenta',
    accent: 'blue',
    success: 'green',
    error: 'red',
    warning: 'yellow',
    muted: 'gray',
    text: 'white',
    // 新增：背景色
    bgDark: '#1a1b26',
    bgCard: '#24283b',
    bgHighlight: '#2f334d',
  },

  borders: {
    normal: 'round',      // 圆角边框
    focus: 'double',      // 聚焦双线边框
    titleBar: 'classic',   // 标题栏样式
  },

  message: {
    user: { color: 'green', icon: '>' },
    agent: { color: 'cyan', icon: '*' },
    system: { color: 'gray', icon: '-' },
    tool: { color: 'blue', icon: '#' },
    error: { color: 'red', icon: '!' },
  },

  agent: {
    idle: { icon: 'o', color: 'gray' },
    working: { icon: '*', color: 'yellow' },
    completed: { icon: '+', color: 'green' },
  },

  panel: {
    // 右侧面板配色方案（区分不同面板）
    task: { border: 'magenta', title: 'magenta', text: 'white' },
    agent: { border: 'cyan', title: 'cyan', text: 'white' },
    log: { border: 'blue', title: 'blue', text: 'gray' },
  },

  layout: {
    chatWidth: '70%',
    statusWidth: '30%',
    // 输入框现在独立于主内容区，占全宽
    inputHeight: '10%',

    // 标题栏和状态栏高度
    headerHeight: 3,     // 顶部标题栏（固定行数）
    footerHeight: 3,     // 底部状态栏（固定行数）
    // mainHeight 不再需要，用 flexGrow 让中间内容自适应

    // 右侧面板内部比例（总和 100%）
    taskHeight: '25%',
    agentHeight: '35%',
    logHeight: '40%',

    // 间距
    gap: 0,
    paddingX: 1,
    paddingY: 0,
  },

  // 字符装饰
  chars: {
    horizontal: '\u2500',   // ─
    vertical: '\u2502',     // │
    cornerTL: '\u250c',     // ┌
    cornerTR: '\u2510',     // ┐
    cornerBL: '\u2514',     // └
    cornerBR: '\u2518',     // ┘
    cross: '\u253c',        // ├
    teeUp: '\u2534',        // ┴
    teeDown: '\u252c',      // ┬
    dot: '\u2022',          // •
    bullet: '\u25cf',       // ●
    arrow: '\u2192',        // →
  },
} as const;

export type Theme = typeof theme;