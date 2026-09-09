import { useEffect, useRef, useState } from 'react';

/**
 * 挂载 reCAPTCHA v2 复选框，见 ADR-0022。
 *
 * 脚本按需插入而不是打进产物：站点密钥来自服务端设置，注册没配好之前不该
 * 让每个访客都去连一趟 Google。
 */
declare global {
  interface Window {
    grecaptcha?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => number;
      reset: (id?: number) => void;
    };
    onRecaptchaReady?: () => void;
  }
}

const SCRIPT_ID = 'recaptcha-v2';
const SCRIPT_SRC =
  'https://www.google.com/recaptcha/api.js?onload=onRecaptchaReady&render=explicit';

export function useRecaptcha(siteKey: string | null, language: string) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!siteKey || !container.current) return;

    const mount = () => {
      if (!window.grecaptcha || !container.current || widgetId.current !== null) return;
      widgetId.current = window.grecaptcha.render(container.current, {
        sitekey: siteKey,
        hl: language,
        callback: (value: string) => setToken(value),
        // 令牌两分钟就过期，过期与用户取消勾选都要把提交按钮重新锁上
        'expired-callback': () => setToken(null),
        'error-callback': () => setToken(null),
      });
    };

    if (window.grecaptcha) {
      mount();
      return;
    }

    window.onRecaptchaReady = mount;
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, [siteKey, language]);

  /** 注册失败后把勾选清掉：一枚令牌只能用一次，留着也过不了第二回。 */
  const reset = () => {
    setToken(null);
    if (widgetId.current !== null) window.grecaptcha?.reset(widgetId.current);
  };

  return { container, token, reset };
}
