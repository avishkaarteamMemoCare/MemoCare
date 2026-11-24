import { http, unwrap } from './client';

export const storeService = {
  nearby: (params) => unwrap(http.get('/stores/nearby', { params })),
  locationName: (params) => unwrap(http.get('/stores/location-name', { params })),
  get: (storeId) => unwrap(http.get(`/stores/${storeId}`)),
  // Store-owner endpoints (MEDICAL_STORE role)
  mine: () => unwrap(http.get('/stores/me')),
  saveMine: (body) => unwrap(http.post('/stores/me', body)),
  listMyMedicines: () => unwrap(http.get('/stores/me/medicines')),
  addMedicine: (body) => unwrap(http.post('/stores/me/medicines', body)),
  updateMedicine: (id, body) => unwrap(http.patch(`/stores/me/medicines/${id}`, body)),
  removeMedicine: (id) => http.delete(`/stores/me/medicines/${id}`),
  // Orders
  placeOrder: (storeId, body) => unwrap(http.post(`/stores/${storeId}/orders`, body)),
  myOrders: () => unwrap(http.get('/stores/orders/mine')),
  storeOrders: () => unwrap(http.get('/stores/me/orders')),
  updateOrderStatus: (orderId, status) =>
    unwrap(http.patch(`/stores/me/orders/${orderId}`, { status })),
};
