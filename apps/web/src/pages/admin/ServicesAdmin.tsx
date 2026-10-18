import { useState } from 'react';
import { formatMoney, rupeesToPaise, paiseToRupees } from '@salonpro/shared';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Select,
  Stat,
  Switch,
  Table,
  Td,
  Textarea,
} from '../../components/ui';
import { IconPlus, IconSearch } from '../../components/icons';

interface ServiceRow {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  durationMinutes: number;
  active: boolean;
  imageEmoji: string;
  sortOrder: number;
  completions: number;
  revenue: number;
}

const EMPTY = {
  id: '',
  name: '',
  category: 'Hair',
  description: '',
  price: '',
  durationMinutes: '45',
  active: true,
  imageEmoji: '✂️',
  sortOrder: '0',
};

export default function ServicesAdmin() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<typeof EMPTY | null>(null);

  const { data, isLoading, refetch } = useApi<{ services: ServiceRow[] }>('/admin/services');

  const save = useApiMutation<Record<string, unknown>, { service: ServiceRow }>(
    'POST',
    (body) => (body.id ? `/admin/services/${body.id}` : '/admin/services'),
    {
      onSuccess: () => {
        toast.success('Service saved');
        setEditor(null);
        refetch();
      },
    },
  );

  const services = data?.services ?? [];
  const categories = [...new Set(services.map((s) => s.category))];
  const filtered = services.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase()),
  );

  const submit = async (draft: typeof EMPTY) => {
    const price = rupeesToPaise(Number(draft.price));
    if (!draft.name.trim() || !draft.category.trim() || !price) {
      toast.error('Please complete the required fields');
      return;
    }
    try {
      await save.mutateAsync({
        id: draft.id || undefined,
        name: draft.name.trim(),
        category: draft.category.trim(),
        description: draft.description,
        price,
        durationMinutes: Number(draft.durationMinutes) || 30,
        active: draft.active,
        imageEmoji: draft.imageEmoji || '✂️',
        sortOrder: Number(draft.sortOrder) || 0,
      } as never);
    } catch (err) {
      toast.error('Could not save the service', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900">Services</h1>
          <p className="mt-1 text-[13.5px] text-ink-400">Menu, pricing and performance. Prices include GST where applicable.</p>
        </div>
        <Button variant="brand" onClick={() => setEditor({ ...EMPTY })}>
          <IconPlus size={15} /> New service
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Services" value={services.length} />
        <Stat label="Active" value={services.filter((s) => s.active).length} />
        <Stat label="Categories" value={categories.length} />
        <Stat
          tone="brand"
          label="Lifetime service revenue"
          value={formatMoney(services.reduce((s, x) => s + x.revenue, 0))}
        />
      </div>

      <div className="relative max-w-md">
        <IconSearch size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <Input className="pl-10" placeholder="Search services or categories" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <LoadingBlock rows={6} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon="✂️" title="No services yet" description="Add your first service to start taking bookings." />
        </Card>
      ) : (
        <Card>
          <Table head={['Service', 'Category', 'Duration', 'Price', 'Completions', 'Revenue', 'Status', '']}>
            {filtered.map((service) => (
              <tr key={service.id} className="hover:bg-ink-50">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{service.imageEmoji}</span>
                    <div>
                      <p className="font-medium text-ink-800">{service.name}</p>
                      <p className="max-w-[280px] truncate text-[11.5px] text-ink-400">{service.description}</p>
                    </div>
                  </div>
                </Td>
                <Td>
                  <Badge tone="muted">{service.category}</Badge>
                </Td>
                <Td>{service.durationMinutes} min</Td>
                <Td className="font-semibold text-ink-900">{formatMoney(service.price)}</Td>
                <Td>{service.completions}</Td>
                <Td>{formatMoney(service.revenue)}</Td>
                <Td>{service.active ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Hidden</Badge>}</Td>
                <Td>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setEditor({
                        id: service.id,
                        name: service.name,
                        category: service.category,
                        description: service.description,
                        price: String(paiseToRupees(service.price)),
                        durationMinutes: String(service.durationMinutes),
                        active: service.active,
                        imageEmoji: service.imageEmoji,
                        sortOrder: String(service.sortOrder),
                      })
                    }
                  >
                    Edit
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Drawer
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.id ? 'Edit service' : 'New service'}
        subtitle="Changes appear on the customer app immediately"
        width="max-w-lg"
      >
        {editor ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[80px_1fr]">
              <Field label="Emoji">
                <Input
                  value={editor.imageEmoji}
                  maxLength={4}
                  className="text-center text-xl"
                  onChange={(e) => setEditor({ ...editor, imageEmoji: e.target.value })}
                />
              </Field>
              <Field label="Service name">
                <Input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="Signature Haircut" />
              </Field>
            </div>
            <Field label="Category">
              <Input
                value={editor.category}
                list="service-categories"
                onChange={(e) => setEditor({ ...editor, category: e.target.value })}
                placeholder="Hair"
              />
              <datalist id="service-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Description">
              <Textarea value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} placeholder="What's included…" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Price (₹)">
                <Input value={editor.price} inputMode="decimal" onChange={(e) => setEditor({ ...editor, price: e.target.value.replace(/[^\d.]/g, '') })} placeholder="799" />
              </Field>
              <Field label="Duration (minutes)">
                <Select value={editor.durationMinutes} onChange={(e) => setEditor({ ...editor, durationMinutes: e.target.value })}>
                  {[15, 30, 45, 60, 75, 90, 120, 180, 240].map((m) => (
                    <option key={m} value={String(m)}>
                      {m} min
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Sort order" hint="Lower numbers appear first in the customer app.">
              <Input value={editor.sortOrder} inputMode="numeric" onChange={(e) => setEditor({ ...editor, sortOrder: e.target.value.replace(/[^\d-]/g, '') })} />
            </Field>
            <div className="rounded-xl border border-ink-100 p-4">
              <Switch
                checked={editor.active}
                onChange={(next) => setEditor({ ...editor, active: next })}
                label="Available for booking"
                description="Hidden services stay in historical records but cannot be booked."
              />
            </div>
            <Button variant="brand" size="lg" className="w-full" loading={save.isPending} onClick={() => void submit(editor)}>
              {editor.id ? 'Save changes' : 'Create service'}
            </Button>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
