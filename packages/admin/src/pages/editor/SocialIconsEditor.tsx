import type { SocialIconDraft, SocialPlatformInfo } from '../../api/types.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { Input } from '../../ui/Input.js';
import { Switch } from '../../ui/Switch.js';
import { Tag } from '../../ui/Tag.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { localId } from './draft.js';

interface SocialIconsEditorProps {
  platforms: SocialPlatformInfo[];
  icons: SocialIconDraft[];
  onChange: (icons: SocialIconDraft[]) => void;
  passthroughCaveat: string;
}

/** 通讯类平台排在前一组，其余归到「社交与内容」，纯粹为了浏览方便，不影响启用逻辑。 */
const MESSAGING_PLATFORM_IDS = new Set(['whatsapp', 'messenger', 'telegram', 'signal', 'email']);

/**
 * 社媒图标：从内置清单里逐个启用。
 *
 * 用户填的是号码、邮箱或用户名，**目标 URL 由系统拼装** —— 他不必知道
 * `wa.me` 与 `mailto:` 的写法。清单仅含海外平台。
 */
export function SocialIconsEditor({
  platforms,
  icons,
  onChange,
  passthroughCaveat,
}: SocialIconsEditorProps) {
  const byPlatform = new Map(icons.map((icon) => [icon.platform, icon]));

  const toggle = (platform: SocialPlatformInfo, enabled: boolean) => {
    if (!enabled) {
      onChange(icons.filter((icon) => icon.platform !== platform.id));
      return;
    }
    onChange([
      ...icons,
      {
        id: localId(),
        platform: platform.id,
        value: '',
        isLead: platform.defaultIsLead,
        passSource: false,
      },
    ]);
  };

  const update = (platformId: string, patch: Partial<SocialIconDraft>) =>
    onChange(icons.map((icon) => (icon.platform === platformId ? { ...icon, ...patch } : icon)));

  const messaging = platforms.filter((p) => MESSAGING_PLATFORM_IDS.has(p.id));
  const social = platforms.filter((p) => !MESSAGING_PLATFORM_IDS.has(p.id));

  return (
    <div className="flex flex-col gap-5">
      <PlatformGroup
        title="通讯与联系"
        platforms={messaging}
        byPlatform={byPlatform}
        onToggle={toggle}
        onUpdate={update}
        passthroughCaveat={passthroughCaveat}
      />
      <PlatformGroup
        title="社交与内容"
        platforms={social}
        byPlatform={byPlatform}
        onToggle={toggle}
        onUpdate={update}
        passthroughCaveat={passthroughCaveat}
      />
    </div>
  );
}

function PlatformGroup({
  title,
  platforms,
  byPlatform,
  onToggle,
  onUpdate,
  passthroughCaveat,
}: {
  title: string;
  platforms: SocialPlatformInfo[];
  byPlatform: Map<string, SocialIconDraft>;
  onToggle: (platform: SocialPlatformInfo, enabled: boolean) => void;
  onUpdate: (platformId: string, patch: Partial<SocialIconDraft>) => void;
  passthroughCaveat: string;
}) {
  if (platforms.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-medium text-muted">{title}</h3>
      <div className="flex flex-col divide-y divide-border rounded-[var(--radius-control)] border border-border">
        {platforms.map((platform) => {
          const icon = byPlatform.get(platform.id);
          return (
            <div key={platform.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Switch
                checked={Boolean(icon)}
                onChange={(checked) => onToggle(platform, checked)}
                aria-label={`启用 ${platform.label}`}
              />
              <Tag hex={platform.brandHex}>{platform.label}</Tag>

              {icon ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  <div className="min-w-[180px] flex-1">
                    <Input
                      value={icon.value}
                      onChange={(e) => onUpdate(platform.id, { value: e.target.value })}
                      placeholder={platform.inputHint}
                    />
                    <p className="mt-1 text-[11px] text-muted">
                      只填{inputNoun(platform.inputKind)}就行，链接由系统拼好
                    </p>
                  </div>
                  <Checkbox
                    checked={icon.isLead}
                    onChange={(checked) => onUpdate(platform.id, { isLead: checked })}
                  >
                    计入线索
                  </Checkbox>
                  <Tooltip content={passthroughCaveat}>
                    <span>
                      <Checkbox
                        checked={icon.passSource}
                        onChange={(checked) => onUpdate(platform.id, { passSource: checked })}
                      >
                        透传来源
                      </Checkbox>
                    </span>
                  </Tooltip>
                </div>
              ) : (
                <span className="flex-1" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function inputNoun(kind: SocialPlatformInfo['inputKind']): string {
  switch (kind) {
    case 'phone':
      return '号码';
    case 'email':
      return '邮箱地址';
    case 'username':
      return '用户名';
  }
}
