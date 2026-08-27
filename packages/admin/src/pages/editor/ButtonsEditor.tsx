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
import { Alert, Button, Card, Checkbox, Flex, Input, Space, Tooltip, Typography } from 'antd';
import type { ButtonDraft } from '../../api/types.js';
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
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        拖拽调整顺序。勾上「联系类渠道」的按钮在页面上是实心卡片并计入线索，
        其余是描边行。两者可以混排，页面上没有区段标题。
      </Typography.Paragraph>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={buttons.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {buttons.map((button) => (
              <SortableButtonCard
                key={button.id}
                button={button}
                passthroughCaveat={passthroughCaveat}
                onChange={(patch) => update(button.id, patch)}
                onRemove={() => onChange(buttons.filter((b) => b.id !== button.id))}
              />
            ))}
          </Space>
        </SortableContext>
      </DndContext>

      {atLimit ? (
        <Alert type="info" showIcon message={`单页按钮数量上限 ${MAX_BUTTONS_PER_USER} 个`} />
      ) : null}

      <Button
        block
        disabled={atLimit}
        onClick={() =>
          onChange([
            ...buttons,
            {
              id: localId(),
              title: '',
              subtitle: '',
              url: '',
              isLead: false,
              passSource: false,
            },
          ])
        }
      >
        添加按钮
      </Button>
    </Space>
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
    <Card
      ref={setNodeRef}
      size="small"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      title={
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab', userSelect: 'none' }}
          aria-label="拖拽排序"
        >
          ⠿ {button.title || '未命名按钮'}
        </span>
      }
      extra={
        <Button size="small" danger type="text" onClick={onRemove}>
          删除
        </Button>
      }
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
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
        <Flex gap="middle" wrap>
          <Checkbox
            checked={button.isLead}
            onChange={(e) => onChange({ isLead: e.target.checked })}
          >
            联系类渠道（计入线索）
          </Checkbox>
          <Tooltip title={passthroughCaveat}>
            <Checkbox
              checked={button.passSource}
              onChange={(e) => onChange({ passSource: e.target.checked })}
            >
              把来源透传给目标网站
            </Checkbox>
          </Tooltip>
        </Flex>
      </Space>
    </Card>
  );
}
