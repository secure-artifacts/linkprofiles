import { Alert, Card, Space, Switch, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { request } from '../api/client.js';
import type { AppSettings } from '../api/types.js';

/** 全站设置。只有超级管理员进得来。 */
export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    request<AppSettings>('/settings')
      .then(setSettings)
      .catch((err: Error) => message.error(err.message));
  }, []);

  if (!settings) return null;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 720 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        全站设置
      </Typography.Title>

      <Card size="small" title="来源透传">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space>
            <Switch
              checked={settings.sourcePassthroughDefault}
              onChange={async (checked) => {
                try {
                  setSettings(
                    await request<AppSettings>('/settings', {
                      method: 'PATCH',
                      body: { sourcePassthroughDefault: checked },
                    }),
                  );
                  message.success('已保存');
                } catch (err) {
                  message.error((err as Error).message);
                }
              }}
            />
            <span>默认对所有按钮开启来源透传</span>
          </Space>

          <Typography.Text type="secondary">
            按钮可以逐条覆盖这个默认值。开启后，访客带 <Typography.Text code>?src=</Typography.Text>
            访问个人页时，跳转目标的地址上会带上同一个来源。
          </Typography.Text>

          <Alert
            type="warning"
            showIcon
            message="已知取舍"
            description={settings.sourcePassthroughCaveat}
          />
        </Space>
      </Card>
    </Space>
  );
}
