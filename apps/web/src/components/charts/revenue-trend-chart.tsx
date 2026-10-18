import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { formatMoney, type DailyTrendPoint } from '@salonpro/shared';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../shadcn/chart';

const config = { revenue: { label: 'Collected', color: '#EC4899' } } satisfies ChartConfig;

/** "Mon" for the axis; local midnight avoids any UTC off-by-one. */
const weekdayShort = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });
const dayMonth = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * The admin 7-day revenue trend. Kept in its own module (and lazily imported)
 * so recharts never lands in the customer app's startup bundle.
 */
export default function RevenueTrendChart({ data }: { data: DailyTrendPoint[] }) {
  const series = data.map((point) => ({ ...point, day: weekdayShort(point.date) }));

  return (
    <ChartContainer config={config} className="mt-2 h-[118px] w-full">
      <AreaChart data={series} margin={{ left: 0, right: 4, top: 6, bottom: 0 }}>
        <defs>
          <linearGradient id="trend-revenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.75} />
            <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          fontSize={10}
          interval={0}
          padding={{ left: 8, right: 8 }}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_, payload) => {
                const first = payload?.[0]?.payload as { date?: string } | undefined;
                return first?.date ? dayMonth(first.date) : '';
              }}
              formatter={(value) => formatMoney(Number(value))}
            />
          }
        />
        <Area dataKey="revenue" type="monotone" stroke="var(--color-revenue)" strokeWidth={2} fill="url(#trend-revenue)" />
      </AreaChart>
    </ChartContainer>
  );
}
