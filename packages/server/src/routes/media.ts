import { randomUUID } from 'node:crypto';
import {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  looksLikeMp4,
  readMp4Info,
  rejectImage,
  rejectVideo,
} from '@link-profile/shared';
import type { ErrorKey } from '@link-profile/i18n';
import { media, profiles } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { storeImage, storeVideo } from '../media/storage.js';
import { resolveProfileAccess } from '../profiles/access.js';
import { fail, forbidden, unauthorized } from '../http/errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 头像位可以放图或视频；Banner 图与背景图只收图片。 */
const SLOTS = ['avatar', 'banner', 'background', 'poster'] as const;
type Slot = (typeof SLOTS)[number];

/**
 * 把个人页 id 解析成可写的目标。
 *
 * 权限仍然落在**账号**上：`resolveProfileAccess` 先反查这个页面的主人，再交给 `loadTargetUser`
 * 走三级角色那一套，不另起规则。id 不合法、页面不存在、越权都收敛成 null。
 */

export async function mediaRoutes(app: FastifyInstance) {
  /**
   * 上传一份媒体。
   *
   * 视频与它的首帧封面在同一次请求里提交：封面由浏览器端用 canvas 从
   * 首帧抽出来（见 admin），抽帧失败则前端要求用户手动选一张图，
   * 服务端这边两种情况收到的都是一个普通的图片字段。
   */
  app.post<{ Params: { id: string } }>('/profiles/:id/media', async (req, reply) => {
    if (!req.currentUser) return unauthorized(reply);
    if (!UUID.test(req.params.id)) return forbidden(reply);

    const target = await resolveProfileAccess(app.db, req.currentUser, req.params.id, 'update');
    if (!target) return forbidden(reply);

    const parts = await collectMultipart(req);
    if ('error' in parts) {
      return fail(reply, 400, parts.error, {
        messageKey: parts.messageKey,
        messageVars: parts.messageVars,
      });
    }

    const slot = parts.slot;
    if (!SLOTS.includes(slot as Slot)) {
      return fail(reply, 400, 'invalid_slot', {
        messageKey: 'media.invalidSlot',
        messageVars: { slot },
      });
    }

    const main = parts.files.get('file');
    if (!main) return fail(reply, 400, 'missing_file', { messageKey: 'media.missingFile' });

    const isVideo = main.mimeType.startsWith('video/');
    if (isVideo && slot !== 'avatar') {
      return fail(reply, 400, 'video_not_allowed', { messageKey: 'media.videoOnlyOnAvatar' });
    }

    if (isVideo) {
      const durationMs = looksLikeMp4(main.data)
        ? (readMp4Info(main.data)?.durationMs ?? null)
        : null;
      const rejection = rejectVideo({
        mimeType: main.mimeType,
        bytes: main.data.byteLength,
        durationMs,
      });
      if (rejection) {
        return fail(reply, 400, `video_${rejection.reason}`, {
          messageKey: rejection.messageKey,
          messageVars: rejection.vars,
        });
      }

      // 封面必须一起交上来：公开页要先渲染封面，视频不得成为 LCP 元素。
      const poster = parts.files.get('poster');
      if (!poster) {
        return fail(reply, 400, 'missing_poster', { messageKey: 'media.posterRequired' });
      }
      const posterProblem = rejectImage({
        mimeType: poster.mimeType,
        bytes: poster.data.byteLength,
      });
      if (posterProblem) {
        return fail(reply, 400, 'invalid_poster', {
          messageKey: posterProblem.messageKey,
          messageVars: posterProblem.vars,
        });
      }

      const videoId = randomUUID();
      const posterId = randomUUID();
      const storedVideo = await storeVideo(Buffer.from(main.data), {
        profileId: target,
        mediaId: videoId,
        durationMs: durationMs!,
      });
      const storedPoster = await storeImage(Buffer.from(poster.data), {
        profileId: target,
        mediaId: posterId,
        usage: 'avatar',
      });

      await app.db.insert(media).values([
        { id: videoId, profileId: target, kind: 'video', ...storedVideo },
        { id: posterId, profileId: target, kind: 'image', ...storedPoster },
      ]);
      await app.db
        .update(profiles)
        .set({ avatarMediaId: videoId, avatarPosterId: posterId, updatedAt: new Date() })
        .where(eq(profiles.id, target));

      return reply.code(201).send({ slot, mediaId: videoId, posterId, durationMs });
    }

    const problem = rejectImage({ mimeType: main.mimeType, bytes: main.data.byteLength });
    if (problem) {
      return fail(reply, 400, 'invalid_image', {
        messageKey: problem.messageKey,
        messageVars: problem.vars,
      });
    }

    const mediaId = randomUUID();
    const stored = await storeImage(Buffer.from(main.data), {
      profileId: target,
      mediaId,
      usage: slot === 'avatar' ? 'avatar' : slot === 'banner' ? 'banner' : 'background',
    });
    await app.db.insert(media).values({ id: mediaId, profileId: target, kind: 'image', ...stored });

    await app.db
      .update(profiles)
      .set({
        ...(slot === 'background'
          ? { backgroundMediaId: mediaId }
          : slot === 'banner'
            ? { bannerMediaId: mediaId }
            : // 头像位换成图片，就把原来的视频封面一起清掉
              { avatarMediaId: mediaId, avatarPosterId: null }),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, target));

    return reply.code(201).send({ slot, mediaId });
  });

  /** 清空某个位置的素材。清空后该区域回到主题渐变填充。 */
  app.delete<{ Params: { id: string; slot: string } }>(
    '/profiles/:id/media/:slot',
    async (req, reply) => {
      if (!req.currentUser) return unauthorized(reply);
      if (!UUID.test(req.params.id)) return forbidden(reply);

      const target = await resolveProfileAccess(app.db, req.currentUser, req.params.id, 'update');
      if (!target) return forbidden(reply);

      if (req.params.slot === 'background') {
        await app.db
          .update(profiles)
          .set({ backgroundMediaId: null, updatedAt: new Date() })
          .where(eq(profiles.id, target));
      } else if (req.params.slot === 'banner') {
        await app.db
          .update(profiles)
          .set({ bannerMediaId: null, updatedAt: new Date() })
          .where(eq(profiles.id, target));
      } else if (req.params.slot === 'avatar') {
        await app.db
          .update(profiles)
          .set({ avatarMediaId: null, avatarPosterId: null, updatedAt: new Date() })
          .where(eq(profiles.id, target));
      } else {
        return fail(reply, 400, 'invalid_slot');
      }

      return reply.code(204).send();
    },
  );
}

interface UploadedFile {
  mimeType: string;
  data: Uint8Array;
}

interface MultipartFields {
  slot: string;
  files: Map<string, UploadedFile>;
}

/** 把 multipart 收成内存里的几段。上限已由插件配置卡住。 */
interface MultipartProblem {
  error: string;
  messageKey: ErrorKey;
  messageVars?: Record<string, unknown>;
}

async function collectMultipart(req: FastifyRequest): Promise<MultipartFields | MultipartProblem> {
  if (!req.isMultipart()) {
    return { error: 'not_multipart', messageKey: 'media.notMultipart' };
  }

  const files = new Map<string, UploadedFile>();
  let slot = 'avatar';

  try {
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        files.set(part.fieldname, {
          mimeType: part.mimetype,
          data: await part.toBuffer(),
        });
      } else if (part.fieldname === 'slot') {
        slot = String(part.value);
      }
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      return {
        error: 'file_too_large',
        messageKey: 'media.fileTooLarge',
        messageVars: {
          imageMb: Math.round(IMAGE_MAX_BYTES / 1024 / 1024),
          videoMb: Math.round(VIDEO_MAX_BYTES / 1024 / 1024),
        },
      };
    }
    throw err;
  }

  return { slot, files };
}
