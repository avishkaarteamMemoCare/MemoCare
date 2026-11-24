import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'memocare:store-cart';

function readCart() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.storeId && Array.isArray(parsed.items)) return parsed;
  } catch {
    /* a broken value should never stop the page from rendering */
  }
  return null;
}

/**
 * One cart at a time, tied to a single store (an order belongs to one pharmacy).
 * Saved in localStorage so a refresh does not lose what the customer picked.
 * Cart shape: { storeId, storeName, items: [{ medicineId, name, price, stock, quantity }] }
 */
export function useCart() {
  const [cart, setCart] = useState(readCart);

  useEffect(() => {
    try {
      if (cart?.items?.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage can be unavailable in private mode — the cart still works in memory */
    }
  }, [cart]);

  const addItem = useCallback((store, medicine) => {
    setCart((prev) => {
      if (prev && prev.storeId !== store.id) {
        const replace = window.confirm(
          `Your cart has items from ${prev.storeName}. Start a new cart for ${store.storeName}?`
        );
        if (!replace) return prev;
        prev = null;
      }
      const items = prev?.items ?? [];
      const existing = items.find((item) => item.medicineId === medicine.id);
      const nextItems = existing
        ? items.map((item) =>
            item.medicineId === medicine.id
              ? { ...item, quantity: Math.min(item.quantity + 1, medicine.quantity) }
              : item
          )
        : [
            ...items,
            {
              medicineId: medicine.id,
              name: medicine.name,
              price: medicine.price,
              stock: medicine.quantity,
              quantity: 1,
            },
          ];
      return { storeId: store.id, storeName: store.storeName, items: nextItems };
    });
  }, []);

  const setQuantity = useCallback((medicineId, quantity) => {
    setCart((prev) => {
      if (!prev) return prev;
      const items = prev.items
        .map((item) => (item.medicineId === medicineId ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0);
      return items.length ? { ...prev, items } : null;
    });
  }, []);

  const removeItem = useCallback((medicineId) => {
    setCart((prev) => {
      if (!prev) return prev;
      const items = prev.items.filter((item) => item.medicineId !== medicineId);
      return items.length ? { ...prev, items } : null;
    });
  }, []);

  const clear = useCallback(() => setCart(null), []);

  const itemCount = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const total = cart?.items?.reduce((sum, item) => sum + item.price * item.quantity, 0) ?? 0;
  const quantityFor = (medicineId) =>
    cart?.items?.find((item) => item.medicineId === medicineId)?.quantity ?? 0;

  return { cart, addItem, setQuantity, removeItem, clear, itemCount, total, quantityFor };
}
