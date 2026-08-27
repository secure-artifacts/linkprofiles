import type { FastifyInstance } from 'fastify';
import { aggregateAndPrune } from './retention.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 定时把超期明细聚合进日汇总。
 *
 * 用进程内定时器而不是 cron 容器：任务本身可重复执行且幂等，多跑一次
 * 没有代价，因此不值得为它多一个部署单元。启动时先跑一次，之后每天一次。
 *
 * 返回一个停止函数，测试与优雅关停用。
 */
export function scheduleRetention(app: FastifyInstance, intervalMs = DAY_MS): () => void {
  let running = false;

  const tick = async () => {
    // 上一轮还没跑完就跳过这一轮，不叠加
    if (running) return;
    running = true;
    try {
      const result = await aggregateAndPrune(app.sql);
      if (result.buckets > 0 || result.deletedPageViews > 0 || result.deletedClicks > 0) {
        app.log.info({ retention: result }, '埋点明细聚合完成');
      }
    } catch (err) {
      app.log.error({ err }, '埋点明细聚合失败');
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
