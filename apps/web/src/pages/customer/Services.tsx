import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';import { formatDuration, formatMoney } from '@salonpro/shared';
import type { Service } from '@salonpro/shared';
import { useApi, useDebounced } from '../../lib/hooks';
import { Button, Card, Drawer, EmptyState, Input, LoadingBlock, Tabs } from '../../components/ui';
import { IconClock, IconSearch } from '../../components/icons';

interface ServicesResponse {
  services: Service[];
  categories: string[];
}

export default function Services() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [selected, setSelected] = useState<Service | null>(null);
  const debouncedSearch = useDebounced(search, 200);

  const { data, isLoading, error } = useApi<ServicesResponse>('/catalog/services');

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = debouncedSearch.trim().toLowerCase();
    return data.services.filter((service) => {
      if (category !== 'all' && service.category !== category) return false;
      if (!term) return true;
      return (
        service.name.toLowerCase().includes(term) ||
        service.category.toLowerCase().includes(term) ||
        service.description.toLowerCase().includes(term)
      );
    });
  }, [data, category, debouncedSearch]);

  return (
    <div className="space-y-5 px-4 py-5">
      <div>
        <h1 className="font-display text-[24px] text-ink-900">Service catalogue</h1>
        <p className="mt-1 text-[13px] text-ink-400">
          Prices and durations are the salon's live rates. Combine services in one booking.
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <IconSearch size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search haircut, facial, spa…"
            className="pl-10"
          />
        </div>
        {data ? (
          <Tabs
            value={category}
            onChange={setCategory}
            tabs={[
              { id: 'all', label: 'All', count: data.services.length },
              ...data.categories.map((c) => ({
                id: c,
                label: c,
                count: data.services.filter((s) => s.category === c).length,
              })),
            ]}
          />
        ) : null}
      </div>

      {isLoading ? (
        <LoadingBlock rows={5} />
      ) : error ? (
        <Card>
          <EmptyState icon="⚠️" title="Could not load services" description={error.message} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔍"
            title="No services match that"
            description="Try a different category or clear your search."
            action={
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch('');
                  setCategory('all');
                }}
              >
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((service, index) => (
            <Card
              key={service.id}
              as="li"
              className="animate-fade-up flex cursor-pointer items-start gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-[22px]"
                style={{ animationDelay: `${index * 25}ms` }}
                onClick={() => setSelected(service)}
              >
                {service.imageEmoji}
              </div>
              <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(service)}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-semibold text-ink-900">{service.name}</p>
                  <p className="shrink-0 text-[15px] font-semibold text-brand-700">{formatMoney(service.price)}</p>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-400">{service.description}</p>
                <div className="mt-2 flex items-center gap-3 text-[11.5px] text-ink-400">
                  <span className="inline-flex items-center gap-1">
                    <IconClock size={12} /> {formatDuration(service.durationMinutes)}
                  </span>
                  <span className="rounded-full bg-ink-100 px-2 py-0.5">{service.category}</span>
                </div>
              </button>
              <button
                className="btn-brand btn-sm mt-1 shrink-0"
                onClick={() => navigate(`/app/book?service=${service.id}`)}
              >
                Book
              </button>
            </Card>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        subtitle={selected ? `${selected.category} · ${formatDuration(selected.durationMinutes)}` : undefined}
        footer={
          selected ? (
            <div className="flex gap-2">
              <Button
                variant="brand"
                className="flex-1"
                onClick={() => {
                  const id = selected.id;
                  setSelected(null);
                  navigate(`/app/book?service=${id}`);
                }}
              >
                Book this service
              </Button>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl bg-brand-soft p-4">
              <span className="text-4xl">{selected.imageEmoji}</span>
              <div>
                <p className="font-display text-[24px] text-ink-900">{formatMoney(selected.price)}</p>
                <p className="text-[12.5px] text-ink-500">{formatDuration(selected.durationMinutes)} appointment</p>
              </div>
            </div>
            <div>
              <h3 className="mb-1.5 text-[14px] font-semibold text-ink-800">What's included</h3>
              <p className="text-[13.5px] leading-relaxed text-ink-500">{selected.description}</p>
            </div>
            <div>
              <h3 className="mb-2 text-[14px] font-semibold text-ink-800">Good to know</h3>
              <ul className="space-y-1.5 text-[13px] text-ink-500">
                <li>• Your slot is held the moment you confirm and is checked for conflicts on the server.</li>
                <li>• Pay with your SalonPro wallet, online, or at the salon.</li>
                <li>• Eligible coupons are applied at checkout before payment.</li>
              </ul>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
