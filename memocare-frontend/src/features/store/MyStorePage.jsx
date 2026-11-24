import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Store, Plus, Trash2, Pencil, MapPin, ShoppingBag } from 'lucide-react';
import { storeService } from '../../api';
import { usePlaceName } from '../../hooks/usePlaceName';
import { PageHeader, Card, Button, Badge, FormRow, LoadingState, EmptyState, ErrorState } from '../../components/ui/primitives';

const MAX_MEDICINES = 50;

export default function MyStorePage() {
  const qc = useQueryClient();
  const [showMedicineForm, setShowMedicineForm] = useState(null); // null | 'new' | medicine object

  const storeQuery = useQuery({
    queryKey: ['my-store'],
    queryFn: storeService.mine,
    retry: false,
  });

  const ordersQuery = useQuery({
    queryKey: ['store-orders'],
    queryFn: storeService.storeOrders,
    enabled: !storeQuery.isError,
  });

  const notSetUp = storeQuery.isError && /have not set up/i.test(storeQuery.error?.message || '');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['my-store'] });

  if (storeQuery.isLoading) return <LoadingState rows={5} />;

  if (notSetUp) {
    return (
      <div>
        <PageHeader eyebrow="Medical Store" title="Set up your store" description="Create your store profile to start listing medicines." />
        <StoreProfileForm store={null} onSaved={invalidate} />
      </div>
    );
  }

  if (storeQuery.isError) {
    return <ErrorState error={storeQuery.error} onRetry={storeQuery.refetch} />;
  }

  const store = storeQuery.data;
  const medicines = store?.medicines || [];

  return (
    <div>
      <PageHeader
        eyebrow="Medical Store"
        title={store.storeName}
        description={`${store.address}${store.city ? `, ${store.city}` : ''}${store.taluka ? ` (${store.taluka})` : ''}${store.openTime && store.closeTime ? ` · Open ${store.openTime}–${store.closeTime}` : ''}`}
      />

      <div className="overview-grid">
        <StoreProfileForm store={store} onSaved={invalidate} />

        <Card className="overview-span-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Medicines <span className="field-hint">({medicines.length} / {MAX_MEDICINES})</span></h3>
            <Button size="sm" onClick={() => setShowMedicineForm('new')} disabled={medicines.length >= MAX_MEDICINES}>
              <Plus size={14} /> Add medicine
            </Button>
          </div>

          {medicines.length === 0 && (
            <EmptyState icon={<Store size={26} />} title="No medicines listed yet" description="Add your first medicine to appear in nearby searches." />
          )}

          {medicines.map((m) => (
            <div className="list-row" key={m.id}>
              <div>
                <div style={{ fontWeight: 600 }}>{m.name}</div>
                <div className="field-hint">₹{m.price} · {m.quantity ?? 0} in stock</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button size="sm" variant="ghost" onClick={() => setShowMedicineForm(m)}><Pencil size={13} /></Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!window.confirm(`Remove ${m.name} from your store?`)) return;
                    await storeService.removeMedicine(m.id);
                    invalidate();
                  }}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          ))}
        </Card>

        <Card className="overview-span-2">
          <h3 style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={17} /> Incoming orders
            <span className="field-hint">({ordersQuery.data?.length ?? 0})</span>
          </h3>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            Every cart a customer books against your store appears here, and a notification is sent to this dashboard.
          </p>
          {ordersQuery.isLoading && <LoadingState rows={3} />}
          {ordersQuery.isError && <ErrorState error={ordersQuery.error} onRetry={ordersQuery.refetch} />}
          {ordersQuery.data?.length === 0 && (
            <EmptyState icon={<ShoppingBag size={24} />} title="No orders yet" description="Orders placed from the Medical Stores page will show up here." />
          )}
          {ordersQuery.data?.map((order) => (
            <OrderRow key={order.id} order={order} onChanged={() => qc.invalidateQueries({ queryKey: ['store-orders'] })} />
          ))}
        </Card>
      </div>

      {showMedicineForm && (
        <MedicineModal
          medicine={showMedicineForm === 'new' ? null : showMedicineForm}
          onClose={() => setShowMedicineForm(null)}
          onSave={async (body) => {
            if (showMedicineForm === 'new') {
              await storeService.addMedicine(body);
            } else {
              await storeService.updateMedicine(showMedicineForm.id, body);
            }
            setShowMedicineForm(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function StoreProfileForm({ store, onSaved }) {
  const [form, setForm] = useState({
    storeName: store?.storeName || '',
    address: store?.address || '',
    city: store?.city || '',
    taluka: store?.taluka || '',
    latitude: store?.latitude ?? '',
    longitude: store?.longitude ?? '',
    phone: store?.phone || '',
    openTime: store?.openTime || '',
    closeTime: store?.closeTime || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const placeName = usePlaceName(form.latitude, form.longitude);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      let place = null;
      try {
        place = await storeService.locationName({ latitude, longitude });
      } catch {
        /* keep the coordinates even if the name lookup fails */
      }
      setForm((f) => ({
        ...f,
        latitude,
        longitude,
        // Fill in what the lookup found, without overwriting anything typed by hand.
        city: f.city || place?.city || '',
        taluka: f.taluka || place?.place || '',
        address: f.address || [place?.place, place?.city].filter(Boolean).join(', '),
      }));
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      await storeService.saveMine({
        storeName: form.storeName,
        address: form.address,
        city: form.city,
        taluka: form.taluka,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        phone: form.phone || undefined,
        openTime: form.openTime || undefined,
        closeTime: form.closeTime || undefined,
      });
      await onSaved();
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Could not save your store.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <h3 style={{ marginBottom: 14 }}>Store profile</h3>
      {error && <div className="auth-banner auth-banner-error">{error}</div>}
      {saved && <div className="auth-banner auth-banner-success">Store saved.</div>}
      <form onSubmit={submit}>
        <FormRow label="Store name"><input required value={form.storeName} onChange={set('storeName')} /></FormRow>
        <FormRow label="Address"><input required value={form.address} onChange={set('address')} /></FormRow>
        <div style={{ display: 'flex', gap: 10 }}>
          <FormRow label="City"><input required value={form.city} onChange={set('city')} placeholder="e.g. Pune" /></FormRow>
          <FormRow label="Taluka"><input required value={form.taluka} onChange={set('taluka')} placeholder="e.g. Haveli" /></FormRow>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <FormRow label="Latitude"><input required type="number" step="any" value={form.latitude} onChange={set('latitude')} /></FormRow>
          <FormRow label="Longitude"><input required type="number" step="any" value={form.longitude} onChange={set('longitude')} /></FormRow>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={useMyLocation} style={{ marginBottom: placeName ? 6 : 14 }}>
          <MapPin size={13} /> Use my current location
        </Button>
        {placeName && (
          <p className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <MapPin size={13} /> {placeName}
          </p>
        )}
        <FormRow label="Phone (optional)"><input value={form.phone} onChange={set('phone')} /></FormRow>
        <div style={{ display: 'flex', gap: 10 }}>
          <FormRow label="Opens at"><input type="time" value={form.openTime} onChange={set('openTime')} /></FormRow>
          <FormRow label="Closes at"><input type="time" value={form.closeTime} onChange={set('closeTime')} /></FormRow>
        </div>
        <Button type="submit" loading={loading}>Save store</Button>
      </form>
    </Card>
  );
}

const ORDER_STATUS_TONE = { PLACED: 'warning', READY: 'info', COMPLETED: 'success', CANCELLED: 'neutral' };

function OrderRow({ order, onChanged }) {
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const setStatus = async (status) => {
    setSaving(status);
    setError('');
    try {
      await storeService.updateOrderStatus(order.id, status);
      await onChanged();
    } catch (err) {
      setError(err.message || 'Could not update this order.');
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="list-row" style={{ alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontWeight: 600 }}>
          {order.customerName} · ₹{Number(order.total).toFixed(2)}{' '}
          <Badge tone={ORDER_STATUS_TONE[order.status] || 'neutral'}>{order.status}</Badge>
        </div>
        <div className="field-hint">
          {order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}
        </div>
        <div className="field-hint">Deliver to: {order.deliveryAddress}</div>
        <div className="field-hint">
          Contact: {order.customerPhone} · {new Date(order.createdAt).toLocaleString()}
        </div>
        {order.notes && <div className="field-hint">Notes: {order.notes}</div>}
        {error && <div className="field-error">{error}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {order.status === 'PLACED' && (
          <Button size="sm" variant="secondary" loading={saving === 'READY'} onClick={() => setStatus('READY')}>Mark ready</Button>
        )}
        {order.status === 'READY' && (
          <Button size="sm" loading={saving === 'COMPLETED'} onClick={() => setStatus('COMPLETED')}>Mark completed</Button>
        )}
        {(order.status === 'PLACED' || order.status === 'READY') && (
          <Button size="sm" variant="ghost" loading={saving === 'CANCELLED'} onClick={() => setStatus('CANCELLED')}>Cancel</Button>
        )}
      </div>
    </div>
  );
}

function MedicineModal({ medicine, onClose, onSave }) {
  const [form, setForm] = useState({
    name: medicine?.name || '',
    price: medicine?.price ?? '',
    quantity: medicine?.quantity ?? 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSave({ name: form.name, price: Number(form.price), quantity: Number(form.quantity) });
    } catch (err) {
      setError(err.message || 'Could not save this medicine.');
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>{medicine ? 'Edit medicine' : 'Add medicine'}</h3>
        {error && <div className="auth-banner auth-banner-error">{error}</div>}
        <form onSubmit={submit}>
          <FormRow label="Name"><input required value={form.name} onChange={set('name')} /></FormRow>
          <div style={{ display: 'flex', gap: 10 }}>
            <FormRow label="Price"><input required type="number" step="0.01" min="0" value={form.price} onChange={set('price')} /></FormRow>
            <FormRow label="Quantity in stock"><input required type="number" step="1" min="0" value={form.quantity} onChange={set('quantity')} /></FormRow>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={loading}>{medicine ? 'Save' : 'Add'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
