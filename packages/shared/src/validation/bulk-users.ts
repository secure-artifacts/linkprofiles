import { validateShortName } from './short-name.js';
import { validateAccountName } from './account-name.js';

/**
 * 批量创建用户的行解析。
 *
 * 输入来自 Google Sheet 的复制粘贴，每行四列、制表符分隔：
 *
 *     用户名称	账号	short_name	密码
 *
 * 这里只做**无 I/O 的解析与格式校验**，「账号已存在」这类需要查库的
 * 判断留给调用方逐行处理。行号按原始输入计数（从 1 开始），因此报错
 * 指的就是用户在表格里看到的那一行。
 */

export interface BulkUserInput {
  label: string;
  account: string;
  shortName: string;
  password: string;
}

export type BulkRowError =
  '列数不对，应为四列：用户名称、账号、short_name、密码' | '账号为空' | '密码为空' | string;

export type BulkParsedRow =
  | { line: number; ok: true; value: BulkUserInput }
  | { line: number; ok: false; error: BulkRowError };

const EXPECTED_COLUMNS = 4;

export function parseBulkUserRows(raw: string): BulkParsedRow[] {
  const rows: BulkParsedRow[] = [];

  // \r\n 与 \r 都当换行：从表格复制过来的内容换行符不一定是哪种。
  const lines = raw.split(/\r\n|\r|\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // 整行空白直接跳过，不占行号也不算失败：粘贴时结尾常常多一个换行。
    if (line.trim() === '') return;

    const columns = line.split('\t').map((c) => c.trim());
    if (columns.length !== EXPECTED_COLUMNS) {
      rows.push({
        line: lineNumber,
        ok: false,
        error: '列数不对，应为四列：用户名称、账号、short_name、密码',
      });
      return;
    }

    const [label = '', account = '', shortNameRaw = '', password = ''] = columns;

    if (account === '') {
      rows.push({ line: lineNumber, ok: false, error: '登录用户名为空' });
      return;
    }
    if (password === '') {
      rows.push({ line: lineNumber, ok: false, error: '密码为空' });
      return;
    }

    const accountName = validateAccountName(account);
    if (!accountName.ok) {
      rows.push({ line: lineNumber, ok: false, error: accountName.error });
      return;
    }

    const shortName = validateShortName(shortNameRaw);
    if (!shortName.ok) {
      rows.push({ line: lineNumber, ok: false, error: shortName.error });
      return;
    }

    rows.push({
      line: lineNumber,
      ok: true,
      value: { label, account: accountName.value, shortName: shortName.value, password },
    });
  });

  return rows;
}
