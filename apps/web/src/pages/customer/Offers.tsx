import { useNavigate } from 'react-router-dom';
import { formatDate, formatMoney, type RechargeOffer } from '@salonpro/shared';
import { useApi, useCopy } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import { Badge, Button, Card, EmptyState, LoadingBlock, SectionTitle } from '../../components/ui';
import { IconCopy, IconGift, IconSparkle, IconWallet } from '../../components/icons';

interface CouponRow {
  id: string;
  code: string;
  type: 'percent' | 'flat';
  value: number;
  minAmount: number;
  maxDiscount: number | null;
  startAt: string;
  endAt: string;
  usageLimit: number | null;
  usedCount: number;
  description: string;
}

interface OffersResponse {
  coupons: CouponRow[];
  rechargeOffers: RechargeOffer[];
  loyalty: { points: number; lifetimePoints: number };
}

function discountLabel(coupon: CouponRow) {
  if (coupon.type === 'percent') {
    const cap = coupon.maxDiscount ? ` up to ${formatMoney(coupon.maxDiscount)}` : '';
    return `${coupon.value}% off${cap}`;
  }
  return `${formatMoney(coupon.value)} off`;
}

export default function Offers() {
  const navigate = useNavigate();
  const toast = useToast();
  const { copied, copy } = useCopy();
  const { data, isLoading } = useApi<OffersResponse>('/customer/offers');

  if (isLoading) return <div className="px-4 py-5"><LoadingBlock rows={4} /></div>;

  return (
    <div className="space-y-6 px-4 py-5">
      <div>
        <h1 className="font-display text-[24px] text-ink-900">Offers &amp; rewards</h1>
        <p className="mt-1 text-[13px] text-ink-400">
          Live discounts and prepaid top-up offers at your salon. Tap a code to copy it.
        </p>
      </div>

      {/* Loyalty */}
      <Card className="flex items-center gap-4 bg-brand-soft p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-sheen text-ink-950 shadow-brand">
          <IconSparkle size={22} />
        </span>
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-ink-900">Loyalty points</p>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            {data?.loyalty.points ?? 0} points available · {data?.loyalty.lifetimePoints ?? 0} earned lifetime
          </p>
        </div>
        <span className="font-display text-[26px] text-ink-900">{data?.loyalty.points ?? 0}</span>
      </Card>

      {/* Recharge offers */}
      <section>
        <SectionTitle
          title="Prepaid top-up offers"
          subtitle="Pay once, get instant bonus value in your wallet"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/app/wallet')}>
              <IconWallet size={15} /> Wallet
            </Button>
          }
        />
        {data?.rechargeOffers.length ? (
          <div className="space-y-2.5">
            {data.rechargeOffers.map((offer) => (
              <button
                key={offer.id}
                onClick={() => navigate('/app/wallet')}
                className="card flex w-full items-center gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-brand-300">
                  <IconWallet size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[19px] text-ink-900">
                    Pay {formatMoney(offer.payAmount)}
                  </p>
                  <p className="mt-1 text-[12.5px] text-ink-500">
                    Get <span className="font-semibold text-mint-500">{formatMoney(offer.bonusAmount)}</span> bonus →{' '}
                    {formatMoney(offer.totalValue)} of salon value
                  </p>
                </div>
                {offer.label ? <Badge tone="brand">{offer.label}</Badge> : <IconSparkle size={18} className="text-brand-500" />}
              </button>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon="🎁" title="No top-up offers running" description="Check back soon — the salon can publish recharge bonus offers at any time." />
          </Card>
        )}
      </section>

      {/* Coupons */}
      <section>
        <SectionTitle title="Coupon codes" subtitle="Apply at checkout when you book" />
        {data?.coupons.length ? (
          <div className="space-y-3">
            {data.coupons.map((coupon) => {
              const remaining = coupon.usageLimit === null ? null : Math.max(0, coupon.usageLimit - coupon.usedCount);
              const soldOut = remaining !== null && remaining <= 0;
              return (
                <Card key={coupon.id} className="overflow-hidden">
                  <div className="flex items-stretch">
                    <div className="flex w-[132px] shrink-0 flex-col items-center justify-center gap-1 border-r border-dashed border-ink-200 bg-brand-soft px-3 py-4">
                      <IconGift size={22} className="text-brand-600" />
                      <p className="font-display text-[17px] font-bold tracking-wide text-ink-950">{coupon.code}</p>
                      <button
                        className="text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-50"
                        disabled={soldOut}
                        onClick={() => {
                          void copy(coupon.code);
                          toast.success('Code copied', `Paste ${coupon.code} at checkout.`);
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <IconCopy size={11} /> {copied ? 'Copied' : 'Copy'}
                        </span>
                      </button>
                    </div>
                    <div className="min-w-0 flex-1 p-3.5">
                      <div className="flex items-center gap-2">
                        <p className="text-[14.5px] font-semibold text-ink-900">{discountLabel(coupon)}</p>
                        {soldOut ? <Badge tone="muted">All used</Badge> : null}
                      </div>
                      <p className="mt-1 text-[12.5px] leading-snug text-ink-500">{coupon.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-400">
                        {coupon.minAmount > 0 ? <span>Min spend {formatMoney(coupon.minAmount)}</span> : <span>No minimum spend</span>}
                        <span>· Ends {formatDate(coupon.endAt.slice(0, 10))}</span>
                        {remaining !== null ? <span>· {remaining} left</span> : null}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon="🏷️"
              title="No coupons right now"
              description="Top-up bonus offers above are always the fastest way to save."
              action={
                <Button variant="brand" onClick={() => navigate('/app/book')}>
                  Book an appointment
                </Button>
              }
            />
          </Card>
        )}
      </section>

      <p className="pb-2 text-center text-[11px] text-ink-300">
        Offers are set by the salon owner and can change without notice. Bonus value is promotional and non-refundable.
      </p>
    </div>
  );
}
