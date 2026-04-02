/**
 * Reducer 注册表
 * 
 * 管理状态 reducers，支持内置和自定义 reducer
 */

import {
  BuiltinReducer,
  ReducerFunction,
  ReducerDefinition,
} from './types.js';

/**
 * Reducer 注册表
 */
export class ReducerRegistry {
  private reducers: Map<string, ReducerDefinition> = new Map();
  private static instance: ReducerRegistry;

  private constructor() {
    // 注册内置 reducers
    this.registerBuiltinReducers();
  }

  /**
   * 获取单例
   */
  static getInstance(): ReducerRegistry {
    if (!ReducerRegistry.instance) {
      ReducerRegistry.instance = new ReducerRegistry();
    }
    return ReducerRegistry.instance;
  }

  /**
   * 注册内置 reducers
   */
  private registerBuiltinReducers(): void {
    // 数组操作
    this.register({
      name: 'append',
      reducer: (current: unknown[], incoming: unknown) => [
        ...(Array.isArray(current) ? current : []),
        ...(Array.isArray(incoming) ? incoming : [incoming]),
      ],
      description: '数组追加',
    });

    this.register({
      name: 'prepend',
      reducer: (current: unknown[], incoming: unknown) => [
        ...(Array.isArray(incoming) ? incoming : [incoming]),
        ...(Array.isArray(current) ? current : []),
      ],
      description: '数组前置',
    });

    this.register({
      name: 'unique',
      reducer: (current: unknown[], incoming: unknown) => {
        const arr = Array.isArray(current) ? current : [];
        const items = Array.isArray(incoming) ? incoming : [incoming];
        const set = new Set(arr.map(JSON.stringify));
        for (const item of items) {
          const key = JSON.stringify(item);
          if (!set.has(key)) {
            arr.push(item);
            set.add(key);
          }
        }
        return arr;
      },
      description: '数组去重追加',
    });

    // 值操作
    this.register({
      name: 'replace',
      reducer: (_current: unknown, incoming: unknown) => incoming,
      description: '替换为新值',
    });

    this.register({
      name: 'last',
      reducer: (_current: unknown, incoming: unknown) => incoming,
      description: '取最后一个值',
    });

    this.register({
      name: 'first',
      reducer: (current: unknown, _incoming: unknown) => current,
      description: '保留第一个值',
    });

    // 对象操作
    this.register({
      name: 'merge',
      reducer: (current: Record<string, unknown>, incoming: Record<string, unknown>) => ({
        ...(typeof current === 'object' && current !== null ? current : {}),
        ...(typeof incoming === 'object' && incoming !== null ? incoming : {}),
      }),
      description: '对象合并',
    });

    // 数字操作
    this.register({
      name: 'max',
      reducer: (current: number, incoming: number) => Math.max(current ?? -Infinity, incoming),
      description: '取最大值',
    });

    this.register({
      name: 'min',
      reducer: (current: number, incoming: number) => Math.min(current ?? Infinity, incoming),
      description: '取最小值',
    });

    this.register({
      name: 'sum',
      reducer: (current: number, incoming: number) => (current ?? 0) + (incoming ?? 0),
      description: '求和',
    });

    this.register({
      name: 'increment',
      reducer: (current: number, _incoming: unknown) => (current ?? 0) + 1,
      description: '递增',
    });

    this.register({
      name: 'decrement',
      reducer: (current: number, _incoming: unknown) => (current ?? 0) - 1,
      description: '递减',
    });

    // 布尔操作
    this.register({
      name: 'toggle',
      reducer: (current: boolean, _incoming: unknown) => !current,
      description: '布尔切换',
    });

    // 字符串操作
    this.register({
      name: 'concat',
      reducer: (current: string, incoming: string) => (current ?? '') + (incoming ?? ''),
      description: '字符串连接',
    });

    // 计数
    this.register({
      name: 'count',
      reducer: (current: number, _incoming: unknown) => (current ?? 0) + 1,
      description: '计数',
    });
  }

  /**
   * 注册 reducer
   */
  register(definition: ReducerDefinition): void {
    this.reducers.set(definition.name, definition);
  }

  /**
   * 获取 reducer
   */
  get(name: string): ReducerFunction | undefined {
    return this.reducers.get(name)?.reducer;
  }

  /**
   * 获取 reducer 定义
   */
  getDefinition(name: string): ReducerDefinition | undefined {
    return this.reducers.get(name);
  }

  /**
   * 检查 reducer 是否存在
   */
  has(name: string): boolean {
    return this.reducers.has(name);
  }

  /**
   * 获取所有 reducer 名称
   */
  getNames(): string[] {
    return Array.from(this.reducers.keys());
  }

  /**
   * 应用 reducer
   */
  apply<T = unknown>(
    reducerName: string,
    currentValue: T,
    incomingValue: T
  ): T {
    const reducer = this.get(reducerName);
    if (!reducer) {
      console.warn(`Reducer not found: ${reducerName}, using replace`);
      return incomingValue;
    }
    return reducer(currentValue, incomingValue) as T;
  }

  /**
   * 应用字段 reducer
   */
  applyFieldReducer(
    fieldName: string,
    currentValue: unknown,
    incomingValue: unknown,
    fieldConfig?: { reducer?: string; default?: unknown }
  ): unknown {
    const reducerName = fieldConfig?.reducer || 'replace';
    const current = currentValue ?? fieldConfig?.default;
    return this.apply(reducerName, current, incomingValue);
  }

  /**
   * 创建自定义 reducer
   */
  createCustomReducer<T>(
    name: string,
    reducer: ReducerFunction<T>,
    description?: string
  ): void {
    this.register({
      name,
      reducer,
      description,
    });
  }

  /**
   * 批量应用 reducers 到状态
   */
  applyToState<T extends Record<string, unknown>>(
    currentState: T,
    incomingState: Partial<T>,
    schema?: Record<string, { reducer?: string; default?: unknown }>
  ): T {
    const result = { ...currentState };

    for (const [key, value] of Object.entries(incomingState)) {
      const fieldConfig = schema?.[key];
      const reducerName = fieldConfig?.reducer || 'replace';
      result[key as keyof T] = this.apply(
        reducerName,
        result[key as keyof T],
        value
      ) as T[keyof T];
    }

    return result;
  }
}

// ============ 便捷函数 ============

/**
 * 获取 reducer 注册表
 */
export function getReducerRegistry(): ReducerRegistry {
  return ReducerRegistry.getInstance();
}

/**
 * 注册自定义 reducer
 */
export function registerReducer(
  name: string,
  reducer: ReducerFunction,
  description?: string
): void {
  ReducerRegistry.getInstance().register({ name, reducer, description });
}

/**
 * 应用 reducer
 */
export function applyReducer<T>(
  name: string,
  current: T,
  incoming: T
): T {
  return ReducerRegistry.getInstance().apply(name, current, incoming);
}