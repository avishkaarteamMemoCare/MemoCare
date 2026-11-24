import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Store, MapPin, ShoppingCart, Plus, Receipt, Check } from 'lucide-react';
import { storeService } from '../../api';
import { useCart } from '../../hooks/useCart';
import { usePlaceName } from '../../hooks/usePlaceName';
import { useAuth } from '../../auth/AuthContext';
import CartDrawer from './CartDrawer';
import MyOrdersDrawer from './MyOrdersDrawer';
import { PageHeader, Card, Button, Badge, LoadingState, EmptyState, ErrorState } from '../../components/ui/primitives';

// The nearest-store search can reach up to 50 km, so stores across Navi
// Mumbai (Vashi, Nerul, Belapur, Kharghar, Panvel, Ulwe …) are findable.
const RADIUS_OPTIONS = [2, 5, 10, 20, 30, 40, 50];

function isOpenNow(openTime, closeTime) {
  if (!openTime || !closeTime) return null;
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  // A closing time earlier than the opening time means the shop closes after midnight.
  return closeMinutes >= openMinutes
    ? minutesNow >= openMinutes && minutesNow < closeMinutes
    : minutesNow >= openMinutes || minutesNow < closeMinutes;
}

function openingHours(store) {
  if (!store.openTime || !store.closeTime) return 'Opening hours not listed';
  return `Open ${store.openTime}–${store.closeTime}`;
}

function HoursBadge({ store }) {
  if (!store.openTime || !store.closeTime) return <Badge tone="neutral">Hours not listed</Badge>;
  const open = isOpenNow(store.openTime, store.closeTime);
  return <Badge tone={open ? 'success' : 'danger'}>{open ? 'Open now' : 'Closed now'}</Badge>;
}

export default function StoresPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [coords, setCoords] = useState(null);
  const [locError, setLocError] = useState('');
  const [selected, setSelected] = useState(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [added, setAdded] = useState(null);

  const placeLabel = usePlaceName(coords?.latitude, coords?.longitude);
  const { cart, addItem, setQuantity, removeItem, clear, itemCount, total, quantityFor } = useCart();

  const useMyLocation = () => {
    setLocError('');
    if (!navigator.geolocation) {
      setLocError('Location is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => setLocError('Could not get your location. You can still browse once a location is set.')
    );
  };

  const storesQuery = useQuery({
    queryKey: ['stores-nearby', coords, radiusKm],
    queryFn: () => storeService.nearby({ latitude: coords.latitude, longitude: coords.longitude, radiusKm }),
    enabled: !!coords,
  });

  // Adding only fills the cart — the customer keeps browsing and books once,
  // from the cart, when they are ready.
  const addToCart = (store, medicine) => {
    addItem(store, medicine);
    setAdded({ name: medicine.name, storeName: store.storeName });
  };

  useEffect(() => {
    if (!added) return undefined;
    const timer = setTimeout(() => setAdded(null), 2500);
    return () => clearTimeout(timer);
  }, [added]);

  return (
    <div>
      <PageHeader
        eyebrow="Care"
        title="Medical Stores"
        description="Find nearby medical stores, their opening hours and medicine availability, then book what you need."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => setCartOpen(true)}>
              <ShoppingCart size={15} /> Cart{itemCount > 0 ? ` (${itemCount})` : ''}
            </Button>
            <Button variant="secondary" onClick={() => setOrdersOpen(true)}>
              <Receipt size={15} /> My orders
            </Button>
            <Button variant="secondary" onClick={useMyLocation}><MapPin size={15} /> Use my location</Button>
          </div>
        }
      />

      {locError && <div className="auth-banner auth-banner-error" style={{ maxWidth: 480 }}>{locError}</div>}

      {coords && (
        <div className="auth-banner auth-banner-success" style={{ maxWidth: 720, marginBottom: 16 }}>
          <MapPin size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Showing stores within {radiusKm} km of{' '}
          {placeLabel || `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`}
        </div>
      )}

      {!coords && !locError && (
        <EmptyState icon={<Store size={28} />} title="Share your location to see nearby stores" description="Nothing is shared until you choose to." />
      )}

      {coords && (
        <div className="overview-grid">
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Nearby stores</h3>
              <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)' }}>
                {RADIUS_OPTIONS.map((km) => (
                  <option key={km} value={km}>{km} km</option>
                ))}
              </select>
            </div>
            {storesQuery.isLoading && <LoadingState rows={4} />}
            {storesQuery.isError && <ErrorState error={storesQuery.error} onRetry={storesQuery.refetch} />}
            {storesQuery.data?.length === 0 && <EmptyState title="No stores found nearby" description="Try a larger radius — you can search up to 50 km." />}
            {storesQuery.data?.map((s) => (
              <div key={s.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => setSelected(s)}>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.storeName}</div>
                  <div className="field-hint">{[s.address, s.city, s.taluka ? `Taluka: ${s.taluka}` : null].filter(Boolean).join(', ')}</div>
                  <div className="field-hint" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                    <span>{openingHours(s)}</span>
                    <HoursBadge store={s} />
                  </div>
                </div>
                {s.distanceKm != null && <Badge tone="info">{s.distanceKm.toFixed(1)} km</Badge>}
              </div>
            ))}
          </Card>

          <Card>
            <h3 style={{ marginBottom: 12 }}>{selected ? selected.storeName : 'Store details'}</h3>
            {!selected && <p className="field-hint">Select a store to view its medicines and add them to your cart.</p>}
            {selected && (
              <StoreDetail
                store={selected}
                onAdd={addToCart}
                quantityFor={quantityFor}
                onViewCart={() => setCartOpen(true)}
                itemCount={cart?.storeId === selected.id ? itemCount : 0}
              />
            )}
          </Card>
        </div>
      )}

      {cartOpen && (
        <CartDrawer
          cart={cart}
          total={total}
          setQuantity={setQuantity}
          removeItem={removeItem}
          clear={clear}
          onClose={() => setCartOpen(false)}
          onBooked={() => {
            qc.invalidateQueries({ queryKey: ['stores-nearby'] });
            qc.invalidateQueries({ queryKey: ['store'] });
            qc.invalidateQueries({ queryKey: ['my-orders'] });
          }}
          onViewOrders={() => {
            setCartOpen(false);
            setOrdersOpen(true);
          }}
          user={user}
        />
      )}

      {ordersOpen && (
        <MyOrdersDrawer
          onClose={() => setOrdersOpen(false)}
          onViewCart={() => {
            setOrdersOpen(false);
            setCartOpen(true);
          }}
          hasCart={!!cart}
        />
      )}

      {added && (
        <div className="cart-toast" role="status">
          <Check size={14} />
          <span>{added.name} added to cart</span>
          <button type="button" className="cart-toast-link" onClick={() => setCartOpen(true)}>
            View cart ({itemCount})
          </button>
        </div>
      )}
    </div>
  );
}

function StoreDetail({ store, onAdd, quantityFor, onViewCart, itemCount }) {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['store', store.id], queryFn: () => storeService.get(store.id) });

  if (isLoading) return <LoadingState rows={3} />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div>
      <p style={{ fontSize: 13.5, marginBottom: 4 }}>{data.address}</p>
      <p className="field-hint" style={{ marginBottom: 4 }}>
        {[data.city, data.taluka ? `Taluka: ${data.taluka}` : null].filter(Boolean).join(', ')}
      </p>
      <p className="field-hint" style={{ marginBottom: 4 }}>{openingHours(data)}</p>
      <div style={{ marginBottom: 10 }}><HoursBadge store={data} /></div>
      {data.phone && <p className="field-hint" style={{ marginBottom: 12 }}>{data.phone}</p>}
      <h4 style={{ marginBottom: 8 }}>Medicines</h4>
      {(!data.medicines || data.medicines.length === 0) && <p className="field-hint">No catalog listed for this store.</p>}
      {data.medicines?.map((m) => {
        const inCart = quantityFor(m.id);
        return (
          <div className="mini-row" key={m.id}>
            <span>
              {m.name}
              <span className="field-hint"> · ₹{m.price}</span>
              {inCart > 0 && <span className="field-hint"> · {inCart} in cart</span>}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge tone={m.quantity > 0 ? 'success' : 'neutral'}>
                {m.quantity > 0 ? `In stock (${m.quantity})` : 'Out of stock'}
              </Badge>
              <Button size="sm" variant="secondary" disabled={m.quantity === 0} onClick={() => onAdd(data, m)}>
                <Plus size={12} /> Add to cart
              </Button>
            </span>
          </div>
        );
      })}
      {itemCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <span className="field-hint">{itemCount} item{itemCount === 1 ? '' : 's'} in your cart</span>
          <Button size="sm" variant="primary" onClick={onViewCart}>
            <ShoppingCart size={13} /> View cart & book
          </Button>
        </div>
      )}
    </div>
  );
}
