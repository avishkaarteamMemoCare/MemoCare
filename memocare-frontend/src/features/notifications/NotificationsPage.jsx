import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Settings2, Trash2, X } from 'lucide-react';
import { notificationService, patientService } from '../../api';
import { PageHeader, Card, Button, LoadingState, EmptyState, ErrorState } from '../../components/ui/primitives';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [showPrefs, setShowPrefs] = useState(false);
  const [inviteBusy, setInviteBusy] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['notifications', 'all'], queryFn: () => notificationService.list() });

  // Opening the Notifications tab clears the unread badge, so it does not stay
  // stuck on an old count after you have seen the list.
  const cleared = useRef(false);
  useEffect(() => {
    if (cleared.current || !data) return;
    cleared.current = true;
    if (!data.some((n) => !n.isRead)) return;
    notificationService
      .markAllRead()
      .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
      .catch(() => {});
  }, [data, qc]);

  const markRead = async (id) => {
    await notificationService.markRead(id);
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  // Delete one notification. Deleting one that is still unread clears it from
  // the badge too, because the list is refetched afterwards.
  const deleteOne = async (id) => {
    setDeletingId(id);
    try {
      await notificationService.remove(id);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    } finally {
      setDeletingId('');
    }
  };

  const answerInvite = async (n, accept) => {
    const token = n.metadata?.token;
    if (!token) return;
    setInviteBusy(n.id);
    setInviteError('');
    try {
      if (accept) {
        await patientService.acceptInvite(token);
      } else {
        await patientService.declineInvite(token);
      }
      await notificationService.markRead(n.id);
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['patient-links'] });
    } catch (err) {
      setInviteError(err.message || 'That invite could not be completed.');
    } finally {
      setInviteBusy('');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Resources"
        title="Notifications"
        actions={<Button variant="secondary" onClick={() => setShowPrefs(true)}><Settings2 size={15} /> Preferences</Button>}
      />
      {inviteError && <div className="auth-banner auth-banner-error" style={{ marginBottom: 12 }}>{inviteError}</div>}
      <Card style={{ padding: 0 }}>
        {isLoading && <div style={{ padding: 20 }}><LoadingState rows={4} /></div>}
        {isError && <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>}
        {data?.length === 0 && <div style={{ padding: 20 }}><EmptyState icon={<Bell size={26} />} title="No notifications yet" /></div>}
        {data?.map((n) => {
          const invite = n.metadata?.kind === 'PATIENT_LINK_INVITE' && n.metadata?.token;
          return (
            <div
              key={n.id}
              className="list-row"
              style={{ padding: '14px 20px', background: n.isRead ? 'transparent' : 'var(--primary-tint)', cursor: n.isRead ? 'default' : 'pointer' }}
              onClick={() => !n.isRead && !invite && markRead(n.id)}
            >
              <div>
                <div style={{ fontWeight: n.isRead ? 500 : 700 }}>{n.title || n.message}</div>
                {n.title && n.message && <div className="field-hint">{n.message}</div>}
                <div className="field-hint">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {invite && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    size="sm"
                    loading={inviteBusy === n.id}
                    disabled={Boolean(inviteBusy)}
                    onClick={() => answerInvite(n, true)}
                  >
                    <Check size={14} /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={Boolean(inviteBusy)}
                    onClick={() => answerInvite(n, false)}
                  >
                    <X size={14} /> Decline
                  </Button>
                </div>
              )}
              <button
                type="button"
                className="icon-btn"
                onClick={(e) => { e.stopPropagation(); deleteOne(n.id); }}
                disabled={deletingId === n.id}
                aria-label={`Delete notification: ${n.title || n.message}`}
                title="Delete this notification"
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 size={14} />
              </button>
              </div>
            </div>
          );
        })}
      </Card>
      {showPrefs && <PreferencesModal onClose={() => setShowPrefs(false)} />}
    </div>
  );
}

const NOTIFICATION_TYPES = [
  { key: 'TEST_REMINDER', label: 'Test reminders' },
  { key: 'RISK_ALERT', label: 'Risk alerts' },
  { key: 'LINK_INVITE', label: 'Patient invites' },
  { key: 'APPOINTMENT_REMINDER', label: 'Appointment reminders' },
  { key: 'MEDICATION_REMINDER', label: 'Medication reminders' },
  { key: 'LOCATION_ALERT', label: 'Location alerts' },
  { key: 'SYSTEM', label: 'Recovery news & system messages' },
];

function PreferencesModal({ onClose }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['notification-prefs'], queryFn: notificationService.listPreferences });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const prefFor = (type) => (data || []).find((p) => p.type === type) || { type, inAppEnabled: true, emailEnabled: true };

  const toggle = async (type, channel, current) => {
    setSaving(true);
    setError('');
    try {
      const pref = prefFor(type);
      await notificationService.setPreference({
        type,
        inAppEnabled: channel === 'inApp' ? !current : pref.inAppEnabled,
        emailEnabled: channel === 'email' ? !current : pref.emailEnabled,
      });
      qc.invalidateQueries({ queryKey: ['notification-prefs'] });
    } catch (err) {
      setError(err.message || 'Could not save that preference.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Notification preferences</h3>
        {error && <div className="auth-banner auth-banner-error">{error}</div>}
        {isLoading ? (
          <LoadingState rows={3} />
        ) : (
          <table style={{ width: '100%', fontSize: 13.5 }}>
            <thead>
              <tr><th style={{ textAlign: 'left' }}>Type</th><th>In-app</th><th>Email</th></tr>
            </thead>
            <tbody>
              {NOTIFICATION_TYPES.map(({ key, label }) => {
                const pref = prefFor(key);
                return (
                  <tr key={key}>
                    <td style={{ padding: '8px 0' }}>{label}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!pref.inAppEnabled} disabled={saving} onChange={() => toggle(key, 'inApp', pref.inAppEnabled)} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!pref.emailEnabled} disabled={saving} onChange={() => toggle(key, 'email', pref.emailEnabled)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
