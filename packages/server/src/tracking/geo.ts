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

export type GeoLookup = (ip: string | null) => Promise<GeoResult>;

const EMPTY: GeoResult = { country: null, city: null };

export const noGeoLookup: GeoLookup = async () => EMPTY;

/**
 * 建一个查库的解析器。库打不开就退化成「不解析」，启动不受影响。
 * 库文件在进程生命周期内只打开一次。
 */
export function createGeoLookup(dbPath = process.env.GEOLITE2_CITY_PATH): GeoLookup {
  if (!dbPath) return noGeoLookup;

  let reader: Promise<Reader<CityResponse> | null> | null = null;

  return async (ip) => {
    if (!ip) return EMPTY;

    reader ??= open<CityResponse>(dbPath).catch(() => null);
    const db = await reader;
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
}
