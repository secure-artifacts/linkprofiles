import {
  IMAGE_MAX_BYTES,
  IMAGE_MAX_EDGE,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_MS,
  mb,
  readMp4Info,
  rejectImage,
} from '@link-profile/shared';
import { AlertCircle, Crop, ImagePlus, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { CropDialog } from '../../components/CropDialog.js';
import type { CropSlot } from '../../media/crop.js';
import { extractFirstFrame } from '../../media/extract-poster.js';
import { Alert } from '../../ui/Alert.js';
import { Button } from '../../ui/Button.js';
import { Slider } from '../../ui/Slider.js';
import { useToast } from '../../ui/Toast.js';
import type { Draft, LiveMedia, PendingMedia } from './draft.js';

interface MediaEditorProps {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  /** 只改 fields 里的字段，同样走函数式更新，见 EditorPage 里的说明 */
  onChangeFields: (patch: Partial<Draft['fields']>) => void;
  /** 裁切弹窗边调边推上来的低清图，交给右侧那台手机。取消时收到 null。 */
  onLiveMedia: (live: LiveMedia) => void;
}

/*
 * 上传之前就摆出来的要求清单。数值全部取自既有常量，不另抄一份 ——
 * 抄一份的下场是限制改了、提示还停在旧数字上，比不写更糟。
 */
const AVATAR_SPECS = [
  `图片：JPG / PNG / WebP / AVIF，不超过 ${mb(IMAGE_MAX_BYTES)}`,
  `裁切成 1:1，最终按长边 ${IMAGE_MAX_EDGE.avatar}px 输出`,
  `或视频：mp4，不超过 ${mb(VIDEO_MAX_BYTES)}、${VIDEO_MAX_DURATION_MS / 1000} 秒，页面上循环播放，默认静音`,
];

const BACKGROUND_SPECS = [
  `JPG / PNG / WebP / AVIF，不超过 ${mb(IMAGE_MAX_BYTES)}`,
  `裁切成 375:812（手机竖屏），最终按长边 ${IMAGE_MAX_EDGE.background}px 输出`,
  '只收图片，不能放视频',
];

/** 待裁切的图片。裁完才进 pending，取消则整个丢弃。 */
interface CropTask {
  file: File;
  slot: CropSlot;
}

/**
 * 头像位与背景图。
 *
 * 拖进来或点选之后先进裁切编辑器，裁好的结果以 blob 地址进预览，
 * **保存时才真正上传** —— 用户在确认满意之前不必先落库。
 *
 * 视频不裁切：服务端本就不转码，抽首帧当封面即可（公开页要先渲染封面，
 * 视频不得成为 LCP 元素）。抽不出来就降级为要求手动上传一张封面图。
 */
export function MediaEditor({ draft, onChange, onChangeFields, onLiveMedia }: MediaEditorProps) {
  const toast = useToast();
  const [extracting, setExtracting] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  // 选中的视频没有音轨。不拦上传：无声视频当头像本身能用，只是那个静音
  // 按钮点了不会有动静，得先说清楚。
  const [silentVideo, setSilentVideo] = useState(false);
  const [cropping, setCropping] = useState<CropTask | null>(null);
  // 本次会话里的原图。裁切结果会顶替原文件上传，重裁若拿裁过的图当输入
  // 就只能越裁越小，所以在浏览器里留一份，刷新后失效是可以接受的。
  const [sources, setSources] = useState<Partial<Record<CropSlot, File>>>({});
  // 裁切弹窗里边调边推过来的低清图。只活在弹窗打开期间，取消就丢掉，
  // 不进 draft —— 它不是待上传的素材，只是让右侧那台手机跟着动。
  const [livePreview, setLivePreview] = useState<string | null>(null);
  // 校验失败的原因就摆在出问题的那一格上。素材区在页面左上、toast 却钉在屏幕
  // 底部中央，隔着大半屏闪 3 秒，用户看不见。toast 保留作兜底。
  const [slotErrors, setSlotErrors] = useState<Partial<Record<CropSlot, string>>>({});

  const failSlot = (slot: CropSlot, message: string) => {
    setSlotErrors((prev) => ({ ...prev, [slot]: message }));
    toast.error(message);
  };

  const clearSlot = (slot: CropSlot) =>
    setSlotErrors((prev) => {
      if (!(slot in prev)) return prev;
      const { [slot]: _cleared, ...rest } = prev;
      return rest;
    });

  const publishLive = (slot: CropSlot | null, dataUrl: string | null) => {
    setLivePreview(dataUrl);
    onLiveMedia(slot && dataUrl ? { [slot]: dataUrl } : {});
  };

  const asPending = (file: File): PendingMedia => ({
    objectUrl: URL.createObjectURL(file),
    file,
  });

  const pickAvatar = async (file: File) => {
    clearSlot('avatar');
    setSilentVideo(false);
    if (file.type.startsWith('video/')) {
      if (file.size > VIDEO_MAX_BYTES) {
        failSlot(
          'avatar',
          `视频不能超过 ${mb(VIDEO_MAX_BYTES)}，这个文件有 ${(file.size / 1024 / 1024).toFixed(1)} MB`,
        );
        return;
      }

      setExtracting(true);
      // 顺手看一眼有没有音轨。读不出来（不是标准 mp4）就当有，不拿一句
      // 猜出来的警告去吓用户 —— 服务端那边照样会拦不合法的文件。
      const info = readMp4Info(new Uint8Array(await file.arrayBuffer()));
      setSilentVideo(info !== null && !info.hasAudio);

      const poster = await extractFirstFrame(file);
      setExtracting(false);
      setPosterFailed(poster === null);

      onChange({
        pendingAvatar: asPending(file),
        pendingAvatarPoster: poster ? asPending(poster) : null,
      });
      return;
    }

    const problem = rejectImage({ mimeType: file.type, bytes: file.size });
    if (problem) {
      failSlot('avatar', problem);
      return;
    }
    setPosterFailed(false);
    setSources((prev) => ({ ...prev, avatar: file }));
    setCropping({ file, slot: 'avatar' });
  };

  const pickBackground = (file: File) => {
    clearSlot('background');
    const problem = rejectImage({ mimeType: file.type, bytes: file.size });
    if (problem) {
      failSlot('background', problem);
      return;
    }
    setSources((prev) => ({ ...prev, background: file }));
    setCropping({ file, slot: 'background' });
  };

  const pickPoster = (file: File) => {
    const problem = rejectImage({ mimeType: file.type, bytes: file.size });
    if (problem) {
      toast.error(problem);
      return;
    }
    setPosterFailed(false);
    onChange({ pendingAvatarPoster: asPending(file) });
  };

  const applyCrop = (cropped: File) => {
    if (!cropping) return;
    if (cropping.slot === 'avatar') {
      onChange({ pendingAvatar: asPending(cropped), pendingAvatarPoster: null });
    } else {
      onChange({ pendingBackground: asPending(cropped) });
    }
    setCropping(null);
    publishLive(null, null);
  };

  /** 已经选好的图还能再调一次构图，不用重新翻文件 */
  const recrop = (slot: CropSlot) => {
    const source = sources[slot];
    if (!source) return;
    setCropping({ file: source, slot });
  };

  const croppingAvatar = cropping?.slot === 'avatar';
  const avatarPreview =
    (croppingAvatar ? livePreview : null) ?? draft.pendingAvatar?.objectUrl ?? draft.savedAvatarUrl;
  const avatarIsVideo = draft.pendingAvatar
    ? draft.pendingAvatar.file.type.startsWith('video/')
    : draft.savedAvatarIsVideo;
  const backgroundPreview =
    (cropping?.slot === 'background' ? livePreview : null) ??
    draft.pendingBackground?.objectUrl ??
    draft.savedBackgroundUrl;
  const hasBackground = Boolean(backgroundPreview);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MediaSlot
          label="头像位"
          hint="拖进来或点选。图片会先进裁切编辑器；也可以放一段带声音的短视频。"
          accept="image/*,video/mp4"
          previewUrl={avatarPreview}
          previewIsVideo={avatarIsVideo}
          shape="circle"
          fileName={croppingAvatar ? '正在调整构图…' : (draft.pendingAvatar?.file.name ?? null)}
          error={slotErrors.avatar ?? null}
          loading={extracting}
          onPick={pickAvatar}
          {...(sources.avatar && draft.pendingAvatar && !avatarIsVideo
            ? { onRecrop: () => recrop('avatar') }
            : {})}
          specs={AVATAR_SPECS}
          {...(silentVideo
            ? { notice: '这段视频没有声音，页面右上角那个静音按钮点了也不会有动静。' }
            : {})}
          onClear={() => {
            clearSlot('avatar');
            setSilentVideo(false);
            onChange({ pendingAvatar: null, pendingAvatarPoster: null, savedAvatarUrl: null });
          }}
        />
        <MediaSlot
          label="背景图"
          hint="拖进来或点选。上传后覆盖主题的背景渐变，条目色与文字色仍然跟着主题走。"
          specs={BACKGROUND_SPECS}
          accept="image/*"
          previewUrl={backgroundPreview}
          previewIsVideo={false}
          shape="portrait"
          fileName={
            cropping?.slot === 'background'
              ? '正在调整构图…'
              : (draft.pendingBackground?.file.name ?? null)
          }
          error={slotErrors.background ?? null}
          onPick={pickBackground}
          {...(sources.background && draft.pendingBackground
            ? { onRecrop: () => recrop('background') }
            : {})}
          onClear={() => {
            clearSlot('background');
            onChange({ pendingBackground: null, savedBackgroundUrl: null });
          }}
        />
      </div>

      {posterFailed ? (
        <Alert
          tone="warning"
          message="没能从这段视频里抽出首帧"
          description={
            <div className="flex flex-col gap-2">
              <span>公开页要先显示封面、视频加载完才播放，所以需要一张封面图。请手动选一张。</span>
              <label className="w-fit">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void pickPoster(file);
                    e.target.value = '';
                  }}
                />
                <span className="inline-flex h-8 cursor-pointer items-center rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[13px] font-medium text-fg hover:bg-surface-hover">
                  选择封面图
                </span>
              </label>
            </div>
          }
        />
      ) : null}

      {hasBackground ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] text-muted">
            遮罩暗度。遮罩只会把图压暗，因此浅色文字的主题压得越深越清楚，深色文字的主题反过来。
          </p>
          <div className="flex items-center gap-3">
            <Slider
              value={Number(draft.fields.backgroundOverlay)}
              onChange={(value) => onChangeFields({ backgroundOverlay: String(value) })}
              aria-label="遮罩暗度"
            />
            <span className="w-10 shrink-0 font-mono text-[13px] text-fg">
              {Math.round(Number(draft.fields.backgroundOverlay) * 100)}%
            </span>
          </div>
        </div>
      ) : null}

      <CropDialog
        file={cropping?.file ?? null}
        slot={cropping?.slot ?? 'avatar'}
        onCancel={() => {
          setCropping(null);
          publishLive(null, null);
        }}
        onPreview={(dataUrl) => publishLive(cropping?.slot ?? null, dataUrl)}
        onDone={applyCrop}
      />
    </div>
  );
}

function MediaSlot({
  label,
  hint,
  accept,
  previewUrl,
  previewIsVideo,
  shape,
  fileName,
  error,
  loading,
  specs,
  notice,
  onPick,
  onRecrop,
  onClear,
}: {
  label: string;
  hint: string;
  /** 素材要求。**常驻显示**：用户要的是上传前就知道，不是传完才在错误里读到。 */
  specs: string[];
  /** 传了但有话要说时的提示，如视频没有音轨。不是错误，不加红边。 */
  notice?: ReactNode;
  accept: string;
  previewUrl: string | null;
  previewIsVideo: boolean;
  shape: 'circle' | 'portrait';
  /** 这一格下面那行字：文件名、「正在调整构图…」，或服务端已有图时的兜底 */
  fileName: string | null;
  /** 这一格上次校验失败的原因。有值时整格加红边并把原因摆出来。 */
  error: string | null;
  loading?: boolean;
  onPick: (file: File) => void | Promise<void>;
  /** 只有本次新选的图能重裁 —— 已保存的那张在服务端只剩裁过的结果 */
  onRecrop?: () => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accepts = (file: File) =>
    accept.split(',').some((pattern) => {
      const trimmed = pattern.trim();
      if (trimmed.endsWith('/*')) return file.type.startsWith(trimmed.slice(0, -1));
      return file.type === trimmed;
    });

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!accepts(file)) return;
    void onPick(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // 拖过子元素会连发 leave，只有真的离开外框才收起高亮
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
      className={`flex flex-col gap-2 rounded-[var(--radius-control)] border p-3 transition-colors
        ${
          error
            ? 'border-danger bg-danger-soft'
            : dragging
              ? 'border-accent bg-accent-soft'
              : previewUrl
                ? 'border-border bg-surface'
                : 'border-dashed border-border bg-bg'
        }`}
    >
      <div className="flex items-center gap-2">
        {dragging ? (
          <Upload className="size-4 text-accent" />
        ) : (
          <ImagePlus className="size-4 text-muted" />
        )}
        <span className="text-[13px] font-medium text-fg">{label}</span>
      </div>

      {error ? (
        <p className="flex items-start gap-1.5 text-[12px] text-danger">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {previewUrl ? (
        <div className="flex items-center gap-3">
          <div
            className={`shrink-0 overflow-hidden border border-border bg-bg
              ${shape === 'circle' ? 'size-14 rounded-full' : 'h-20 w-[38px] rounded-[4px]'}`}
          >
            {previewIsVideo ? (
              <video src={previewUrl} muted className="size-full object-cover" />
            ) : (
              <img src={previewUrl} alt="" className="size-full object-cover" />
            )}
          </div>
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
            {fileName ?? '已上传'}
          </span>
        </div>
      ) : (
        <p className="text-[12px] text-muted">{hint}</p>
      )}

      {notice ? (
        <p className="flex items-start gap-1.5 text-[12px] text-warning-fg">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {notice}
        </p>
      ) : null}

      <ul className="flex flex-col gap-0.5 text-[11.5px] leading-snug text-muted">
        {specs.map((spec) => (
          <li key={spec}>· {spec}</li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPick(file);
            e.target.value = '';
          }}
        />
        <Button
          variant="default"
          size="sm"
          loading={loading}
          onClick={() => inputRef.current?.click()}
        >
          {previewUrl ? '换一个' : '选择文件'}
        </Button>
        {onRecrop ? (
          <Button variant="ghost" size="sm" onClick={onRecrop}>
            <Crop className="size-3.5" />
            重新裁切
          </Button>
        ) : null}
        {previewUrl ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            清空
          </Button>
        ) : null}
      </div>
    </div>
  );
}
