import argon2 from 'argon2';

/** 密码一律 argon2 哈希入库，任何响应都不回传哈希。 */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // 哈希格式不对（例如测试夹具塞的占位串）算校验失败，不往上抛。
    return false;
  }
}
