/**
 * i18n 国际化支持
 * 
 * 支持中英文切换
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Config } from '../core/types.js';
import { getConfigPath } from '../core/config.js';

// ============ 类型定义 ============

export type LocaleCode = 'zh-CN' | 'en-US';

export interface LocaleData {
  locale: LocaleCode;
  name: string;
  messages: Record<string, Record<string, string>>;
}

// ============ 内置翻译 ============

import zhCN from './locales/zh-CN.json' with { type: 'json' };
import enUS from './locales/en-US.json' with { type: 'json' };

const LOCALES: Record<LocaleCode, LocaleData> = {
  'zh-CN': zhCN as LocaleData,
  'en-US': enUS as LocaleData,
};

// ============ 当前语言 ============

let currentLocale: LocaleCode = 'zh-CN';

/**
 * 设置当前语言
 */
export function setLocale(locale: LocaleCode): void {
  if (LOCALES[locale]) {
    currentLocale = locale;
  } else {
    console.warn(`Unknown locale: ${locale}, falling back to zh-CN`);
    currentLocale = 'zh-CN';
  }
}

/**
 * 获取当前语言
 */
export function getLocale(): LocaleCode {
  return currentLocale;
}

/**
 * 获取所有支持的语言
 */
export function getSupportedLocales(): Array<{ code: LocaleCode; name: string }> {
  return Object.entries(LOCALES).map(([code, data]) => ({
    code: code as LocaleCode,
    name: data.name,
  }));
}

/**
 * 获取语言名称
 */
export function getLocaleName(locale: LocaleCode): string {
  return LOCALES[locale]?.name ?? locale;
}

// ============ 翻译函数 ============

/**
 * 翻译文本
 * @param key - 点分隔的 key，如 "init.title"
 * @param params - 模板参数，如 { count: 5 }
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const localeData = LOCALES[currentLocale];
  if (!localeData) {
    return key;
  }

  // 解析嵌套 key
  const parts = key.split('.');
  let value: unknown = localeData.messages;
  
  for (const part of parts) {
    if (typeof value === 'object' && value !== null && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return key; // 找不到返回 key
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // 替换模板参数 {{param}}
  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, paramKey) => {
      const paramValue = params[paramKey];
      return paramValue !== undefined ? String(paramValue) : `{{${paramKey}}}`;
    });
  }

  return value;
}

/**
 * 从配置加载语言设置
 */
export function loadLocaleFromConfig(config?: Config): void {
  if (config?.language) {
    setLocale(config.language as LocaleCode);
  }
}

/**
 * 保存语言设置到配置
 */
export function saveLocaleToConfig(locale: LocaleCode): void {
  const configPath = getConfigPath();
  
  if (!existsSync(configPath)) {
    return;
  }
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as Config & { language?: LocaleCode };
    config.language = locale;
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.warn('Failed to save locale to config:', error);
  }
}

// ============ 导出 ============

export { LOCALES };