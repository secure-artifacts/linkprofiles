import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { validateInviteCode } from '@link-profile/shared';
import { request } from '../api/client.js';
import type { AdminSummary, RegionSummary } from '../api/types.js';
import { useAdminT, useErrorT } from '../i18n/runtime.js';
import { regionLabel } from '../regions/label.js';
import { useBreadcrumb } from '../nav/breadcrumb.js';
import { useSession } from '../session.js';
import { Alert } from '../ui/Alert.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Input, Textarea } from '../ui/Input.js';
import { Select } from '../ui/Select.js';
import { Spinner } from '../ui/Spinner.js';
import { Tag } from '../ui/Tag.js';
import { Tooltip } from '../ui/Tooltip.js';
import { useToast } from '../ui/Toast.js';
import { useConfirm } from '../ui/useConfirm.js';

/**
 * 区域管理。
 *
 * 管理员只看得到自己名下的区域（服务端过滤），超级管理员看得到全部，
 * 包括归属管理员被删后留下的无归属区域。
 */
export function RegionsPage() {
  const t = useAdminT();
  const session = useSession();
  useBreadcrumb([{ label: t('nav.regions') }]);
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [renaming, setRenaming] = useState<RegionSummary | null>(null);
  const [resetting, setResetting] = useState<RegionSummary | null>(null);

  const isSuperadmin = session.role === 'superadmin';
  const unowned = regions.filter((r) => r.ownerAdminId === null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRegions((await request<{ regions: RegionSummary[] }>('/regions')).regions);
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

  const remove = async (region: RegionSummary) => {
    const ok = await confirm({
      title: t('regions.delete.confirm', { name: regionLabel(region.id, region.name) }),
      description: t('regions.delete.note'),
      confirmText: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await request(`/regions/${region.id}`, { method: 'DELETE' });
      toast.success(t('common.deleted'));
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const assign = async (region: RegionSummary, ownerAdminId: string) => {
    try {
      await request(`/regions/${region.id}`, { method: 'PATCH', body: { ownerAdminId } });
      toast.success(t('regions.assigned'));
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('regions.inviteCode.copied'));
    } catch {
      // 非安全上下文或用户拒绝了剪贴板权限时，码本身在页面上照样看得见
      toast.error(t('common.copyFailed'));
    }
  };

  const ownerLabelOf = (region: RegionSummary) => {
    if (region.ownerAdminId === null) return null;
    return region.ownerAdminLabel || region.ownerAdminAccount || '—';
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-fg">{t('regions.title')}</h1>
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={() => setBulkOpen(true)}>
            {t('bulk.title')}
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('regions.create.title')}
          </Button>
        </div>
      </div>

      {isSuperadmin && unowned.length > 0 ? (
        <Alert
          tone="warning"
          message={t('regions.unowned.count', { count: unowned.length })}
          description={t('regions.unowned.hint')}
        />
      ) : null}

      <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-border bg-surface">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : regions.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted">{t('regions.empty')}</div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-hover text-muted">
                <th className="px-4 py-2.5 font-medium">{t('regions.field.name')}</th>
                {isSuperadmin ? (
                  <th className="px-4 py-2.5 font-medium">{t('regions.field.owner')}</th>
                ) : null}
                <th className="px-4 py-2.5 font-medium">{t('regions.members')}</th>
                <th className="px-4 py-2.5 font-medium">{t('regions.inviteCode')}</th>
                <th className="px-4 py-2.5 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((region) => (
                <tr
                  key={region.id}
                  className="border-b border-border last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3 text-fg">
                    <div className="flex items-center gap-2">
                      <span>{regionLabel(region.id, region.name)}</span>
                      {region.isDefault ? <Tag tone="neutral">{t('regions.default')}</Tag> : null}
                    </div>
                  </td>
                  {isSuperadmin ? (
                    <td className="px-4 py-3 text-fg">
                      {ownerLabelOf(region) ?? (
                        <div className="flex items-center gap-2">
                          <Tag tone="danger">{t('regions.unowned')}</Tag>
                          <div className="w-36">
                            <Select
                              size="sm"
                              placeholder={t('regions.assign')}
                              value={undefined}
                              options={admins.map((a) => ({
                                value: a.id,
                                label: a.label || a.account,
                              }))}
                              onChange={(value) => void assign(region, value)}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-fg">
                    {t('regions.membersCount', { count: region.memberCount })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {region.inviteCode ? (
                        <>
                          <code className="rounded bg-bg px-2 py-1 font-mono text-[13px] tracking-wider text-fg">
                            {region.inviteCode}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void copyCode(region.inviteCode!)}
                          >
                            {t('regions.inviteCode.copy')}
                          </Button>
                        </>
                      ) : (
                        <span className="text-muted">{t('regions.inviteCode.none')}</span>
                      )}
                      {region.ownerAdminId === null ? null : (
                        <Button variant="ghost" size="sm" onClick={() => setResetting(region)}>
                          {t('regions.inviteCode.reset')}
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button variant="default" size="sm" onClick={() => setRenaming(region)}>
                        {t('common.edit')}
                      </Button>
                      <DeleteRegionButton region={region} onDelete={() => void remove(region)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <RegionDialog
        open={creating}
        region={null}
        admins={isSuperadmin ? admins : []}
        onClose={() => setCreating(false)}
        onDone={async () => {
          setCreating(false);
          await load();
        }}
      />
      <ResetInviteCodeDialog
        region={resetting}
        onClose={() => setResetting(null)}
        onDone={async () => {
          setResetting(null);
          await load();
        }}
      />
      <RegionDialog
        open={renaming !== null}
        region={renaming}
        admins={[]}
        onClose={() => setRenaming(null)}
        onDone={async () => {
          setRenaming(null);
          await load();
        }}
      />
      <BulkRegionsModal open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={load} />
      {confirmDialog}
    </div>
  );
}

interface BulkRegionResult {
  createdCount: number;
  failedCount: number;
  created: { line: number; name: string }[];
  failed: { line: number; error: string }[];
}

/**
 * 批量建区域。一行一个名字。
 *
 * 结果按行号逐行回放，成功与失败排在一起 —— 只报一个「成功 3 失败 2」的话，
 * 管理员还得自己把失败的名字从原文里找出来。
 */
function BulkRegionsModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useAdminT();
  const toast = useToast();
  const [text, setText] = useState('');
  const [result, setResult] = useState<BulkRegionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setText('');
    setResult(null);
    onClose();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await request<BulkRegionResult>('/regions/bulk', {
        method: 'POST',
        body: { text },
      });
      setResult(res);
      if (res.createdCount > 0) await onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const rows = result
    ? [
        ...result.created.map((row) => ({ line: row.line, text: row.name, ok: true })),
        ...result.failed.map((row) => ({ line: row.line, text: row.error, ok: false })),
      ].sort((a, b) => a.line - b.line)
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={t('bulk.title')}
      width={560}
      footer={
        <>
          <Button variant="default" onClick={close}>
            {t('common.cancel')}
          </Button>
          {result ? (
            <Button variant="primary" onClick={() => setResult(null)}>
              {t('bulk.retryFailed')}
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={submitting}
              disabled={text.trim() === ''}
              onClick={() => void submit()}
            >
              {t('bulk.start')}
            </Button>
          )}
        </>
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3">
              <div className="text-[12px] text-muted">{t('bulk.succeeded')}</div>
              <div className="font-mono text-2xl font-semibold text-accent">
                {result.createdCount}
              </div>
            </div>
            <div className="flex-1 rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3">
              <div className="text-[12px] text-muted">{t('bulk.failed')}</div>
              <div className="font-mono text-2xl font-semibold text-danger">
                {result.failedCount}
              </div>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-[var(--radius-control)] border border-border">
            {rows.map((row) => (
              <div
                key={row.line}
                className={`flex items-center gap-2.5 border-b border-border px-3 py-2 text-[13px] last:border-b-0
                  ${row.ok ? '' : 'bg-danger-soft'}`}
              >
                {row.ok ? (
                  <CheckCircle2 className="size-4 shrink-0 text-accent" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-danger" />
                )}
                <span className="w-14 shrink-0 whitespace-nowrap font-mono text-muted">
                  {t('bulk.line', { line: row.line })}
                </span>
                <span className={row.ok ? 'text-fg' : 'text-danger'}>{row.text}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">
            {t('regions.bulk.format')}
            <br />
            {t('bulk.partial')}
          </p>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            placeholder={t('regions.bulk.placeholder')}
            className="font-mono text-[13px]"
          />
        </div>
      )}
    </Dialog>
  );
}

/**
 * 删除区域。
 *
 * 删不掉的时候按钮照常显示，只是禁用并说明原因 —— 直接把按钮藏掉的话，
 * 管理员看到的是一个「有些行有删除、有些行没有」的表格，得自己猜规律。
 *
 * 禁用的 button 收不到指针事件，tooltip 因此挂在外面那层 span 上。
 */
function DeleteRegionButton({ region, onDelete }: { region: RegionSummary; onDelete: () => void }) {
  const t = useAdminT();
  const blocked = region.isDefault
    ? t('regions.delete.blocked.default')
    : region.memberCount > 0
      ? t('regions.delete.blocked.members')
      : null;

  if (!blocked) {
    return (
      <Button variant="danger-ghost" size="sm" onClick={onDelete}>
        {t('common.delete')}
      </Button>
    );
  }

  return (
    <Tooltip content={blocked}>
      <span className="inline-flex" tabIndex={0}>
        <Button variant="danger-ghost" size="sm" disabled className="pointer-events-none">
          {t('common.delete')}
        </Button>
      </span>
    </Tooltip>
  );
}

function RegionDialog({
  open,
  region,
  admins,
  onClose,
  onDone,
}: {
  open: boolean;
  region: RegionSummary | null;
  admins: AdminSummary[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useAdminT();
  const toast = useToast();
  const [name, setName] = useState('');
  const [ownerAdminId, setOwnerAdminId] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(region?.name ?? '');
    setOwnerAdminId(undefined);
  }, [region, open]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    try {
      if (region) {
        await request(`/regions/${region.id}`, { method: 'PATCH', body: { name } });
      } else {
        await request('/regions', {
          method: 'POST',
          body: { name, ...(ownerAdminId ? { ownerAdminId } : {}) },
        });
      }
      toast.success(t('common.saved'));
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
      onOpenChange={(value) => !value && onClose()}
      title={region ? t('regions.rename.title') : t('regions.create.title')}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">{t('regions.field.name')}</label>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
          <span className="text-[12px] text-muted">{t('regions.field.name.hint')}</span>
        </div>
        {region === null && admins.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-fg">{t('regions.field.owner')}</label>
            <Select
              value={ownerAdminId}
              options={admins.map((admin) => ({
                value: admin.id,
                label: admin.label || admin.account,
              }))}
              onChange={(value) => setOwnerAdminId(value)}
            />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function ResetInviteCodeDialog({
  region,
  onClose,
  onDone,
}: {
  region: RegionSummary | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useAdminT();
  const errorT = useErrorT();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCode('');
  }, [region]);

  if (!region) return null;

  const save = async () => {
    setSaving(true);
    try {
      const trimmed = code.trim();
      const parsed = trimmed === '' ? null : validateInviteCode(trimmed);
      if (parsed && !parsed.ok) throw new Error(errorT(parsed.error));

      await request(`/regions/${region.id}/invite-code`, {
        method: 'POST',
        body: parsed ? { code: parsed.value } : {},
      });
      toast.success(t('regions.inviteCode.issued'));
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
      onOpenChange={(value) => !value && onClose()}
      title={t('regions.inviteCode.reset.title')}
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-muted">{t('regions.inviteCode.reset.note')}</p>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-fg">
            {t('regions.inviteCode.custom')}
          </label>
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder={region.inviteCode ?? ''}
          />
          <span className="text-[12px] text-muted">{t('regions.inviteCode.custom.hint')}</span>
        </div>
      </div>
    </Dialog>
  );
}
