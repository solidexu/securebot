/**
 * 颜色类型定义
 */

import { STATUS_COLORS, LOG_LEVEL_COLORS, MESSAGE_TYPE_COLORS } from '../constants/index.js';

// Ink 支持的颜色
export type InkColor =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'gray'
  | 'grey';

// 状态类型
export type AgentStatus = keyof typeof STATUS_COLORS;
export type LogLevel = keyof typeof LOG_LEVEL_COLORS;
export type MessageType = keyof typeof MESSAGE_TYPE_COLORS;

// 颜色映射类型
export type StatusColorMap = typeof STATUS_COLORS;
export type LogLevelColorMap = typeof LOG_LEVEL_COLORS;
export type MessageTypeColorMap = typeof MESSAGE_TYPE_COLORS;

// 获取状态颜色（类型安全）
export function getStatusColor(status: AgentStatus): InkColor {
  return STATUS_COLORS[status] as InkColor;
}

// 获取日志级别颜色（类型安全）
export function getLogLevelColor(level: LogLevel): InkColor {
  return LOG_LEVEL_COLORS[level] as InkColor;
}

// 获取消息类型颜色（类型安全）
export function getMessageTypeColor(type: MessageType): InkColor {
  return MESSAGE_TYPE_COLORS[type] as InkColor;
}