/**
 * 重试策略
 * 
 * 参考 LangGraph 的 retry 实现
 */

import { AgentError, isRetryableError, RetryExhaustedError, TimeoutError } from './errors.js';

/**
 * 重试策略配置
 */
export interface RetryPolicy {
  /** 最大尝试次数 */
  maxAttempts: number;
  /** 初始间隔（毫秒） */
  initialInterval: number;
  /** 最大间隔（毫秒） */
  maxInterval: number;
  /** 退避因子 */
  backoffFactor: number;
  /** 是否添加抖动 */
  jitter: boolean;
  /** 可重试判断函数 */
  retryOn: (error: Error) => boolean;
}

/**
 * 默认重试策略
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialInterval: 1000,
  maxInterval: 30000,
  backoffFactor: 2,
  jitter: true,
  retryOn: isRetryableError,
};

/**
 * 无重试策略
 */
export const NO_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 1,
  initialInterval: 0,
  maxInterval: 0,
  backoffFactor: 1,
  jitter: false,
  retryOn: () => false,
};

/**
 * 激进重试策略（适用于网络请求）
 */
export const AGGRESSIVE_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  initialInterval: 500,
  maxInterval: 10000,
  backoffFactor: 1.5,
  jitter: true,
  retryOn: isRetryableError,
};

/**
 * 计算重试等待时间
 */
export function calculateBackoff(
  attempt: number,
  policy: RetryPolicy
): number {
  // 计算基础间隔
  let interval = policy.initialInterval;
  interval = interval * Math.pow(policy.backoffFactor, attempt - 1);
  
  // 限制最大间隔
  interval = Math.min(interval, policy.maxInterval);
  
  // 添加抖动（±50%）
  if (policy.jitter) {
    const jitterRange = interval * 0.5;
    interval = interval + (Math.random() * 2 - 1) * jitterRange;
  }
  
  return Math.max(0, Math.round(interval));
}

/**
 * 带重试的执行函数
 */
export async function runWithRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  options?: {
    nodeId?: string;
    logger?: { warn: (msg: string) => void };
    onRetry?: (attempt: number, error: Error, delay: number) => void;
  }
): Promise<T> {
  let attempts = 0;
  let lastError: Error | undefined;

  while (attempts < policy.maxAttempts) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      attempts++;

      // 检查是否应该重试
      if (!policy.retryOn(error)) {
        throw error;
      }

      // 检查是否达到最大尝试次数
      if (attempts >= policy.maxAttempts) {
        const retryError = new RetryExhaustedError(
          options?.nodeId || 'unknown',
          attempts,
          error
        );
        throw retryError;
      }

      // 计算等待时间
      const delay = calculateBackoff(attempts, policy);

      options?.logger?.warn?.(
        `Retrying after ${delay}ms (attempt ${attempts + 1}/${policy.maxAttempts}): ${error.message}`
      );

      options?.onRetry?.(attempts, error, delay);

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * 带超时和重试的执行函数
 */
export async function runWithTimeoutAndRetry<T>(
  fn: () => Promise<T>,
  options: {
    timeoutMs?: number;
    retryPolicy?: RetryPolicy;
    nodeId?: string;
    logger?: { warn: (msg: string) => void };
  } = {}
): Promise<T> {
  const { timeoutMs, retryPolicy = DEFAULT_RETRY_POLICY, nodeId, logger } = options;

  return runWithRetry(
    async () => {
      if (!timeoutMs) {
        return fn();
      }

      return runWithTimeout(fn, timeoutMs, nodeId);
    },
    retryPolicy,
    { nodeId, logger }
  );
}

/**
 * 带超时的执行函数
 */
export async function runWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  nodeId?: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(nodeId || 'unknown', timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * 休眠函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 重试装饰器
 */
export function withRetry(
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: any, ...args: any[]) {
      return runWithRetry(
        () => originalMethod.apply(this, args),
        policy,
        { nodeId: String(propertyKey) }
      );
    };

    return descriptor;
  };
}