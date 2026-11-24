import { useState } from 'react';
import { Minus, Plus, Trash2, ShoppingCart, X, MapPin, CheckCircle2, Receipt } from 'lucide-react';
import { storeService } from '../../api';
import { Card, Button, FormRow } from '../../components/ui/primitives';

/**
 * Editable cart + checkout for one store. Booking sends the order to the
 * backend, which stores it and notifies that store's dashboard.
 */
export default function CartDrawer({ cart, total, setQuantity, removeItem, clear, onClose, onBooked, onViewOrders, user }) {
  const [form, setForm] = useState({
    customerName: [user?.firstName, user?.lastName].filter(Boolean).join(' '),
    customerPhone: user?.phone || '',
    deliveryAddress: user?.address || '',
    notes: '',
  });
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState(null);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const book = async (event) => {
    event.preventDefault();
    if (!cart) return;
    setPlacing(true);
    setError('');
    try {
      const order = await storeService.placeOrder(cart.storeId, {
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        deliveryAddress: form.deliveryAddress.trim(),
        notes: form.notes.trim() || undefined,
        items: cart.items.map((item) => ({ medicineId: item.medicineId, quantity: item.quantity })),
      });
      setPlaced({ id: order.id, total: order.total, storeName: order.storeName || cart.storeName });
      clear();
      onBooked?.();
    } catch (err) {
      setError(err.message || 'Could not place your order.');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: 520, maxHeight: '86vh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingCart size={18} /> {placed ? 'Order booked' : 'Your cart'}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close cart"><X size={16} /></Button>
        </div>

        {placed ? (
          <div style={{ marginTop: 18 }}>
            <div className="auth-banner auth-banner-success" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Your order of ₹{Number(placed.total).toFixed(2)} was sent to <strong>{placed.storeName}</strong>.
                The store has been notified and will prepare it for delivery.
              </span>
            </div>
            <p className="field-hint">Order reference: {String(placed.id).slice(0, 8).toUpperCase()}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              {onViewOrders && (
                <Button variant="secondary" onClick={onViewOrders}>
                  <Receipt size={14} /> My orders
                </Button>
              )}
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : !cart ? (
          <p className="field-hint" style={{ marginTop: 16 }}>Your cart is empty. Add medicines from a store to get started.</p>
        ) : (
          <>
            <p className="field-hint" style={{ marginTop: 4 }}>Ordering from {cart.storeName}</p>

            <div style={{ margin: '12px 0' }}>
              {cart.items.map((item) => (
                <div className="list-row" key={item.medicineId}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div className="field-hint">₹{item.price} each · ₹{(item.price * item.quantity).toFixed(2)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Decrease ${item.name}`}
                      onClick={() => setQuantity(item.medicineId, item.quantity - 1)}
                    >
                      <Minus size={12} />
                    </Button>
                    <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{item.quantity}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Increase ${item.name}`}
                      disabled={item.quantity >= item.stock}
                      onClick={() => setQuantity(item.medicineId, item.quantity + 1)}
                    >
                      <Plus size={12} />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${item.name}`} onClick={() => removeItem(item.medicineId)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 14 }}>
              <span>Total</span>
              <span>₹{total.toFixed(2)}</span>
            </div>

            {error && <div className="auth-banner auth-banner-error">{error}</div>}

            <form onSubmit={book}>
              <FormRow label="Your name">
                <input required value={form.customerName} onChange={set('customerName')} />
              </FormRow>
              <FormRow label="Phone number">
                <input required value={form.customerPhone} onChange={set('customerPhone')} placeholder="e.g. 9876543210" />
              </FormRow>
              <FormRow label="Delivery address" hint="The store will deliver to this address.">
                <textarea
                  required
                  rows={3}
                  value={form.deliveryAddress}
                  onChange={set('deliveryAddress')}
                  placeholder="Flat / house, street, area, city, PIN code"
                />
              </FormRow>
              <FormRow label="Notes for the store (optional)">
                <input value={form.notes} onChange={set('notes')} placeholder="e.g. Call before delivery" />
              </FormRow>
              <p className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <MapPin size={13} /> Booking sends this order straight to the store's dashboard.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <Button type="button" variant="ghost" onClick={clear}>Empty cart</Button>
                <Button type="submit" loading={placing}>Book order</Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
