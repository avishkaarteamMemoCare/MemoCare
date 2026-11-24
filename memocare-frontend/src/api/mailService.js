import { http, unwrap } from './client';

export const mailService = {
  // The signed-in user's own inbox (matched on their account email).
  inbox: () => unwrap(http.get('/mail/inbox')),
  deleteInbox: (mailId) => http.delete(`/mail/inbox/${mailId}`),
  // Hospital-management accounts the signed-in user can write to.
  admins: () => unwrap(http.get('/mail/admins')),
  contactAdmin: (body) => unwrap(http.post('/mail/contact', body)),
  settings: () => unwrap(http.get('/admin/mail/settings')),
  saveSettings: (body) => unwrap(http.put('/admin/mail/settings', body)),
  testConnection: (body = {}) => unwrap(http.post('/admin/mail/test-connection', body)),
  sendTest: (to) => unwrap(http.post('/admin/mail/test-email', to ? { to } : {})),
  recipients: () => unwrap(http.get('/admin/mail/recipients')),
  send: (body) => unwrap(http.post('/admin/mail/send', body)),
  history: () => unwrap(http.get('/admin/mail/sent')),
  deleteSent: (mailId) => http.delete(`/admin/mail/sent/${mailId}`),
};
