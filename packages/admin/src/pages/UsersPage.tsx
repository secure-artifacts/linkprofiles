import { CheckCircle2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../api/client.js';
import type { AdminSummary, UserSummary } from '../api/types.js';
import { useBreadcrumb } from '../nav/breadcrumb.js';
import { useSession } from '../session.js';
import { Alert } from '../ui/Alert.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Input, PasswordInput, Textarea } from '../ui/Input.js';
import { Select } from '../ui/Select.js';
import { Tag } from '../ui/Tag.js';
import { useToast } from '../ui/Toast.js';
import { useConfirm } from '../ui/useConfirm.js';

const PAGE_SIZE = 20;

/**
 * 用户管理。
 *
 * 管理员在这里只看得到归属于自己的用户（服务端过滤，不是前端藏起来）。
 * 超级管理员额外看得到「无归属」——归属管理员被删除后留下的账号，
 * 做成显眼的红色标记，避免它们长期没人管理。
 */
export function UsersPage() {
  const session = useSession();
  const navigate = useNavigate();
  useBreadcrumb([{ label: '用户' }]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [page, setPage] = useState(1);
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

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
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const unownedCount = users.filter((u) => u.owningAdminId === null).length;
  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const pageUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const remove = async (user: UserSummary) => {
    const ok = await confirm({
      title: `删除用户 ${user.label || user.account}？`,
      description: (
        <div className="flex flex-col gap-1.5 text-[13px] text-fg">
          <span>
            他名下 {user.profileCount} 个页面的地址会全部进入墓碑并
            <strong className="font-semibold">永不再分配</strong>，旧链接从此返回 404。
          </span>
          <span>他上传的图片与视频会从磁盘删除；埋点数据保留，历史汇总不断档。</span>
        </div>
      ),
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    await request(`/users/${user.id}`, { method: 'DELETE' });
    toast.success('已删除');
    await load();
  };

  const assign = async (user: UserSummary, owningAdminId: string | null) => {
    await request(`/users/${user.id}/owner`, { method: 'PUT', body: { owningAdminId } });
    toast.success('已重新指派');
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-fg">用户</h1>
        <div className="flex gap-2">
          <Button variant="default" onClick={() => setBulkOpen(true)}>
            批量创建
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            新建用户
          </Button>
        </div>
      </div>

      {isSuperadmin && unownedCount > 0 ? (
        <Alert
          tone="warning"
          message={`有 ${unownedCount} 个用户处于无归属状态`}
          description="它们的归属管理员已被删除。请重新指派，否则这些账号会一直没人管理。"
        />
      ) : null}

      <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-border bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-[12px] font-medium text-muted">
              <th className="px-4 py-2.5">用户名称</th>
              <th className="px-4 py-2.5">账号</th>
              <th className="px-4 py-2.5">页面</th>
              {isSuperadmin ? <th className="px-4 py-2.5">归属管理员</th> : null}
              <th className="px-4 py-2.5">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isSuperadmin ? 5 : 4} className="px-4 py-8 text-center text-muted">
                  加载中…
                </td>
              </tr>
            ) : pageUsers.length === 0 ? (
              <tr>
                <td colSpan={isSuperadmin ? 5 : 4} className="px-4 py-8 text-center text-muted">
                  暂无用户
                </td>
              </tr>
            ) : (
              pageUsers.map((user) => (
                <tr
                  key={user.id}
                  className="h-[52px] border-b border-border last:border-b-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-2 text-fg">
                    {user.label || <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-[13px] text-fg">{user.account}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/users/${user.id}/profiles`)}
                      className="text-accent hover:underline"
                    >
                      {user.profileCount} 个页面
                    </button>
                  </td>
                  {isSuperadmin ? (
                    <td className="px-4 py-2">
                      {user.owningAdminId === null ? (
                        <div className="flex items-center gap-2">
                          <Tag tone="danger">无归属</Tag>
                          <div className="w-36">
                            <Select
                              size="sm"
                              placeholder="指派给…"
                              value={undefined}
                              options={admins.map((a) => ({
                                value: a.id,
                                label: a.label || a.account,
                              }))}
                              onChange={(value) => void assign(user, value)}
                            />
                          </div>
                        </div>
                      ) : (
                        (user.owningAdminLabel ?? '—')
                      )}
                    </td>
                  ) : null}
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => navigate(`/users/${user.id}/profiles`)}
                      >
                        管理页面
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(user)}>
                        账号设置
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/analytics?userId=${user.id}`)}
                      >
                        数据
                      </Button>
                      <Button variant="danger-ghost" size="sm" onClick={() => void remove(user)}>
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {users.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[13px] text-muted">
            <span>
              共 {users.length} 位用户，每页 {PAGE_SIZE} 条
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </Button>
              <span className="font-mono">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <AccountSettingsModal user={editing} onClose={() => setEditing(null)} onDone={load} />
      <CreateUserModal open={creating} onClose={() => setCreating(false)} onDone={load} />
      <BulkCreateModal open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={load} />
      {confirmDialog}
    </div>
  );
}

/**
 * 账号设置：改备注、重置密码。
 *
 * 页面地址不在这里改 —— 一个账号可以有多个个人页，地址属于页面而不属于账号，
 * 改名在个人页列表那一侧做。
 */
function AccountSettingsModal({
  user,
  onClose,
  onDone,
}: {
  user: UserSummary | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const [label, setLabel] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setLabel(user?.label ?? '');
    setNewPassword('');
  }, [user]);

  if (!user) return null;

  const save = async () => {
    setSaving(true);
    try {
      if (label !== user.label) {
        await request(`/users/${user.id}`, { method: 'PATCH', body: { label } });
      }
      if (newPassword) {
        await request(`/users/${user.id}/password`, { method: 'PUT', body: { newPassword } });
      }
      toast.success('已保存');
      onClose();
      await onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`账号设置 · ${user.label || user.account}`}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">用户名称</span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="后台备注，用来认人，不出现在页面上"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">重置密码</span>
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="留空则不改密码"
            autoComplete="new-password"
          />
          <span className="text-[12px] text-muted">
            重置后他当前的登录会立刻失效，需要用新密码重新登录。
          </span>
        </div>
      </div>
    </Dialog>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}

function CreateUserModal({ open, onClose, onDone }: ModalProps) {
  const [label, setLabel] = useState('');
  const [account, setAccount] = useState('');
  const [shortName, setShortName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setLabel('');
      setAccount('');
      setShortName('');
      setPassword('');
      setError(null);
    }
  }, [open]);

  const valid = account.trim().length > 0 && shortName.trim().length > 0 && password.length >= 8;

  const submit = async () => {
    if (!valid) {
      setError(
        !account.trim() ? '账号必填' : !shortName.trim() ? 'short_name 必填' : '密码至少 8 位',
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await request('/users', { method: 'POST', body: { label, account, shortName, password } });
      toast.success('已创建');
      onClose();
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="新建用户"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={submitting} onClick={() => void submit()}>
            创建
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" message={error} /> : null}

        <Field label="用户名称" hint="后台备注，用来认人，不出现在页面上">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="如：华东组 · 小王"
          />
        </Field>
        <Field label="账号">
          <Input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="登录用，全站唯一"
            autoComplete="off"
          />
        </Field>
        <Field label="short_name" hint="第一个个人页的地址。一经发布即为对外资产，删除后永不再分配">
          <Input
            addonBefore="/"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder="小写字母、数字与连字符，3–30 位"
          />
        </Field>
        <Field label="初始密码">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </div>
    </Dialog>
  );
}

interface BulkResult {
  createdCount: number;
  failedCount: number;
  failed: { line: number; error: string }[];
}

const BULK_PLACEHOLDER = '张三\tzhangsan\tzhangsan\tpassword-1234';

function BulkCreateModal({ open, onClose, onDone }: ModalProps) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const close = () => {
    setResult(null);
    onClose();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await request<BulkResult>('/users/bulk', { method: 'POST', body: { text } });
      setResult(res);
      if (res.createdCount > 0) await onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="批量创建"
      width={640}
      footer={
        result ? (
          <>
            <Button variant="default" onClick={close}>
              取消
            </Button>
            <Button variant="primary" onClick={() => setResult(null)}>
              返回修改失败行
            </Button>
          </>
        ) : (
          <>
            <Button variant="default" onClick={close}>
              取消
            </Button>
            <Button variant="primary" loading={submitting} onClick={() => void submit()}>
              开始创建
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3">
              <div className="text-[12px] text-muted">成功</div>
              <div className="font-mono text-2xl font-semibold text-accent">
                {result.createdCount}
              </div>
            </div>
            <div className="flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3">
              <div className="text-[12px] text-muted">失败</div>
              <div className="font-mono text-2xl font-semibold text-danger">
                {result.failedCount}
              </div>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-[var(--radius-control)] border border-border">
            {Array.from({ length: result.createdCount + result.failedCount }, (_, i) => i + 1).map(
              (line) => {
                const failure = result.failed.find((f) => f.line === line);
                return (
                  <div
                    key={line}
                    className={`flex items-center gap-2.5 border-b border-border px-3 py-2 text-[13px] last:border-b-0
                    ${failure ? 'bg-danger-soft' : ''}`}
                  >
                    {failure ? (
                      <XCircle className="size-4 shrink-0 text-danger" />
                    ) : (
                      <CheckCircle2 className="size-4 shrink-0 text-accent" />
                    )}
                    <span className="w-14 shrink-0 whitespace-nowrap font-mono text-muted">
                      第 {line} 行
                    </span>
                    <span className={failure ? 'text-danger' : 'text-muted'}>
                      {failure ? failure.error : '创建成功'}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">
            从表格里直接复制粘贴，每行四列、制表符分隔：
            <br />
            <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-[12px]">
              用户名称 ⇥ 账号 ⇥ short_name ⇥ 密码
            </code>
            <br />
            能建的会先建好，失败的行会单独列出来，不必整批重来。
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={BULK_PLACEHOLDER}
          />
        </div>
      )}
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-fg">
        {label}
        {hint ? <span className="ml-1.5 font-normal text-muted">· {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
