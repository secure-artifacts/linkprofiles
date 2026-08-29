import { describe, expect, test } from 'vitest';
import { parseBulkUserRows } from './bulk-users.js';

const row = (label: string, account: string, shortName: string, password: string) =>
  [label, account, shortName, password].join('\t');

describe('parseBulkUserRows', () => {
  test('解析出四列并压平 short_name 的大小写与空白', () => {
    const parsed = parseBulkUserRows(row('张三', ' zhangsan ', ' ZhangSan ', 'pass-1234'));

    expect(parsed).toEqual([
      {
        line: 1,
        ok: true,
        value: {
          label: '张三',
          account: 'zhangsan',
          shortName: 'zhangsan',
          password: 'pass-1234',
        },
      },
    ]);
  });

  test('行号按原始输入计数，失败行不影响其余行', () => {
    const input = [
      row('张三', 'zhangsan', 'zhangsan', 'pass-1234'),
      row('李四', '', 'lisi', 'pass-1234'),
      row('王五', 'wangwu', 'wangwu', 'pass-1234'),
    ].join('\n');

    const parsed = parseBulkUserRows(input);

    expect(parsed.map((r) => [r.line, r.ok])).toEqual([
      [1, true],
      [2, false],
      [3, true],
    ]);
  });

  test('列数不对给出专门的提示', () => {
    const parsed = parseBulkUserRows(['张三\tzhangsan\tzhangsan', '多\t了\t一\t列\t哦'].join('\n'));

    expect(parsed).toEqual([
      { line: 1, ok: false, error: '列数不对，应为四列：用户名称、账号、short_name、密码' },
      { line: 2, ok: false, error: '列数不对，应为四列：用户名称、账号、short_name、密码' },
    ]);
  });

  test('账号为空与密码为空分别报错', () => {
    const parsed = parseBulkUserRows(
      [row('张三', '', 'zhangsan', 'pass-1234'), row('李四', 'lisi', 'lisi', '')].join('\n'),
    );

    expect(parsed).toEqual([
      { line: 1, ok: false, error: '登录用户名为空' },
      { line: 2, ok: false, error: '密码为空' },
    ]);
  });

  test('非法 short_name 带出具体原因', () => {
    const parsed = parseBulkUserRows(row('张三', 'zhangsan', 'ab', 'pass-1234'));

    expect(parsed[0]).toMatchObject({ line: 1, ok: false });
    expect((parsed[0] as { error: string }).error).toContain('3–30');
  });

  test('用户名称可以为空，它只是后台备注', () => {
    const parsed = parseBulkUserRows(row('', 'zhangsan', 'zhangsan', 'pass-1234'));

    expect(parsed[0]).toMatchObject({ ok: true });
  });

  test('空行被跳过，不占结果也不算失败', () => {
    const input = ['', row('张三', 'zhangsan', 'zhangsan', 'pass-1234'), '   ', ''].join('\n');

    const parsed = parseBulkUserRows(input);

    expect(parsed).toHaveLength(1);
    // 行号仍然是它在原始输入里的位置
    expect(parsed[0]?.line).toBe(2);
  });

  test('\\r\\n 与 \\r 都当换行', () => {
    const line = row('张三', 'zhangsan', 'zhangsan', 'pass-1234');
    const other = row('李四', 'lisi', 'lisi', 'pass-1234');

    expect(parseBulkUserRows([line, other].join('\r\n'))).toHaveLength(2);
    expect(parseBulkUserRows([line, other].join('\r'))).toHaveLength(2);
  });

  test('全空输入得到空结果', () => {
    expect(parseBulkUserRows('')).toEqual([]);
    expect(parseBulkUserRows('\n\n  \n')).toEqual([]);
  });

  test('后台备注与密码里的空格保留，登录用户名遵守统一格式', () => {
    const parsed = parseBulkUserRows(row('张 三', 'zhang-san', 'zhangsan', 'pa ss word'));

    expect(parsed[0]).toMatchObject({
      ok: true,
      value: { label: '张 三', account: 'zhang-san', password: 'pa ss word' },
    });
    expect(parseBulkUserRows(row('张三', 'zhang san', 'zhangsan', 'pass-1234'))[0]).toMatchObject({
      ok: false,
    });
  });
});
