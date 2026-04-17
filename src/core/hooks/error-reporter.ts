/**
 * Hook 错误上报器
 */

export interface ErrorReport {
  hookName: string;
  trigger: string;
  error: string;
  context: {
    agentId: string;
    sessionId: string;
  };
  timestamp: string;
}

// 错误存储（简单实现）
const errorReports: ErrorReport[] = [];
const MAX_REPORTS = 100;

/**
 * 上报 Hook 执行错误
 */
export function reportHookError(
  hookName: string,
  trigger: string,
  error: Error | unknown,
  context: { agentId: string; sessionId: string }
): void {
  const report: ErrorReport = {
    hookName,
    trigger,
    error: error instanceof Error ? error.message : String(error),
    context,
    timestamp: new Date().toISOString(),
  };
  
  // 添加到队列
  errorReports.push(report);
  
  // 限制数量
  if (errorReports.length > MAX_REPORTS) {
    errorReports.shift();
  }
  
  // 输出到日志
  console.error(`[HookError] ${hookName} (${trigger}): ${report.error}`);
}

/**
 * 获取错误报告列表
 */
export function getErrorReports(limit: number = 20): ErrorReport[] {
  return errorReports.slice(-limit);
}

/**
 * 清除错误报告
 */
export function clearErrorReports(): void {
  errorReports.length = 0;
}

/**
 * 获取错误统计
 */
export function getErrorStats(): { total: number; byHook: Record<string, number> } {
  const byHook: Record<string, number> = {};
  
  for (const report of errorReports) {
    byHook[report.hookName] = (byHook[report.hookName] || 0) + 1;
  }
  
  return {
    total: errorReports.length,
    byHook,
  };
}
