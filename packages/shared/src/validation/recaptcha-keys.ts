/**
 * Google 公开的 reCAPTCHA 测试密钥。
 *
 * 这对密钥对**任何**令牌都返回通过，Google 拿它给开发者本地联调用。留在生产
 * 配置里等于人机验证形同虚设，所以后台要认出它并显眼地警告。
 */
export const GOOGLE_TEST_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
export const GOOGLE_TEST_SECRET_KEY = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';

export function isGoogleTestKey(key: string): boolean {
  return key === GOOGLE_TEST_SITE_KEY || key === GOOGLE_TEST_SECRET_KEY;
}
