import { validateSocialValue, validateTargetUrl } from '@link-profile/shared';
import type { EntryDraft } from '../../api/types.js';

/**
 * 编辑器里的「这一项现在有问题吗」。
 *
 * 与预览层的丢弃规则严格对应：拼不出地址的社媒条目是被**静默丢掉**的
 * （`draftToProfileView` 里那个 `flatMap` 直接 `return []`），用户只会看到
 * 它没出现、不知道为什么。这里把同一条判断显式化成红边。
 */
export function entryProblem(entry: EntryDraft): string | null {
  if (entry.title.trim() === '') return '标题不能为空';

  if (entry.kind === 'social') {
    const result = validateSocialValue(entry.platform, entry.value);
    return result.ok ? null : (result.error ?? '格式不正确');
  }

  const url = validateTargetUrl(entry.url);
  return url.ok ? null : url.error;
}
