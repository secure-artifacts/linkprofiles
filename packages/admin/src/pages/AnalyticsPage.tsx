import { DEFAULT_DISPLAY_TIMEZONE } from '@link-profile/shared';
import {
  Alert,
  Card,
  Col,
  DatePicker,
  Flex,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { request } from '../api/client.js';
import type { AnalyticsResponse, DimensionRow } from '../api/types.js';

/** 展示时区。默认受众所在地，不是运营自己所在地。 */
const TIME_ZONES = [
  DEFAULT_DISPLAY_TIMEZONE,
  'America/Los_Angeles',
  'America/Chicago',
  'UTC',
  'Europe/London',
  'Asia/Shanghai',
  'Asia/Tokyo',
];

interface AnalyticsPageProps {
  /** 只看某一个用户；不给就看可见范围内的全部 */
  userId?: string;
}

type Preset = 'today' | '7d' | '30d' | 'custom';

export function AnalyticsPage({ userId }: AnalyticsPageProps) {
  const [preset, setPreset] = useState<Preset>('7d');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [timeZone, setTimeZone] = useState(DEFAULT_DISPLAY_TIMEZONE);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ tz: timeZone });
    if (preset === 'custom') {
      // 自定义区间要两端都选好了才查
      if (!customRange) return;
      params.set('from', customRange[0].startOf('day').toISOString());
      params.set('to', customRange[1].endOf('day').toISOString());
    } else {
      params.set('preset', preset);
    }
    if (userId) params.set('userId', userId);

    setError(null);
    request<AnalyticsResponse>(`/analytics?${params}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [preset, customRange, timeZone, userId]);

  if (error) return <Alert type="error" showIcon message="读不到数据" description={error} />;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Flex justify="space-between" align="center" wrap gap="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          数据分析
        </Typography.Title>
        <Space wrap>
          <Segmented
            value={preset}
            onChange={(value) => setPreset(value as Preset)}
            options={[
              { value: 'today', label: '今天' },
              { value: '7d', label: '7 天' },
              { value: '30d', label: '30 天' },
              { value: 'custom', label: '自定义' },
            ]}
          />
          {preset === 'custom' ? (
            <DatePicker.RangePicker
              value={customRange}
              onChange={(range) =>
                setCustomRange(range && range[0] && range[1] ? [range[0], range[1]] : null)
              }
            />
          ) : null}
          <Select
            value={timeZone}
            onChange={setTimeZone}
            style={{ minWidth: 190 }}
            options={TIME_ZONES.map((tz) => ({ value: tz, label: tz }))}
          />
        </Space>
      </Flex>

      <Alert
        type="info"
        showIcon
        message="这里的数字是次数，不是人数"
        description="不做访客去重：同一个人刷十次页就是十次页面浏览，连点五次就是五条线索。对外汇报时请说明这一点。"
      />

      {data ? (
        <AnalyticsResults data={data} timeZone={timeZone} />
      ) : (
        <Typography.Text type="secondary">选好起止日期后显示数据。</Typography.Text>
      )}
    </Space>
  );
}

/** 指标与图表。只有拿到数据才渲染，因此这里的 data 一定非空。 */
function AnalyticsResults({ data, timeZone }: { data: AnalyticsResponse; timeZone: string }) {
  const peakHour = useMemo(() => {
    const max = Math.max(...data.hourlyLeads);
    return max === 0 ? null : data.hourlyLeads.indexOf(max);
  }, [data]);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="线索" value={data.totals.leads} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="点击" value={data.totals.clicks} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="页面浏览" value={data.totals.pageViews} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="点击率" value={data.totals.ctr * 100} precision={1} suffix="%" />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title={`趋势（按${data.range.granularity === 'hour' ? '小时' : '天'}，${timeZone}）`}
      >
        <BarSeries
          items={data.trend.map((point) => ({ label: point.bucket, value: point.leads }))}
          emptyText="这个区间还没有线索"
        />
      </Card>

      <Card size="small" title="一天里的线索分布">
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <BarSeries
            items={data.hourlyLeads.map((value, hour) => ({ label: String(hour), value }))}
            emptyText="这个区间还没有线索"
          />
          {peakHour !== null ? (
            <Typography.Text type="secondary">
              最活跃的时段是 {peakHour}:00（{timeZone}）。发帖引流挑这个前后最划算。
            </Typography.Text>
          ) : null}
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <DimensionCard title="来源" rows={data.dimensions.sources} />
        </Col>
        <Col xs={24} lg={12}>
          <DimensionCard title="国家" rows={data.dimensions.countries} />
        </Col>
        <Col xs={24} lg={12}>
          <DimensionCard title="城市" rows={data.dimensions.cities} />
        </Col>
        <Col xs={24} lg={12}>
          <DimensionCard title="设备类型" rows={data.dimensions.devices} />
        </Col>
        <Col xs={24} lg={12}>
          <DimensionCard title="操作系统" rows={data.dimensions.operatingSystems} />
        </Col>
      </Row>

      <Card size="small" title="各按钮的点击率">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={data.buttons}
          columns={[
            { title: '按钮', dataIndex: 'title' },
            {
              title: '类型',
              dataIndex: 'isLead',
              render: (isLead: boolean) => (isLead ? '联系类' : '内容类'),
            },
            { title: '点击', dataIndex: 'clicks' },
            {
              title: '点击率',
              dataIndex: 'ctr',
              render: (ctr: number) => `${(ctr * 100).toFixed(1)}%`,
            },
          ]}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          分母是页面浏览数，不是访客数 —— 按钮没有独立曝光，页面渲染一次全部按钮就都露过一次面。
        </Typography.Text>
      </Card>
    </Space>
  );
}

function DimensionCard({ title, rows }: { title: string; rows: DimensionRow[] }) {
  return (
    <Card size="small" title={title}>
      <Table
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={rows.slice(0, 10)}
        locale={{ emptyText: '暂无数据' }}
        columns={[
          {
            title: title,
            dataIndex: 'key',
            render: (key: string) =>
              key || <Typography.Text type="secondary">未知</Typography.Text>,
          },
          { title: '浏览', dataIndex: 'pageViews' },
          { title: '点击', dataIndex: 'clicks' },
          { title: '线索', dataIndex: 'leads' },
        ]}
      />
    </Card>
  );
}

/**
 * 一个够用的柱状图。
 *
 * 后台严格用 Ant Design（ADR-0002），而 antd 不带图表；引一个图表库
 * 只为画两张柱状图不划算，因此用一排 div 拼出来。
 */
function BarSeries({
  items,
  emptyText,
}: {
  items: { label: string; value: number }[];
  emptyText: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const hasAny = items.some((i) => i.value > 0);

  if (!hasAny) return <Typography.Text type="secondary">{emptyText}</Typography.Text>;

  return (
    <Flex align="flex-end" gap={2} style={{ height: 140, overflowX: 'auto' }}>
      {items.map((item) => (
        <Flex
          key={item.label}
          vertical
          align="center"
          justify="flex-end"
          style={{ flex: '1 0 18px', height: '100%' }}
          title={`${item.label}：${item.value}`}
        >
          <div
            style={{
              width: '100%',
              height: `${(item.value / max) * 100}%`,
              minHeight: item.value > 0 ? 2 : 0,
              background: '#1677ff',
              borderRadius: '3px 3px 0 0',
            }}
          />
          <span style={{ fontSize: 10, color: 'rgba(0,0,0,.45)', whiteSpace: 'nowrap' }}>
            {item.label.slice(-5)}
          </span>
        </Flex>
      ))}
    </Flex>
  );
}
