import { open, type CityResponse, type Reader } from 'maxmind';

/**
 * 用 GeoLite2-City 离线库把 IP 解析成国家与城市。
 *
 * 库文件不随仓库分发（MaxMind 要求各自申请 license key 后下载），
 * 因此 `GEOLITE2_CITY_PATH` 没配、或文件不存在时，地域维度一律为 null，
 * 其余埋点照常写入 —— 少一个维度好过整条记录丢掉。
 *
 * 传进来的是**完整 IP**。调用方查完立刻截断，见 visitor.ts。
 */

export interface GeoResult {
  country: string | null;
  city: string | null;
}

export type GeoStatus =
  | { state: 'loaded'; path: string; type: string; builtAt: string }
  | { state: 'unavailable'; path: string; error: string | null }
  | { state: 'unconfigured' };

export interface GeoLookup {
  (ip: string | null): Promise<GeoResult>;
  /** 测试注入的假解析器可以不带，调用方视为可用。 */
  status?: () => Promise<GeoStatus>;
}

export interface GeoLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

const EMPTY: GeoResult = { country: null, city: null };

export const GEO_RETRY_MS = 60_000;

export const noGeoLookup: GeoLookup = Object.assign(async () => EMPTY, {
  status: async (): Promise<GeoStatus> => ({ state: 'unconfigured' }),
});

/**
 * 库打不开不影响启动，隔 `GEO_RETRY_MS` 重试：先起容器、后放库文件时，缓存住失败结果
 * 会让此后每条记录都没有地域，日志里也看不出来。加载成功后不再重读，换库仍要重启。
 */
export function createGeoLookup(
  dbPath = process.env.GEOLITE2_CITY_PATH,
  log?: GeoLogger,
): GeoLookup {
  if (!dbPath) {
    log?.warn({}, '未设置 GEOLITE2_CITY_PATH，国家和城市不会记录');
    return noGeoLookup;
  }

  let reader: Promise<Reader<CityResponse> | null>;
  let failedAt: number | null = null;
  let lastError: string | null = null;

  const load = () => {
    failedAt = null;
    reader = open<CityResponse>(dbPath).then(
      (db) => {
        lastError = null;
        log?.info(
          { path: dbPath, type: db.metadata.databaseType, builtAt: db.metadata.buildEpoch },
          '地域库已加载',
        );
        return db;
      },
      (err: unknown) => {
        failedAt = Date.now();
        const message = err instanceof Error ? err.message : String(err);
        if (message !== lastError) {
          log?.warn(
            { path: dbPath, err },
            `地域库打不开，国家和城市不会记录，每 ${GEO_RETRY_MS / 1000} 秒重试`,
          );
        }
        lastError = message;
        return null;
      },
    );
  };
  load();

  const current = () => {
    if (failedAt !== null && Date.now() - failedAt >= GEO_RETRY_MS) load();
    return reader;
  };

  const lookup: GeoLookup = async (ip) => {
    if (!ip) return EMPTY;

    const db = await current();
    if (!db) return EMPTY;

    try {
      const result = db.get(ip);
      if (!result) return EMPTY;
      return {
        country: result.country?.iso_code ?? null,
        // 城市名取英文：后台图表要能跟投放平台的口径对上
        city: result.city?.names?.en ?? null,
      };
    } catch {
      return EMPTY;
    }
  };

  lookup.status = async () => {
    const db = await current();
    return db
      ? {
          state: 'loaded',
          path: dbPath,
          type: db.metadata.databaseType,
          builtAt: db.metadata.buildEpoch.toISOString(),
        }
      : { state: 'unavailable', path: dbPath, error: lastError };
  };

  return lookup;
}
