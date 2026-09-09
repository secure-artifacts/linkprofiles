/**
 * 排序用的字符串比较。
 *
 * 固定按码位比较而不是跟界面语言走：并列时的先后顺序若因人而异，两个语言
 * 不同的管理员看同一份排行会得到不同的顺序，对账时说不清是谁记错了。
 */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
