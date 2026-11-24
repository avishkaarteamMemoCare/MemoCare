import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { haversineDistanceMeters } from './locationService';
import { notifyStoreOrder } from './notificationService';

export const MAX_MEDICINES_PER_STORE = 50;

export interface UpsertStoreInput {
  storeName: string;
  address: string;
  city?: string;
  taluka?: string;
  latitude: number;
  longitude: number;
  phone?: string;
  openTime?: string;
  closeTime?: string;
}

/**
 * Creates the store for this owner if they don't have one yet, or
 * updates their existing one — a MEDICAL_STORE account has exactly
 * one store, matching the @unique ownerId constraint in the schema.
 */
export async function upsertMyStore(ownerId: string, input: UpsertStoreInput) {
  return prisma.medicalStore.upsert({
    where: { ownerId },
    update: input,
    create: { ownerId, ...input },
  });
}

export async function getMyStore(ownerId: string) {
  const store = await prisma.medicalStore.findUnique({
    where: { ownerId },
    include: { medicines: { orderBy: { name: 'asc' } } },
  });
  if (!store) throw AppError.notFound('You have not set up a store yet — create one first');
  return store;
}

async function getOwnedStoreOrThrow(ownerId: string) {
  const store = await prisma.medicalStore.findUnique({ where: { ownerId } });
  if (!store) throw AppError.notFound('You have not set up a store yet — create one first');
  return store;
}

export async function addMedicine(ownerId: string, name: string, price: number, quantity = 0) {
  const store = await getOwnedStoreOrThrow(ownerId);

  const count = await prisma.storeMedicine.count({ where: { storeId: store.id } });
  if (count >= MAX_MEDICINES_PER_STORE) {
    throw AppError.badRequest(
      `This store already lists ${MAX_MEDICINES_PER_STORE} medicines, the maximum allowed. Remove one before adding another.`
    );
  }

  return prisma.storeMedicine.create({ data: { storeId: store.id, name, price, quantity } });
}

export async function updateMedicine(
  ownerId: string,
  medicineId: string,
  input: Partial<{ name: string; price: number; quantity: number }>
) {
  const store = await getOwnedStoreOrThrow(ownerId);
  const medicine = await prisma.storeMedicine.findUnique({ where: { id: medicineId } });
  if (!medicine || medicine.storeId !== store.id) throw AppError.notFound('Medicine not found in your store');
  return prisma.storeMedicine.update({ where: { id: medicineId }, data: input });
}

export async function deleteMedicine(ownerId: string, medicineId: string) {
  const store = await getOwnedStoreOrThrow(ownerId);
  const medicine = await prisma.storeMedicine.findUnique({ where: { id: medicineId } });
  if (!medicine || medicine.storeId !== store.id) throw AppError.notFound('Medicine not found in your store');
  await prisma.storeMedicine.delete({ where: { id: medicineId } });
}

export async function listMyMedicines(ownerId: string) {
  const store = await getOwnedStoreOrThrow(ownerId);
  return prisma.storeMedicine.findMany({ where: { storeId: store.id }, orderBy: { name: 'asc' } });
}

export async function getStoreById(storeId: string) {
  const store = await prisma.medicalStore.findUnique({
    where: { id: storeId },
    include: { medicines: { orderBy: { name: 'asc' } } },
  });
  if (!store) throw AppError.notFound('Store not found');
  return store;
}

export interface NearbyStoreResult {
  id: string;
  storeName: string;
  address: string;
  city: string | null;
  taluka: string | null;
  phone: string | null;
  openTime: string | null;
  closeTime: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  matchingMedicines: { id: string; name: string; price: number; quantity: number }[];
}

/**
 * Real nearby search: computes an actual great-circle distance (see
 * locationService.haversineDistanceMeters — the same math used for
 * safe-zone geofencing) from the given point to every store, filters
 * by radius, and sorts closest-first. Optionally filters to only
 * stores that stock a medicine matching the given name.
 */
export async function findNearbyStores(
  latitude: number,
  longitude: number,
  radiusKm = 20,
  medicineQuery?: string
): Promise<NearbyStoreResult[]> {
  const stores = await prisma.medicalStore.findMany({
    include: {
      medicines: medicineQuery
        ? { where: { name: { contains: medicineQuery, mode: 'insensitive' } } }
        : true,
    },
  });

  const results: NearbyStoreResult[] = [];
  for (const store of stores) {
    if (medicineQuery && store.medicines.length === 0) continue; // doesn't stock the searched medicine

    const distanceMeters = haversineDistanceMeters(latitude, longitude, store.latitude, store.longitude);
    const distanceKm = distanceMeters / 1000;
    if (distanceKm > radiusKm) continue;

    results.push({
      id: store.id,
      storeName: store.storeName,
      address: store.address,
      city: store.city ?? null,
      taluka: store.taluka ?? null,
      phone: store.phone,
      openTime: store.openTime,
      closeTime: store.closeTime,
      latitude: store.latitude,
      longitude: store.longitude,
      distanceKm: Math.round(distanceKm * 10) / 10,
      matchingMedicines: store.medicines.map((m) => ({ id: m.id, name: m.name, price: m.price, quantity: m.quantity })),
    });
  }

  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}

// ------------------------------------------------------------
// Orders (cart → booking)
// ------------------------------------------------------------

export interface CreateOrderInput {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  notes?: string;
  items: { medicineId: string; quantity: number }[];
}

/**
 * Turns a cart into a real order: re-checks every price and stock level on the
 * server (never trusts the browser), decrements stock, and notifies the store
 * owner with the delivery address and order contents.
 */
export async function createOrder(customerId: string, storeId: string, input: CreateOrderInput) {
  const store = await prisma.medicalStore.findUnique({
    where: { id: storeId },
    include: { medicines: { where: { id: { in: input.items.map((item) => item.medicineId) } } } },
  });
  if (!store) throw AppError.notFound('Store not found');
  if (store.ownerId === customerId) throw AppError.badRequest('You cannot place an order with your own store');

  const byId = new Map(store.medicines.map((medicine) => [medicine.id, medicine]));
  const lines = input.items.map((item) => {
    const medicine = byId.get(item.medicineId);
    if (!medicine) throw AppError.badRequest('One of these medicines is no longer listed by this store');
    if (medicine.quantity < item.quantity) {
      throw AppError.badRequest(`Only ${medicine.quantity} unit(s) of ${medicine.name} are in stock`);
    }
    return { medicine, quantity: item.quantity };
  });

  const total =
    Math.round(lines.reduce((sum, line) => sum + line.medicine.price * line.quantity, 0) * 100) / 100;

  // Everything happens in one transaction, but the remote database can be
  // slow (hundreds of ms to a few seconds per round-trip), so the default 5 s
  // budget is not enough for a large cart. Stock is decremented in a single
  // statement and the timeout is raised well above any realistic latency, so
  // booking works at any hour of the day.
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.storeOrder.create({
      data: {
        storeId,
        customerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        deliveryAddress: input.deliveryAddress,
        notes: input.notes,
        total,
        items: {
          create: lines.map((line) => ({
            medicineId: line.medicine.id,
            name: line.medicine.name,
            price: line.medicine.price,
            quantity: line.quantity,
          })),
        },
      },
      include: { items: true },
    });

    // One statement for every line instead of one UPDATE per line: a 19-item
    // cart stays inside the transaction instead of timing out.
    if (lines.length > 0) {
      const stockValues = lines.map(
        (line) => Prisma.sql`(${line.medicine.id}::text, ${line.quantity}::int)`
      );
      await tx.$executeRaw`
        UPDATE "StoreMedicine" AS m
        SET quantity = m.quantity - v.qty, "updatedAt" = NOW()
        FROM (VALUES ${Prisma.join(stockValues)}) AS v(id, qty)
        WHERE m.id = v.id
      `;
    }

    return created;
  }, { maxWait: 15000, timeout: 60000 });

  // The store's own dashboard is the recipient of the notification.
  await notifyStoreOrder(store.ownerId, {
    storeName: store.storeName,
    orderId: order.id,
    total,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    deliveryAddress: input.deliveryAddress,
    notes: input.notes,
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity, price: item.price })),
  });

  return { ...order, storeName: store.storeName };
}

/** Orders this user placed, newest first. */
export async function listMyOrders(customerId: string) {
  return prisma.storeOrder.findMany({
    where: { customerId },
    include: { items: true, store: { select: { storeName: true, address: true, phone: true, openTime: true, closeTime: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

/** Orders received by the store owned by this account, newest first. */
export async function listStoreOrders(ownerId: string) {
  const store = await getOwnedStoreOrThrow(ownerId);
  return prisma.storeOrder.findMany({
    where: { storeId: store.id },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function updateOrderStatus(ownerId: string, orderId: string, status: 'PLACED' | 'READY' | 'COMPLETED' | 'CANCELLED') {
  const store = await getOwnedStoreOrThrow(ownerId);
  const order = await prisma.storeOrder.findUnique({ where: { id: orderId } });
  if (!order || order.storeId !== store.id) throw AppError.notFound('Order not found');
  return prisma.storeOrder.update({ where: { id: orderId }, data: { status }, include: { items: true } });
}
