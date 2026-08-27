import { Alert, Form, Input, Modal, message } from 'antd';
import { useState } from 'react';
import { request } from '../api/client.js';

/**
 * 自助改密码。
 *
 * 与管理员重置是两条路：这条要验旧密码。改完该账号的**全部**会话都会失效
 * （含当前这条），所以成功后直接把人送回登录页。
 */
export function ChangePasswordModal({
  open,
  onClose,
  onSignedOut,
}: {
  open: boolean;
  onClose: () => void;
  onSignedOut: () => void;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal
      title="修改密码"
      open={open}
      onCancel={onClose}
      okText="修改"
      cancelText="取消"
      confirmLoading={submitting}
      onOk={async () => {
        const values = await form.validateFields();
        setSubmitting(true);
        try {
          await request('/auth/password', { method: 'POST', body: values });
          message.success('密码已修改，请用新密码重新登录');
          form.resetFields();
          onSignedOut();
        } catch (err) {
          message.error((err as Error).message);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="改完之后这个账号在所有设备上的登录都会失效，需要重新登录。"
      />
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="currentPassword"
          label="当前密码"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[{ required: true, min: 8, message: '新密码至少 8 位' }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
