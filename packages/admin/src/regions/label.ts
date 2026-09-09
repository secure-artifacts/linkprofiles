import { UNASSIGNED_REGION_ID } from '@link-profile/shared/schema';
import { translateAdmin } from '../i18n/runtime.js';

/**
 * 区域名一般是管理员自己起的，原样显示。
 *
 * 只有「未分配」是系统建的固定一行，名字存在库里但属于界面文案，
 * 按当前界面语言换掉，否则七种语言的用户都会看到中文。
 */
export function regionLabel(id: string, name: string): string {
  return id === UNASSIGNED_REGION_ID ? translateAdmin('regions.unassigned') : name;
}
