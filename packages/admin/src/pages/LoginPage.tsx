import { Button, Card, Flex, Form, Input, Typography, message } from 'antd';
import { useState } from 'react';
import { request } from '../api/client.js';
import type { Session } from '../api/types.js';

export function LoginPage({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Flex justify="center" align="center" style={{ minHeight: '100dvh', padding: 24 }}>
      <Card style={{ width: 360 }}>
        <Typography.Title level={4}>Link Profile 后台</Typography.Title>
        <Form
          layout="vertical"
          requiredMark={false}
          onFinish={async (values: { account: string; password: string }) => {
            setSubmitting(true);
            try {
              onSignedIn(await request<Session>('/auth/login', { method: 'POST', body: values }));
            } catch (err) {
              message.error((err as Error).message);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Form.Item
            name="account"
            label="账号"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            登录
          </Button>
        </Form>
      </Card>
    </Flex>
  );
}
