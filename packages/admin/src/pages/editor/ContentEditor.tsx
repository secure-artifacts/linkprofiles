import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MAX_BUTTONS_PER_PROFILE } from '@link-profile/shared';
import { AlertCircle, GripVertical, Info, Link2, Plus, Settings2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { EntryDraft, SocialPlatformInfo } from '../../api/types.js';
import { Alert } from '../../ui/Alert.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { Input } from '../../ui/Input.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { localId } from './draft.js';
import { entryProblem } from './validation.js';

interface ContentEditorProps {
  platforms: SocialPlatformInfo[];
  entries: EntryDraft[];
  onChange: (entries: EntryDraft[]) => void;
  passthroughCaveat: string;
  /** 下面两个是整页统一的视觉开关，不属于任何一条条目 */
  solidBackground: boolean;
  iconPlate: boolean;
  onChangeStyle: (patch: { solidBackground?: boolean; iconPlate?: boolean }) => void;
}

const LEAD_HELP =
  '勾上后，访客点这一条会额外记一次线索。分析页的线索数与来源排名只统计勾了的条目。' +
  'WhatsApp、Messenger、邮箱这类能直接对上话的默认勾上；Instagram、YouTube 这类看内容的默认不勾。';

const SOLID_HELP =
  '开启后所有条目都是实心卡片，关闭则都是描边行。整页统一，不逐条配——想让某一条更显眼，靠把它排在前面。';

const PLATE_HELP =
  '条目左侧品牌图形背后那枚白色衬底。关掉后图形直接压在卡片或页面底色上；' +
  'X、Threads、TikTok 的图形是纯黑的，在深色主题下会很难辨认。';

/** 从待选面板拖出来的东西，id 加前缀与列表里的条目区分开。 */
const PALETTE_PREFIX = 'palette:';
const CUSTOM_LINK_ID = `${PALETTE_PREFIX}custom-link`;

/** 只有一个投放区了 —— 链接与社媒入口现在是同一种条目，共用一套顺序。 */
const DROP_LIST = 'drop:entries';

/**
 * 条目编排台。
 *
 * 左边是已经放上去的东西（可拖拽排序、逐项展开配置），右边是待选面板
 * （社媒平台 + 自定义链接），从右拖到左即添加。
 *
 * 链接与社媒入口共处**同一个列表**：它们在公开页渲染成同一种卡片，
 * 顺序也共用一套 position，没有理由在编辑器里分开摆。
 */
export function ContentEditor({
  platforms,
  entries,
  onChange,
  passthroughCaveat,
  solidBackground,
  iconPlate,
  onChangeStyle,
}: ContentEditorProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const usedPlatforms = new Set(entries.filter((e) => e.kind === 'social').map((e) => e.platform));
  const linkCount = entries.filter((e) => e.kind === 'link').length;
  const atLinkLimit = linkCount >= MAX_BUTTONS_PER_PROFILE;

  const platformOf = (id: string) => platforms.find((p) => p.id === id);

  const addPlatform = (platformId: string) => {
    const platform = platformOf(platformId);
    if (!platform || usedPlatforms.has(platformId)) return;
    const entry: EntryDraft = {
      id: localId(),
      kind: 'social',
      // 标题预填平台名，用户可以改成「WhatsApp 上给我留言」这类更具体的说法
      title: platform.label,
      subtitle: '',
      url: '',
      platform: platform.id,
      value: '',
      isLead: platform.defaultIsLead,
      passSource: false,
    };
    onChange([...entries, entry]);
    setExpanded(entry.id);
  };

  const addLink = () => {
    if (atLinkLimit) return;
    const entry: EntryDraft = {
      id: localId(),
      kind: 'link',
      title: '',
      subtitle: '',
      url: '',
      platform: '',
      value: '',
      isLead: false,
      passSource: false,
    };
    onChange([...entries, entry]);
    setExpanded(entry.id);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith(PALETTE_PREFIX)) {
      // 拖到列表区或拖到任意一条上都算添加
      if (overId !== DROP_LIST && !entries.some((e) => e.id === overId)) return;
      if (activeId === CUSTOM_LINK_ID) addLink();
      else addPlatform(activeId.slice(PALETTE_PREFIX.length));
      return;
    }

    if (activeId === overId) return;
    const from = entries.findIndex((e) => e.id === activeId);
    const to = entries.findIndex((e) => e.id === overId);
    if (from >= 0 && to >= 0) onChange(arrayMove(entries, from, to));
  };

  const update = (id: string, patch: Partial<EntryDraft>) =>
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const invalidCount = entries.filter((e) => entryProblem(e)).length;

  const labelOf = (entry: EntryDraft) =>
    entry.title ||
    (entry.kind === 'social' ? (platformOf(entry.platform)?.label ?? '社媒') : '未命名');

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e: DragStartEvent) => setDragging(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex flex-col gap-3">
        {invalidCount > 0 ? (
          <Alert
            tone="warning"
            message={`有 ${invalidCount} 项还填不完整`}
            description="点齿轮展开补齐。填好之前，社媒条目不会出现在公开页上，链接则会让整次保存被拒。"
          />
        ) : null}

        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-control)]
            border border-border bg-bg px-3 py-2.5"
        >
          <span className="text-[13px] font-medium text-muted">整页统一</span>
          <HelpToggle
            checked={solidBackground}
            onChange={(checked) => onChangeStyle({ solidBackground: checked })}
            label="实心背景"
            help={SOLID_HELP}
          />
          <HelpToggle
            checked={iconPlate}
            onChange={(checked) => onChangeStyle({ iconPlate: checked })}
            label="图标白底"
            help={PLATE_HELP}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <DropList
            id={DROP_LIST}
            hint="链接与社媒入口共处一个列表，页面上按这个顺序从上往下排。"
            empty="从右边拖一项进来"
            items={entries.map((e) => e.id)}
          >
            {entries.map((entry) => (
              <SortableCard
                key={entry.id}
                id={entry.id}
                title={labelOf(entry)}
                {...(entry.kind === 'social'
                  ? { accentHex: platformOf(entry.platform)?.brandHex }
                  : {})}
                isLink={entry.kind === 'link'}
                problem={entryProblem(entry)}
                expanded={expanded === entry.id}
                onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
                onRemove={() => onChange(entries.filter((e) => e.id !== entry.id))}
              >
                <EntryFields
                  entry={entry}
                  {...(entry.kind === 'social' && platformOf(entry.platform)
                    ? { platform: platformOf(entry.platform)! }
                    : {})}
                  passthroughCaveat={passthroughCaveat}
                  onChange={(patch) => update(entry.id, patch)}
                />
              </SortableCard>
            ))}
          </DropList>

          <Palette
            platforms={platforms}
            usedPlatforms={usedPlatforms}
            atLinkLimit={atLinkLimit}
            onAddPlatform={addPlatform}
            onAddLink={addLink}
          />
        </div>

        {atLinkLimit ? (
          <Alert tone="info" message={`自定义链接数量上限 ${MAX_BUTTONS_PER_PROFILE} 个`} />
        ) : null}
      </div>

      <DragOverlay>
        {dragging ? (
          <div
            className="rounded-[var(--radius-control)] border border-accent bg-surface px-3 py-2
              text-[13px] font-medium text-fg shadow-[var(--shadow-float)]"
          >
            {dragging === CUSTOM_LINK_ID
              ? '自定义链接'
              : dragging.startsWith(PALETTE_PREFIX)
                ? (platformOf(dragging.slice(PALETTE_PREFIX.length))?.label ?? '')
                : (() => {
                    const entry = entries.find((e) => e.id === dragging);
                    return entry ? labelOf(entry) : '';
                  })()}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * 勾选框 + 一枚可见的 ⓘ。
 *
 * ⓘ 本身就是「这里有话说」的提示 —— 之前把整个 label 包进 Tooltip，
 * 悬浮才出文案，用户根本不知道有东西可看。
 */
function HelpToggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  help: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Checkbox checked={checked} onChange={onChange}>
        {label}
      </Checkbox>
      <Tooltip content={help}>
        <span
          className="flex size-5 cursor-help items-center justify-center text-muted hover:text-fg"
          aria-label={help}
        >
          <Info className="size-3.5" />
        </span>
      </Tooltip>
    </span>
  );
}

function DropList({
  id,
  hint,
  empty,
  items,
  children,
}: {
  id: string;
  hint: string;
  empty: string;
  items: string[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section className="flex flex-col gap-2">
      <p className="text-[12px] text-muted">{hint}</p>
      <div
        ref={setNodeRef}
        className={`flex min-h-[104px] flex-col gap-2 rounded-[var(--radius-panel)] border p-2 transition-colors
          ${isOver ? 'border-accent bg-accent-soft' : 'border-dashed border-border bg-bg'}`}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-4 text-[12px] text-muted">
              {empty}
            </div>
          ) : (
            children
          )}
        </SortableContext>
      </div>
    </section>
  );
}

function SortableCard({
  id,
  title,
  accentHex,
  isLink,
  problem,
  expanded,
  onToggle,
  onRemove,
  children,
}: {
  id: string;
  title: string;
  accentHex?: string;
  isLink: boolean;
  problem: string | null;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`rounded-[var(--radius-control)] border bg-surface
        ${problem ? 'border-danger' : 'border-border'}`}
    >
      {/* 三个图标控件一律 44px 见方：低于这个尺寸在触屏上按不准 */}
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`拖拽排序：${title}`}
          className="flex min-h-11 min-w-0 flex-1 cursor-grab items-center gap-1.5 rounded-[4px] px-2
            text-left text-[13px] font-medium text-fg hover:bg-surface-hover active:cursor-grabbing"
        >
          <GripVertical className="size-4 shrink-0 text-muted" />
          {isLink ? (
            <Link2 className="size-3.5 shrink-0 text-muted" aria-hidden />
          ) : (
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: accentHex ?? 'var(--muted)' }}
              aria-hidden
            />
          )}
          <span className="truncate">{title}</span>
        </button>

        {problem ? (
          <Tooltip content={problem}>
            <span
              className="flex size-11 items-center justify-center text-danger"
              aria-label={problem}
            >
              <AlertCircle className="size-4" />
            </span>
          </Tooltip>
        ) : null}

        <button
          type="button"
          onClick={onToggle}
          aria-label={`配置：${title}`}
          aria-expanded={expanded}
          className={`flex size-11 items-center justify-center rounded-[var(--radius-control)] transition-colors
            ${expanded ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-hover hover:text-fg'}`}
        >
          <Settings2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`删除：${title}`}
          className="flex size-11 items-center justify-center rounded-[var(--radius-control)] text-danger
            hover:bg-danger-soft"
        >
          <X className="size-4" />
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-border px-3 py-2.5">
          {problem ? <p className="mb-2 text-[12px] text-danger">{problem}</p> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

function Palette({
  platforms,
  usedPlatforms,
  atLinkLimit,
  onAddPlatform,
  onAddLink,
}: {
  platforms: SocialPlatformInfo[];
  usedPlatforms: Set<string>;
  atLinkLimit: boolean;
  onAddPlatform: (platformId: string) => void;
  onAddLink: () => void;
}) {
  return (
    <aside className="flex h-fit flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-3 lg:sticky lg:top-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-semibold text-fg">待选</h3>
        <p className="text-[12px] text-muted">拖到左边，或直接点一下添加。</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">链接</span>
        <PaletteItem
          id={CUSTOM_LINK_ID}
          label="自定义链接"
          disabled={atLinkLimit}
          onAdd={onAddLink}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">社媒平台</span>
        <div className="grid grid-cols-2 gap-1.5">
          {platforms.map((platform) => (
            <PaletteItem
              key={platform.id}
              id={`${PALETTE_PREFIX}${platform.id}`}
              label={platform.label}
              accentHex={platform.brandHex}
              disabled={usedPlatforms.has(platform.id)}
              onAdd={() => onAddPlatform(platform.id)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function PaletteItem({
  id,
  label,
  accentHex,
  disabled,
  onAdd,
}: {
  id: string;
  label: string;
  accentHex?: string;
  disabled: boolean;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });

  const dot = accentHex ? (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={{ background: accentHex }}
      aria-hidden
    />
  ) : (
    <Plus className="size-3.5 shrink-0 text-muted" />
  );

  if (disabled) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-border px-2 py-1.5 text-[13px] text-muted opacity-60">
        {dot}
        <span className="truncate">{label}</span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={onAdd}
      onKeyDown={(e) => {
        // 拖拽用不了时（键盘、触控笔），回车与空格等同于「加到列表末尾」
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAdd();
        }
      }}
      className={`flex cursor-grab items-center gap-2 rounded-[var(--radius-control)] border border-border
        bg-bg px-2 py-1.5 text-[13px] text-fg transition-colors hover:border-accent hover:bg-surface-hover
        active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-accent ${isDragging ? 'opacity-40' : ''}`}
    >
      {dot}
      <span className="truncate">{label}</span>
    </div>
  );
}

function EntryFields({
  entry,
  platform,
  passthroughCaveat,
  onChange,
}: {
  entry: EntryDraft;
  platform?: SocialPlatformInfo;
  passthroughCaveat: string;
  onChange: (patch: Partial<EntryDraft>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Input
        value={entry.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder={
          entry.kind === 'social'
            ? `标题，如「${platform?.label ?? ''} 上给我留言」`
            : '标题，如「作品集」'
        }
        maxLength={80}
      />
      <Input
        value={entry.subtitle}
        onChange={(e) => onChange({ subtitle: e.target.value })}
        placeholder="描述（选填），如「通常当天回复」。留空则不显示这一行"
        maxLength={80}
      />

      {entry.kind === 'social' ? (
        <Input
          value={entry.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder={platform?.inputHint ?? '号码 / 邮箱 / 用户名'}
        />
      ) : (
        <Input
          value={entry.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="目标链接"
        />
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2">
        <HelpToggle
          checked={entry.isLead}
          onChange={(checked) => onChange({ isLead: checked })}
          label="联系类渠道（计入线索）"
          help={LEAD_HELP}
        />
        <HelpToggle
          checked={entry.passSource}
          onChange={(checked) => onChange({ passSource: checked })}
          label="把来源透传给目标网站"
          help={`把访客进页面时地址上的 src 参数原样带到目标网站，方便在对方那边继续归因。\n\n${passthroughCaveat}`}
        />
      </div>
    </div>
  );
}
