import { useQuery } from '@tanstack/react-query';
import { Receipt, X, MapPin } from 'lucide-react';
import { storeService } from '../../api';
import { Button, Badge, LoadingState, EmptyState, ErrorState } from '../../components/ui/primitives';

const STATUS_TONE = { PLACED: 'info', READY: 'warning', COMPLETED: 'success', CANCELLED: 'danger' };
const STATUS_LABEL = { PLACED: 'Placed', READY: 'Ready for pickup', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

/** "Monday, 23 Nov 2026 at 4:32 pm" — day, date and time of the order. */
export function formatOrderWhen(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

/**
 * Customer-side order history: everything this account has booked, newest
 * first, with the date/day/time, the store, and exactly what was ordered.
 */
export default function MyOrdersDrawer({ onClose, onViewCart, hasCart }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => storeService.myOrders(),
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: 560, maxHeight: '86vh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Receipt size={18} /> My orders
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close order history"><X size={16} /></Button>
        </div>

        {isLoading && <div style={{ marginTop: 12 }}><LoadingState rows={3} /></div>}
        {isError && <div style={{ marginTop: 12 }}><ErrorState error={error} onRetry={refetch} /></div>}
        {!isLoading && !isError && data?.length === 0 && (
          <div style={{ marginTop: 12 }}>
            <EmptyState
              icon={<Receipt size={26} />}
              title="No orders yet"
              description="Add medicines from a store to your cart and book them — your orders will be listed here."
            />
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {data?.map((order) => (
            <div key={order.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{order.store?.storeName || 'Medical store'}</span>
                  <Badge tone={STATUS_TONE[order.status] || 'neutral'}>
                    {STATUS_LABEL[order.status] || order.status}
                  </Badge>
                </div>
                <div className="field-hint" style={{ marginTop: 2 }}>{formatOrderWhen(order.createdAt)}</div>
                <div style={{ marginTop: 8 }}>
                  {order.items?.map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                      <span>{item.name} × {item.quantity}</span>
                      <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 8 }}>
                  <span>Total</span>
                  <span>₹{Number(order.total).toFixed(2)}</span>
                </div>
                {order.deliveryAddress && (
                  <div className="field-hint" style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <MapPin size={13} style={{ flexShrink: 0, marginTop: 2 }} /> {order.deliveryAddress}
                  </div>
                )}
                {order.notes && <div className="field-hint" style={{ marginTop: 4 }}>Note: {order.notes}</div>}
                <div className="field-hint" style={{ marginTop: 4 }}>
                  Order reference: {String(order.id).slice(0, 8).toUpperCase()}
                </div>
              </div>
            </div>
          ))}
        </div>

        {hasCart && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <Button onClick={onViewCart}>View cart</Button>
          </div>
        )}
      </div>
    </div>
  );
}
