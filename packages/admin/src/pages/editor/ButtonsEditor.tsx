import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MAX_BUTTONS_PER_USER } from '@link-profile/shared';
import { GripVertical, X } from 'lucide-react';
import type { ButtonDraft } from '../../api/types.js';
import { Alert } from '../../ui/Alert.js';
import { Button } from '../../ui/Button.js';
import { Input } from '../../ui/Input.js';
import { Switch } from '../../ui/Switch.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { localId } from './draft.js';

interface ButtonsEditorProps {
  buttons: ButtonDraft[];
  onChange: (buttons: ButtonDraft[]) => void;
  passthroughCaveat: string;
}

/**
 * 按钮列表。
 *
 * **不分组**：联系类与内容类共处同一个可自由排序的列表，页面上没有区段标题。
 * 两者的视觉差异只由「联系类渠道」这个勾决定 —— 分级靠样式，不靠位置。
 */
export function ButtonsEditor({ buttons, onChange, passthroughCaveat }: ButtonsEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = buttons.findIndex((b) => b.id === active.id);
    const to = buttons.findIndex((b) => b.id === over.id);
    onChange(arrayMove(buttons, from, to));
  };

  const update = (id: string, patch: Partial<ButtonDraft>) =>
    onChange(buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const atLimit = buttons.length >= MAX_BUTTONS_PER_USER;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-muted">
        拖拽调整顺序。勾上「联系类渠道」的按钮在页面上是实心卡片并计入线索，
        其余是描边行。两者可以混排，页面上没有区段标题。
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={buttons.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2.5">
            {buttons.map((button) => (
              <SortableButtonCard
                key={button.id}
                button={button}
                passthroughCaveat={passthroughCaveat}
                onChange={(patch) => update(button.id, patch)}
                onRemove={() => onChange(buttons.filter((b) => b.id !== button.id))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {atLimit ? (
        <Alert tone="info" message={`单页按钮数量上限 ${MAX_BUTTONS_PER_USER} 个`} />
      ) : null}

      <Button
        variant="default"
        disabled={atLimit}
        className="w-full"
        onClick={() =>
          onChange([
            ...buttons,
            { id: localId(), title: '', subtitle: '', url: '', isLead: false, passSource: false },
          ])
        }
      >
        添加按钮
      </Button>
    </div>
  );
}

interface SortableButtonCardProps {
  button: ButtonDraft;
  passthroughCaveat: string;
  onChange: (patch: Partial<ButtonDraft>) => void;
  onRemove: () => void;
}

function SortableButtonCard({
  button,
  passthroughCaveat,
  onChange,
  onRemove,
}: SortableButtonCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: button.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="rounded-[var(--radius-panel)] border border-border bg-bg p-3"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="拖拽排序"
          className="flex cursor-grab items-center gap-1.5 rounded-[4px] px-1 py-0.5 text-[13px] font-medium
            text-fg hover:bg-surface-hover active:cursor-grabbing"
        >
          <GripVertical className="size-4 text-muted" />
          {button.title || '未命名按钮'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="删除这个按钮"
          className="flex size-6 items-center justify-center rounded-[4px] text-danger hover:bg-danger-soft"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <Input
          value={button.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="按钮文字，如「WhatsApp 上给我留言」"
          maxLength={80}
        />
        {/* 描边行只有一行标题，填了也不会显示，所以非联系类干脆不给这个框 */}
        {button.isLead ? (
          <Input
            value={button.subtitle}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            placeholder="副标题（选填），如「通常当天回复」。留空则不显示这一行"
            maxLength={80}
          />
        ) : null}
        <Input
          value={button.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="目标链接"
        />
        <div className="mt-1 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[13px] text-fg">
            <Switch
              checked={button.isLead}
              onChange={(checked) => onChange({ isLead: checked })}
              aria-label="联系类渠道（计入线索）"
            />
            联系类渠道（计入线索）
          </label>
          <Tooltip content={passthroughCaveat}>
            <label className="flex items-center gap-2 text-[13px] text-fg">
              <Switch
                checked={button.passSource}
                onChange={(checked) => onChange({ passSource: checked })}
                aria-label="把来源透传给目标网站"
              />
              把来源透传给目标网站
            </label>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
