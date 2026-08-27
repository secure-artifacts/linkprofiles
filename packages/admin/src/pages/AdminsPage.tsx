import { Button, Flex, Form, Input, Modal, Space, Table, Typography, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { request } from '../api/client.js';
import type { AdminSummary } from '../api/types.js';

/** 管理员管理。只有超级管理员进得来。 */
export function AdminsPage() {
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAdmins((await request<{ admins: AdminSummary[] }>('/admins')).admins);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = (admin: AdminSummary) => {
    Modal.confirm({
      title: `删除管理员 ${admin.label || admin.account}？`,
      content: '他名下的用户不会被删除，而是转为「无归属」，需要你重新指派。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await request(`/admins/${admin.id}`, { method: 'DELETE' });
        message.success('已删除，名下用户已转为无归属');
        await load();
      },
    });
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Flex justify="space-between" align="center" wrap gap="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          管理员
        </Typography.Title>
        <Button type="primary" onClick={() => setCreating(true)}>
          新建管理员
        </Button>
      </Flex>

      <Table<AdminSummary>
        rowKey="id"
        loading={loading}
        dataSource={admins}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'label', render: (label: string) => label || '—' },
          { title: '账号', dataIndex: 'account' },
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, admin: AdminSummary) => (
              <Button size="small" danger onClick={() => remove(admin)}>
                删除
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title="新建管理员"
        open={creating}
        onCancel={() => setCreating(false)}
        okText="创建"
        cancelText="取消"
        onOk={async () => {
          const values = await form.validateFields();
          try {
            await request('/admins', { method: 'POST', body: values });
            message.success('已创建');
            form.resetFields();
            setCreating(false);
            await load();
          } catch (err) {
            message.error((err as Error).message);
          }
        }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="label" label="名称" tooltip="用来认人，如「华东组」">
            <Input />
          </Form.Item>
          <Form.Item name="account" label="账号" rules={[{ required: true, message: '账号必填' }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[{ required: true, min: 8, message: '密码至少 8 位' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
