import { ButtonList } from '@link-profile/profile-ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CLIENT_SCRIPT } from '../src/render/client-script.js';

function runSmartOpenClick(href: string, platform: string, userAgent: string) {
  let clickHandler: ((event: unknown) => void) | undefined;
  let prevented = false;
  const pageLocation = { href: 'https://example.com/profile', search: '' };
  const fakeDocument = {
    hidden: false,
    querySelector: () => null,
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      if (type === 'click') clickHandler = handler;
    },
    removeEventListener: () => undefined,
  };
  const fakeNavigator = {
    userAgent,
    maxTouchPoints: 0,
    sendBeacon: () => true,
  };
  const fakeWindow = {
    matchMedia: () => ({ matches: true }),
  };
  const execute = new Function(
    'window',
    'document',
    'navigator',
    'location',
    'URL',
    'URLSearchParams',
    'Blob',
    'fetch',
    'setTimeout',
    'clearTimeout',
    'addEventListener',
    'removeEventListener',
    CLIENT_SCRIPT,
  );

  execute(
    fakeWindow,
    fakeDocument,
    fakeNavigator,
    pageLocation,
    URL,
    URLSearchParams,
    Blob,
    () => Promise.resolve(),
    () => 1,
    () => undefined,
    () => undefined,
    () => undefined,
  );

  const anchor = {
    href,
    getAttribute: (name: string) => {
      if (name === 'data-track') return 'button';
      if (name === 'data-track-id') return 'instagram';
      if (name === 'data-smart-open') return platform;
      return null;
    },
  };
  clickHandler?.({
    target: { closest: () => anchor },
    preventDefault: () => {
      prevented = true;
    },
  });

  return { prevented, locationHref: pageLocation.href };
}

test('Instagram 与 WhatsApp 在公开页使用分平台智能唤起并保留 HTTPS 回退', () => {
  const html = renderToStaticMarkup(
    createElement(ButtonList, {
      solidBackground: true,
      buttons: [
        {
          id: 'instagram',
          kind: 'social',
          title: 'Instagram',
          subtitle: '',
          url: 'https://ig.me/m/clarepolly20',
          isLead: false,
          platform: 'instagram',
        },
        {
          id: 'whatsapp',
          kind: 'social',
          title: 'WhatsApp',
          subtitle: '',
          url: 'https://wa.me/64211234567?text=hello',
          isLead: true,
          platform: 'whatsapp',
        },
      ],
    }),
  );

  expect(html).toContain('href="https://ig.me/m/clarepolly20"');
  expect(html).toContain('data-smart-open="instagram"');
  expect(html).toContain('href="https://wa.me/64211234567?text=hello"');
  expect(html).toContain('data-smart-open="whatsapp"');

  expect(CLIENT_SCRIPT).toContain('package=com.instagram.android');
  expect(CLIENT_SCRIPT).toContain('instagram://');
  expect(CLIENT_SCRIPT).toContain('package=com.whatsapp');
  expect(CLIENT_SCRIPT).toContain('S.browser_fallback_url=');
  expect(CLIENT_SCRIPT).not.toMatch(/apps\.apple\.com|play\.google\.com/);
  expect(() => new Function(CLIENT_SCRIPT)).not.toThrow();
});

test('iPhone 上的 Instagram 私信保留 ig.me 入口', () => {
  const result = runSmartOpenClick(
    'https://ig.me/m/wordjoey562',
    'instagram',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  );

  expect(result.prevented).toBe(false);
  expect(result.locationHref).toBe('https://example.com/profile');
});

test('Android 上的 Instagram 私信指定 Instagram 应用并保留 ig.me 目标', () => {
  const result = runSmartOpenClick(
    'https://ig.me/m/wordjoey562',
    'instagram',
    'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
  );

  expect(result.prevented).toBe(true);
  expect(result.locationHref).toContain('intent://ig.me/m/wordjoey562#Intent;scheme=https;');
  expect(result.locationHref).toContain('package=com.instagram.android');
  expect(result.locationHref).toContain(
    'S.browser_fallback_url=https%3A%2F%2Fig.me%2Fm%2Fwordjoey562',
  );
  expect(result.locationHref).not.toContain('direct?username=');
});

test('Instagram 主页仍使用分平台 App 唤起增强', () => {
  const ios = runSmartOpenClick(
    'https://instagram.com/wordjoey562',
    'instagram',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  );
  expect(ios.prevented).toBe(true);
  expect(ios.locationHref).toBe('instagram://user?username=wordjoey562');

  const android = runSmartOpenClick(
    'https://instagram.com/wordjoey562',
    'instagram',
    'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
  );
  expect(android.prevented).toBe(true);
  expect(android.locationHref).toContain('package=com.instagram.android');
});
