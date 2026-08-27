import {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_MS,
  rejectImage,
} from '@link-profile/shared';
import { Alert, Button, Flex, Slider, Space, Typography, Upload, message } from 'antd';
import type { UploadFile } from 'antd';
import { useState } from 'react';
import { extractFirstFrame } from '../../media/extract-poster.js';
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
  const [extracting, setExtracting] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  const asPending = (file: File): PendingMedia => ({
    objectUrl: URL.createObjectURL(file),
    file,
  });

  const pickAvatar = async (file: File) => {
    if (file.type.startsWith('video/')) {
      if (file.size > VIDEO_MAX_BYTES) {
        message.error(
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
      message.error(problem);
      return;
    }
    setPosterFailed(false);
    onChange({ pendingAvatar: asPending(file), pendingAvatarPoster: null });
  };

  const pickBackground = (file: File) => {
    const problem = rejectImage({ mimeType: file.type, bytes: file.size });
    if (problem) {
      message.error(problem);
      return;
    }
    onChange({ pendingBackground: asPending(file) });
  };

  const pickPoster = (file: File) => {
    const problem = rejectImage({ mimeType: file.type, bytes: file.size });
    if (problem) {
      message.error(problem);
      return;
    }
    setPosterFailed(false);
    onChange({ pendingAvatarPoster: asPending(file) });
  };

  const hasAvatar = Boolean(draft.pendingAvatar ?? draft.savedAvatarUrl);
  const hasBackground = Boolean(draft.pendingBackground ?? draft.savedBackgroundUrl);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Typography.Text strong>头像位</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          图片会自动压缩；也可以放一段短视频（mp4，≤{VIDEO_MAX_BYTES / MB} MB、≤
          {VIDEO_MAX_DURATION_MS / 1000} 秒），页面上自动循环、静音播放。 图片上限{' '}
          {IMAGE_MAX_BYTES / MB} MB。
        </Typography.Text>
        <Flex gap="small" wrap>
          <PickButton accept="image/*,video/mp4" onPick={pickAvatar} loading={extracting}>
            {hasAvatar ? '换一个' : '选择图片或视频'}
          </PickButton>
          {hasAvatar ? (
            <Button
              onClick={() =>
                onChange({
                  pendingAvatar: null,
                  pendingAvatarPoster: null,
                  savedAvatarUrl: null,
                })
              }
            >
              清空
            </Button>
          ) : null}
        </Flex>

        {posterFailed ? (
          <Alert
            type="warning"
            showIcon
            message="没能从这段视频里抽出首帧"
            description={
              <Space direction="vertical" size="small">
                <span>
                  公开页要先显示封面、视频加载完才播放，所以需要一张封面图。请手动选一张。
                </span>
                <PickButton accept="image/*" onPick={pickPoster}>
                  选择封面图
                </PickButton>
              </Space>
            }
          />
        ) : null}
      </Space>

      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Typography.Text strong>背景图</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          上传后覆盖主题的背景渐变，按钮色与文字色仍然跟着主题走。
        </Typography.Text>
        <Flex gap="small" wrap>
          <PickButton accept="image/*" onPick={pickBackground}>
            {hasBackground ? '换一张' : '选择背景图'}
          </PickButton>
          {hasBackground ? (
            <Button onClick={() => onChange({ pendingBackground: null, savedBackgroundUrl: null })}>
              清空
            </Button>
          ) : null}
        </Flex>

        {hasBackground ? (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              遮罩暗度。遮罩只会把图压暗，因此浅色文字的主题压得越深越清楚， 深色文字的主题反过来。
            </Typography.Text>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={Number(draft.fields.backgroundOverlay)}
              onChange={(value) => onChangeFields({ backgroundOverlay: String(value) })}
              tooltip={{ formatter: (value) => `${Math.round((value ?? 0) * 100)}%` }}
            />
          </Space>
        ) : null}
      </Space>
    </Space>
  );
}

interface PickButtonProps {
  accept: string;
  loading?: boolean;
  onPick: (file: File) => void | Promise<void>;
  children: React.ReactNode;
}

/** antd 的 Upload 只借来做文件选择，真正的上传发生在保存时。 */
function PickButton({ accept, loading, onPick, children }: PickButtonProps) {
  return (
    <Upload
      accept={accept}
      showUploadList={false}
      fileList={[] as UploadFile[]}
      beforeUpload={(file) => {
        void onPick(file as unknown as File);
        return false;
      }}
    >
      <Button loading={loading}>{children}</Button>
    </Upload>
  );
}
