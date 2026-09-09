import { describe, expect, test } from 'vitest';
import {
  DEFAULT_LOCALE,
  isLocale,
  LEGACY_LOCALE,
  negotiateLocale,
  normalizeLocale,
  SUPPORTED_LOCALES,
} from './locales.js';

describe('语言标签白名单', () => {
  test('只认这七个值', () => {
    expect([...SUPPORTED_LOCALES]).toEqual(['en', 'zh-Hans', 'fil', 'es', 'pt-BR', 'id', 'vi']);
  });

  test('兜底是英语，存量回填是简体中文', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LEGACY_LOCALE).toBe('zh-Hans');
  });

  test('isLocale 拒绝白名单外的取值', () => {
    expect(isLocale('fil')).toBe(true);
    expect(isLocale('tl')).toBe(false);
    expect(isLocale('zh-CN')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe('normalizeLocale', () => {
  test('大小写与分隔符不敏感', () => {
    expect(normalizeLocale('ZH-HANS')).toBe('zh-Hans');
    expect(normalizeLocale('pt_br')).toBe('pt-BR');
    expect(normalizeLocale(' en ')).toBe('en');
  });

  test('带地区后缀降级到主语言', () => {
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('fil-PH')).toBe('fil');
    expect(normalizeLocale('es-MX')).toBe('es');
    expect(normalizeLocale('vi-VN')).toBe('vi');
  });

  test('tl 是浏览器常发的他加禄语代码，归到菲律宾语', () => {
    expect(normalizeLocale('tl')).toBe('fil');
    expect(normalizeLocale('tl-PH')).toBe('fil');
  });

  test('中文一律归到简体，葡语一律归到巴西变体', () => {
    expect(normalizeLocale('zh')).toBe('zh-Hans');
    expect(normalizeLocale('zh-CN')).toBe('zh-Hans');
    expect(normalizeLocale('zh-Hans-CN')).toBe('zh-Hans');
    expect(normalizeLocale('pt')).toBe('pt-BR');
    expect(normalizeLocale('pt-PT')).toBe('pt-BR');
  });

  test('不受支持的语言返回 null，由调用方决定怎么兜底', () => {
    expect(normalizeLocale('ja')).toBeNull();
    expect(normalizeLocale('ar')).toBeNull();
    expect(normalizeLocale('')).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
  });
});

describe('negotiateLocale', () => {
  test('命中直接返回', () => {
    expect(negotiateLocale('fil')).toBe('fil');
  });

  test('按 q 权重排序，取权重最高的受支持语言', () => {
    expect(negotiateLocale('ja;q=1.0, fil;q=0.8, en;q=0.5')).toBe('fil');
    expect(negotiateLocale('es;q=0.3, vi;q=0.9')).toBe('vi');
  });

  test('不写 q 的条目权重为 1，且保持书写顺序', () => {
    expect(negotiateLocale('id, es;q=0.9')).toBe('id');
    expect(negotiateLocale('ja, ko, es')).toBe('es');
  });

  test('带地区后缀的条目参与协商', () => {
    expect(negotiateLocale('fil-PH,fil;q=0.9,en;q=0.8')).toBe('fil');
    expect(negotiateLocale('zh-CN,zh;q=0.9')).toBe('zh-Hans');
  });

  test('通配符不当作任何具体语言', () => {
    expect(negotiateLocale('*')).toBe('en');
  });

  test('完全不支持、缺失或畸形时回落英语', () => {
    expect(negotiateLocale('ja,ko')).toBe('en');
    expect(negotiateLocale('')).toBe('en');
    expect(negotiateLocale(undefined)).toBe('en');
    expect(negotiateLocale('=;;q=')).toBe('en');
  });

  test('权重非法的条目被丢弃，而不是让整个头失效', () => {
    expect(negotiateLocale('fil;q=abc, es')).toBe('es');
  });
});
