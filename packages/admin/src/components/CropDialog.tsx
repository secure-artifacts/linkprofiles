import { Maximize2, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import {
  CROP_ASPECT,
  cropToFile,
  cropToPreviewUrl,
  loadImage,
  type CropRect,
  type CropSlot,
} from '../media/crop.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Slider } from '../ui/Slider.js';
import { Spinner } from '../ui/Spinner.js';
import { useToast } from '../ui/Toast.js';

interface CropDialogProps {
  file: File | null;
  slot: CropSlot;
  onCancel: () => void;
  onDone: (file: File) => void;
  /** 边调边把当前构图推给右侧那台手机。低清、每帧最多一次。 */
  onPreview?: (dataUrl: string | null) => void;
}

/** 画布短边留出的呼吸空间，让用户看得见裁切框外还有多少图。 */
const VIEWPORT = { width: 420, height: 420 };
const MAX_ZOOM = 4;

/**
 * 裁切编辑器。
 *
 * 图在裁切框底下动：拖动平移、滚轮或滑块缩放，框本身不动。这样「框里看到的
 * 就是最终结果」始终成立，不必再解释框和图谁在动。
 *
 * 缩放下限是「刚好铺满裁切框」，并且平移被夹在不露白的范围内 —— 裁出来的图
 * 一定是满的，公开页那边 `object-fit: cover` 就不会再二次裁一刀。
 */
export function CropDialog({ file, slot, onCancel, onDone, onPreview }: CropDialogProps) {
  const toast = useToast();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);

  const aspect = CROP_ASPECT[slot];

  // 裁切框：按比例塞进固定视口，取能放下的最大尺寸
  const frame = useMemo(() => {
    const width = Math.min(VIEWPORT.width, VIEWPORT.height * aspect);
    return { width, height: width / aspect };
  }, [aspect]);

  useEffect(() => {
    if (!file) {
      setImage(null);
      return;
    }
    const url = URL.createObjectURL(file);
    let cancelled = false;
    loadImage(url)
      .then((loaded) => {
        if (cancelled) return;
        setImage(loaded);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      })
      .catch((err: Error) => {
        if (!cancelled) toast.error(err.message);
      });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // zoom = 1 即「刚好铺满裁切框」，所以基准尺寸取覆盖所需的那一档
  const base = useMemo(() => {
    if (!image) return { width: 0, height: 0 };
    const cover = Math.max(frame.width / image.naturalWidth, frame.height / image.naturalHeight);
    return { width: image.naturalWidth * cover, height: image.naturalHeight * cover };
  }, [image, frame]);

  const clamp = useCallback(
    (next: { x: number; y: number }, atZoom: number) => {
      const limitX = Math.max(0, (base.width * atZoom - frame.width) / 2);
      const limitY = Math.max(0, (base.height * atZoom - frame.height) / 2);
      return {
        x: Math.min(limitX, Math.max(-limitX, next.x)),
        y: Math.min(limitY, Math.max(-limitY, next.y)),
      };
    },
    [base, frame],
  );

  /** 屏幕上的缩放与平移，换算成原图上的归一化裁切区域。 */
  const rectFor = useCallback(
    (atZoom: number, at: { x: number; y: number }): CropRect => {
      const displayWidth = base.width * atZoom;
      const displayHeight = base.height * atZoom;
      return {
        x: ((displayWidth - frame.width) / 2 - at.x) / displayWidth,
        y: ((displayHeight - frame.height) / 2 - at.y) / displayHeight,
        width: frame.width / displayWidth,
        height: frame.height / displayHeight,
      };
    },
    [base, frame],
  );

  // 调用方基本都是内联箭头函数，直接进依赖数组会让 `pushPreview` 每次渲染
  // 都换新引用，下面那个「初次推送」的 effect 就会跟着反复重跑，把 zoom=1
  // 的那一版一直推回去、盖掉用户刚调好的构图。存进 ref 就与渲染解耦了。
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;

  // 每帧最多重画一次。拖拽时 pointermove 的频率远高于屏幕刷新率，
  // 逐个事件都导出一次 canvas 会明显掉帧。
  const frameRef = useRef<number | null>(null);
  const pushPreview = useCallback(
    (atZoom: number, at: { x: number; y: number }) => {
      const notify = onPreviewRef.current;
      if (!notify || !image) return;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        notify(cropToPreviewUrl(image, rectFor(atZoom, at)));
      });
    },
    [image, rectFor],
  );

  // 图一读进来就先推一版，右侧立刻显示的是「当前这一块」而不是旧图
  useEffect(() => {
    if (image) pushPreview(1, { x: 0, y: 0 });
  }, [image, pushPreview]);

  // 关掉时把挂起的那一帧取消掉，别在弹窗已经没了之后再推一版上去
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const applyZoom = (next: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(1, next));
    setZoom(clamped);
    setOffset((prev) => {
      const moved = clamp(prev, clamped);
      pushPreview(clamped, moved);
      return moved;
    });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX - offset.x,
      startY: e.clientY - offset.y,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const moved = clamp({ x: e.clientX - drag.startX, y: e.clientY - drag.startY }, zoom);
    setOffset(moved);
    pushPreview(zoom, moved);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  };

  const submit = async () => {
    if (!image || !file) return;
    setSaving(true);
    try {
      const cropped = await cropToFile(image, rectFor(zoom, offset), file.name);
      onDone(cropped);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => !open && onCancel()}
      title={slot === 'avatar' ? '裁切头像' : slot === 'banner' ? '裁切 Banner 图' : '裁切背景图'}
      width={560}
      footer={
        <>
          <Button variant="default" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!image}
            onClick={() => void submit()}
          >
            使用这一块
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-[var(--radius-control)] bg-fg"
          style={{ width: VIEWPORT.width, height: VIEWPORT.height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={onWheel}
        >
          {image ? (
            <>
              <img
                src={image.src}
                alt=""
                draggable={false}
                className="absolute left-1/2 top-1/2 max-w-none cursor-grab active:cursor-grabbing"
                style={{
                  width: base.width * zoom,
                  height: base.height * zoom,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
              {/*
                遮罩用一圈超粗的半透明边框挖出裁切框，省掉第二个绝对定位层。
                这个洞一定是方角的：超粗边框下内边界的圆角被减到 0 —— 而这里
                正好是想要的，导出的就是方形，圆是公开页用 CSS 裁的。
              */}
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                  border-[9999px] border-fg/60"
                style={{ width: frame.width, height: frame.height }}
              />
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                  rounded-[4px] border-2 border-white/80"
                style={{ width: frame.width, height: frame.height }}
              />
              {/* 头像在页面上是圆的，标出圆外那圈「裁进去了但看不到」的部分 */}
              {slot === 'avatar' ? (
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                    rounded-full border border-dashed border-white/70"
                  style={{ width: frame.width, height: frame.height }}
                />
              ) : null}
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Maximize2 className="size-4 shrink-0 text-muted" />
          <Slider
            value={zoom}
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            onChange={applyZoom}
            aria-label="缩放"
          />
          <span className="w-12 shrink-0 text-right font-mono text-[13px] text-fg">
            {zoom.toFixed(2)}×
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
              pushPreview(1, { x: 0, y: 0 });
            }}
          >
            <RotateCcw className="size-3.5" />
            复位
          </Button>
        </div>

        <p className="text-[12px] text-muted">
          拖动图片调位置，滚轮或滑块缩放。实线框内是裁下来的范围
          {slot === 'avatar' ? '，虚线圆内是它在页面上真正露出来的部分' : ''}。 裁切在浏览器里完成，
          <strong className="font-medium text-fg">原图不会保留</strong>
          ，事后想重裁需要重新上传。
        </p>
      </div>
    </Dialog>
  );
}
