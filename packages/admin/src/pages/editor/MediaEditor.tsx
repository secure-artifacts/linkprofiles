import {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_MS,
  rejectImage,
} from '@link-profile/shared';
import { ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { extractFirstFrame } from '../../media/extract-poster.js';
import { Alert } from '../../ui/Alert.js';
import { Button } from '../../ui/Button.js';
import { Slider } from '../../ui/Slider.js';
import { useToast } from '../../ui/Toast.js';
import type { Draft, PendingMedia } from './draft.js';

interface MediaEditorProps {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  /** 只改 fields 里的字段，同样走函数式更新，见 EditorPage 里的说明 */
  onChangeFields: (patch: Partial<Draft['fields']>) => void;
}

const MB = 1024 * 1024;

/**
 * 头像位与背景图。
 *
 * 选中的文件先以 blob 地址进预览，**保存时才真正上传** —— 用户在确认满意
 * 之前不必先落库。选视频时在这里用 canvas 抽首帧当封面，抽不出来就降级为
 * 要求手动上传一张封面图（公开页要先渲染封面，视频不得成为 LCP 元素）。
 */
export function MediaEditor({ draft, onChange, onChangeFields }: MediaEditorProps) {
  const toast = useToast();
  const [extracting, setExtracting] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  const asPending = (file: File): PendingMedia => ({
    objectUrl: URL.createObjectURL(file),
    file,
  });

  const pickAvatar = async (file: File) => {
    if (file.type.startsWith('video/')) {
      if (file.size > VIDEO_MAX_BYTES) {
        toast.error(
          `视频不能超过 ${VIDEO_MAX_BYTES / MB} MB，这个文件有 ${(file.size / MB).toFixed(1)} MB`,
        );
        return;
      }

      setExtracting(true);
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
      toast.error(problem);
      return;
    }
    setPosterFailed(false);
    onChange({ pendingAvatar: asPending(file), pendingAvatarPoster: null });
  };

  const pickBackground = (file: File) => {
    const problem = rejectImage({ mimeType: file.type, bytes: file.size });
    if (problem) {
      toast.error(problem);
      return;
    }
    onChange({ pendingBackground: asPending(file) });
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

  const avatarName = draft.pendingAvatar?.file.name ?? (draft.savedAvatarUrl ? '已上传' : null);
  const backgroundName =
    draft.pendingBackground?.file.name ?? (draft.savedBackgroundUrl ? '已上传' : null);
  const hasBackground = Boolean(draft.pendingBackground ?? draft.savedBackgroundUrl);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MediaSlot
          label="头像位"
          hint={`图片会自动压缩；也可以放一段短视频（mp4，≤${VIDEO_MAX_BYTES / MB} MB、≤${VIDEO_MAX_DURATION_MS / 1000} 秒），页面上自动循环、静音播放。图片上限 ${IMAGE_MAX_BYTES / MB} MB。`}
          accept="image/*,video/mp4"
          fileName={avatarName}
          loading={extracting}
          onPick={pickAvatar}
          onClear={() =>
            onChange({ pendingAvatar: null, pendingAvatarPoster: null, savedAvatarUrl: null })
          }
        />
        <MediaSlot
          label="背景图"
          hint="上传后覆盖主题的背景渐变，按钮色与文字色仍然跟着主题走。"
          accept="image/*"
          fileName={backgroundName}
          onPick={pickBackground}
          onClear={() => onChange({ pendingBackground: null, savedBackgroundUrl: null })}
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
    </div>
  );
}

function MediaSlot({
  label,
  hint,
  accept,
  fileName,
  loading,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  accept: string;
  fileName: string | null;
  loading?: boolean;
  onPick: (file: File) => void | Promise<void>;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`flex flex-col gap-2 rounded-[var(--radius-control)] border p-3
        ${fileName ? 'border-border bg-surface' : 'border-dashed border-border bg-bg'}`}
    >
      <div className="flex items-center gap-2">
        <ImagePlus className="size-4 text-muted" />
        <span className="text-[13px] font-medium text-fg">{label}</span>
      </div>
      <p className="text-[12px] text-muted">{hint}</p>
      {fileName ? <p className="truncate text-[12px] text-fg">已上传 {fileName}</p> : null}
      <div className="flex gap-2">
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
          {fileName ? '换一个' : '选择图片或视频'}
        </Button>
        {fileName ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            清空
          </Button>
        ) : null}
      </div>
    </div>
  );
}
