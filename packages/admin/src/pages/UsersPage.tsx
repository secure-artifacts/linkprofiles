import {
  Alert,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { request } from '../api/client.js';
import type { AdminSummary, Session, UserSummary } from '../api/types.js';

interface UsersPageProps {
  session: Session;
  onEdit: (userId: string) => void;
  onAnalytics: (userId: string) => void;
}

/**
 * 用户管理。
 *
 * 管理员在这里只看得到归属于自己的用户（服务端过滤，不是前端藏起来）。
 * 超级管理员额外看得到「无归属」——归属管理员被删除后留下的账号，
 * 做成显眼的红色标记，避免它们长期没人管。
 */
export function UsersPage({ session, onEdit, onAnalytics }: UsersPageProps) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const isSuperadmin = session.role === 'superadmin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await request<{ users: UserSummary[] }>('/users');
      setUsers(list.users);
      if (isSuperadmin) {
        setAdmins((await request<{ admins: AdminSummary[] }>('/admins')).admins);
      }
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isSuperadmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const unownedCount = users.filter((u) => u.owningAdminId === null).length;

  const remove = (user: UserSummary) => {
    Modal.confirm({
      title: `删除用户 ${user.label || user.account}？`,
      content: (
        <Space direction="vertical" size={4}>
          <span>
            地址 /{user.shortName} 会进入墓碑并<strong>永不再分配</strong>，旧链接从此返回 404。
          </span>
          <span>他上传的图片与视频会从磁盘删除；埋点数据保留，历史汇总不断档。</span>
        </Space>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await request(`/users/${user.id}`, { method: 'DELETE' });
        message.success('已删除');
        await load();
      },
    });
  };

  const assign = async (user: UserSummary, owningAdminId: string | null) => {
    await request(`/users/${user.id}/owner`, { method: 'PUT', body: { owningAdminId } });
    message.success('已重新指派');
    await load();
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Flex justify="space-between" align="center" wrap gap="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          用户
        </Typography.Title>
        <Space>
          <Button onClick={() => setBulkOpen(true)}>批量创建</Button>
          <Button type="primary" onClick={() => setCreating(true)}>
            新建用户
          </Button>
        </Space>
      </Flex>

      {isSuperadmin && unownedCount > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={`有 ${unownedCount} 个用户处于无归属状态`}
          description="它们的归属管理员已被删除。请重新指派，否则这些账号会一直没人管理。"
        />
      ) : null}

      <Table<UserSummary>
        rowKey="id"
        loading={loading}
        dataSource={users}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={[
          {
            title: '用户名称',
            dataIndex: 'label',
            render: (label: string) =>
              label || <Typography.Text type="secondary">—</Typography.Text>,
          },
          { title: '账号', dataIndex: 'account' },
          {
            title: '页面地址',
            dataIndex: 'shortName',
            render: (shortName: string | null) =>
              shortName ? (
                <a href={`/${shortName}`} target="_blank" rel="noreferrer">
                  /{shortName}
                </a>
              ) : (
                '—'
              ),
          },
          ...(isSuperadmin
            ? [
                {
                  title: '归属',
                  dataIndex: 'owningAdminId',
                  render: (owningAdminId: string | null, user: UserSummary) =>
                    owningAdminId === null ? (
                      <Space>
                        <Tag color="red">无归属</Tag>
                        <Select
                          size="small"
                          style={{ minWidth: 140 }}
                          placeholder="指派给…"
                          options={admins.map((a) => ({
                            value: a.id,
                            label: a.label || a.account,
                          }))}
                          onChange={(value) => void assign(user, value)}
                        />
                      </Space>
                    ) : (
                      (admins.find((a) => a.id === owningAdminId)?.label ?? '—')
                    ),
                },
              ]
            : []),
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, user: UserSummary) => (
              <Space size="small">
                <Button size="small" onClick={() => onEdit(user.id)}>
                  编辑页面
                </Button>
                <Button size="small" onClick={() => onAnalytics(user.id)}>
                  数据
                </Button>
                <Button size="small" danger onClick={() => remove(user)}>
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <CreateUserModal open={creating} onClose={() => setCreating(false)} onDone={load} />
      <BulkCreateModal open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={load} />
    </Space>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}

function CreateUserModal({ open, onClose, onDone }: ModalProps) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal
      title="新建用户"
      open={open}
      onCancel={onClose}
      okText="创建"
      cancelText="取消"
      confirmLoading={submitting}
      onOk={async () => {
        const values = await form.validateFields();
        setSubmitting(true);
        try {
          await request('/users', { method: 'POST', body: values });
          message.success('已创建');
          form.resetFields();
          onClose();
          await onDone();
        } catch (err) {
          message.error((err as Error).message);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="label" label="用户名称" tooltip="后台备注，用来认人，不出现在页面上">
          <Input placeholder="如：华东组 · 小王" />
        </Form.Item>
        <Form.Item name="account" label="账号" rules={[{ required: true, message: '账号必填' }]}>
          <Input placeholder="登录用，全站唯一" autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="shortName"
          label="short_name"
          tooltip="个人页地址。一经发布即为对外资产，删除后永不再分配"
          rules={[{ required: true, message: 'short_name 必填' }]}
        >
          <Input addonBefore="/" placeholder="小写字母、数字与连字符，3–30 位" />
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
  );
}

interface BulkResult {
  createdCount: number;
  failedCount: number;
  failed: { line: number; error: string }[];
}

function BulkCreateModal({ open, onClose, onDone }: ModalProps) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal
      title="批量创建用户"
      open={open}
      width={720}
      onCancel={() => {
        setResult(null);
        onClose();
      }}
      okText="创建"
      cancelText="关闭"
      confirmLoading={submitting}
      onOk={async () => {
        setSubmitting(true);
        try {
          const res = await request<BulkResult>('/users/bulk', { method: 'POST', body: { text } });
          setResult(res);
          if (res.createdCount > 0) await onDone();
        } catch (err) {
          message.error((err as Error).message);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          从表格里直接复制粘贴，每行四列、制表符分隔：
          <br />
          <Typography.Text code>用户名称 ⇥ 账号 ⇥ short_name ⇥ 密码</Typography.Text>
          <br />
          能建的会先建好，失败的行会单独列出来，不必整批重来。
        </Typography.Paragraph>

        <Input.TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={'张三\tzhangsan\tzhangsan\tpassword-1234'}
        />

        {result ? (
          <Card size="small">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Typography.Text>
                成功 {result.createdCount} 行，失败 {result.failedCount} 行
              </Typography.Text>
              {result.failed.map((row) => (
                <Typography.Text key={row.line} type="danger">
                  第 {row.line} 行：{row.error}
                </Typography.Text>
              ))}
            </Space>
          </Card>
        ) : null}
      </Space>
    </Modal>
  );
}
