import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createGeoLookup, GEO_RETRY_MS } from '../src/tracking/geo.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/geoip-city-test.mmdb', import.meta.url));
const LONDON_IP = '81.2.69.142';
const EMPTY = { country: null, city: null };

let dir: string;

function fakeLog() {
  return { info: vi.fn(), warn: vi.fn() };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'geo-'));
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

test('没配地域库路径时一创建就警告，查询一律为空', async () => {
  const log = fakeLog();
  const geo = createGeoLookup('', log);

  expect(log.warn).toHaveBeenCalledTimes(1);
  expect(await geo(LONDON_IP)).toEqual(EMPTY);
});

test('库文件读不到时警告里带上路径', async () => {
  const log = fakeLog();
  const path = join(dir, 'missing.mmdb');
  const geo = createGeoLookup(path, log);

  expect(await geo(LONDON_IP)).toEqual(EMPTY);
  expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ path }), expect.any(String));
});

test('库文件能读时记一条加载成功，查询有结果', async () => {
  const log = fakeLog();
  const geo = createGeoLookup(FIXTURE, log);

  expect(await geo(LONDON_IP)).toEqual({ country: 'GB', city: 'London' });
  expect(log.info).toHaveBeenCalledWith(
    expect.objectContaining({ path: FIXTURE }),
    expect.any(String),
  );
  expect(log.warn).not.toHaveBeenCalled();
});

test('启动时缺库、之后补上，过了重试间隔就能查到，不用重启进程', async () => {
  const log = fakeLog();
  const path = join(dir, 'city.mmdb');
  const geo = createGeoLookup(path, log);
  expect(await geo(LONDON_IP)).toEqual(EMPTY);

  copyFileSync(FIXTURE, path);
  expect(await geo(LONDON_IP)).toEqual(EMPTY);

  vi.setSystemTime(Date.now() + GEO_RETRY_MS);
  expect(await geo(LONDON_IP)).toEqual({ country: 'GB', city: 'London' });
  expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ path }), expect.any(String));
});

test('地域库状态区分没配置、读不到与已加载', async () => {
  expect(await createGeoLookup('', fakeLog()).status?.()).toEqual({ state: 'unconfigured' });

  const path = join(dir, 'city.mmdb');
  const geo = createGeoLookup(path, fakeLog());
  expect(await geo.status?.()).toMatchObject({ state: 'unavailable', path });

  copyFileSync(FIXTURE, path);
  vi.setSystemTime(Date.now() + GEO_RETRY_MS);
  expect(await geo.status?.()).toMatchObject({ state: 'loaded', path, type: 'GeoIP2-City' });
});

test('一直读不到时同样的错误只警告一次，不随重试刷屏', async () => {
  const log = fakeLog();
  const geo = createGeoLookup(join(dir, 'missing.mmdb'), log);

  for (let round = 0; round < 3; round += 1) {
    expect(await geo(LONDON_IP)).toEqual(EMPTY);
    vi.setSystemTime(Date.now() + GEO_RETRY_MS);
  }

  expect(log.warn).toHaveBeenCalledTimes(1);
});
