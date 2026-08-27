import { Checkbox, Flex, Input, List, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import type { SocialIconDraft, SocialPlatformInfo } from '../../api/types.js';
import { localId } from './draft.js';

interface SocialIconsEditorProps {
  platforms: SocialPlatformInfo[];
  icons: SocialIconDraft[];
  onChange: (icons: SocialIconDraft[]) => void;
  passthroughCaveat: string;
}

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

  return (
    <List
      size="small"
      dataSource={platforms}
      renderItem={(platform) => {
        const icon = byPlatform.get(platform.id);

        return (
          <List.Item>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Flex align="center" gap="small">
                <Switch
                  checked={Boolean(icon)}
                  onChange={(checked) => toggle(platform, checked)}
                  aria-label={`启用 ${platform.label}`}
                />
                <Tag color={platform.brandHex} style={{ marginInlineEnd: 0 }}>
                  {platform.label}
                </Tag>
              </Flex>

              {icon ? (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Input
                    value={icon.value}
                    onChange={(e) => update(platform.id, { value: e.target.value })}
                    placeholder={platform.inputHint}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    只填{inputNoun(platform.inputKind)}就行，链接由系统拼好
                  </Typography.Text>
                  <Flex gap="middle" wrap>
                    <Checkbox
                      checked={icon.isLead}
                      onChange={(e) => update(platform.id, { isLead: e.target.checked })}
                    >
                      计入线索
                    </Checkbox>
                    <Tooltip title={passthroughCaveat}>
                      <Checkbox
                        checked={icon.passSource}
                        onChange={(e) => update(platform.id, { passSource: e.target.checked })}
                      >
                        透传来源
                      </Checkbox>
                    </Tooltip>
                  </Flex>
                </Space>
              ) : null}
            </Space>
          </List.Item>
        );
      }}
    />
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
