import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, ChevronDown, ChevronUp, Send, Trash2 } from 'lucide-react';
import { mailService } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader, Card, Button, Badge, FormRow, LoadingState, EmptyState, ErrorState } from '../../components/ui/primitives';

const STATUS = {
  SENT: { label: 'Emailed', tone: 'success' },
  INBOX: { label: 'App inbox', tone: 'info' },
  FAILED: { label: 'Not delivered', tone: 'danger' },
};

const TAG_LABEL = {
  'admin-message': 'Message from hospital management',
  'user-message': 'Message from a care-team member',
  'risk-alert': 'Risk alert',
  'recovery-news': 'Recovery news',
  'screening-result': 'Screening result',
  'test-reminder': 'Test reminder',
  'appointment-reminder': 'Appointment reminder',
  'medication-reminder': 'Medication reminder',
  'location-alert': 'Location alert',
  'login-summary': 'Login summary',
  'smtp-test': 'SMTP test',
};

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export default function InboxPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['mail-inbox'],
    queryFn: mailService.inbox,
  });
  const [openId, setOpenId] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [note, setNote] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const canMessageAdmin = role !== 'ADMIN';

  // Delete one message from your own inbox.
  const deleteMail = async (id) => {
    setDeletingId(id);
    try {
      await mailService.deleteInbox(id);
      setOpenId((current) => (current === id ? null : current));
      qc.invalidateQueries({ queryKey: ['mail-inbox'] });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Resources"
        title="Mail"
        description="Messages from hospital management and from the people you share care with."
        actions={
          canMessageAdmin ? (
            <Button onClick={() => setShowCompose(true)}><Send size={15} /> Message management</Button>
          ) : undefined
        }
      />

      {note && <div className="auth-banner auth-banner-success" style={{ marginBottom: 12 }}>{note}</div>}

      <Card style={{ padding: 0 }}>
        {isLoading && <div style={{ padding: 20 }}><LoadingState rows={4} /></div>}
        {isError && <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>}
        {data?.length === 0 && (
          <div style={{ padding: 20 }}>
            <EmptyState
              icon={<Mail size={26} />}
              title="No mail yet"
              description={
                canMessageAdmin
                  ? 'Write to hospital management with the button above — and their replies arrive here.'
                  : 'Messages you send to a user arrive here, and so do the replies.'
              }
            />
          </div>
        )}
        {data?.map((item) => {
          const open = openId === item.id;
          const status = STATUS[item.status] || { label: item.status, tone: 'neutral' };
          return (
            <div key={item.id} className="list-row" style={{ padding: '14px 20px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Mail size={15} style={{ color: 'var(--accent-dark)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 700 }}>{item.subject}</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <div className="field-hint" style={{ marginTop: 2 }}>
                  From{' '}
                  <strong style={{ color: 'var(--ink)' }}>
                    {item.fromName || TAG_LABEL[item.tag] || 'MemoCare'}
                  </strong>
                  {item.fromRole ? ` · ${item.fromRole}` : ''} · {formatDate(item.createdAt)} · to {item.toEmail}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    color: 'var(--ink-soft)',
                    whiteSpace: 'pre-wrap',
                    display: open ? 'block' : '-webkit-box',
                    WebkitLineClamp: open ? 'unset' : 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {item.body || 'This message has no text body.'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setOpenId(open ? null : item.id)}
                  aria-expanded={open}
                >
                  {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {open ? 'Hide' : 'Read'}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => deleteMail(item.id)}
                  disabled={deletingId === item.id}
                  aria-label={`Delete message: ${item.subject}`}
                  title="Delete this message"
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </Card>

      {showCompose && (
        <ComposeToAdmin
          onClose={() => setShowCompose(false)}
          onSent={(count) => {
            setShowCompose(false);
            setNote(`Message sent to ${count} hospital management account${count === 1 ? '' : 's'}. It is in their Notifications tab.`);
            qc.invalidateQueries({ queryKey: ['mail-inbox'] });
          }}
        />
      )}
    </div>
  );
}

function ComposeToAdmin({ onClose, onSent }) {
  const adminsQuery = useQuery({ queryKey: ['mail-admins'], queryFn: mailService.admins });
  const admins = adminsQuery.data || [];
  const [adminId, setAdminId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await mailService.contactAdmin({
        adminId: adminId || undefined,
        subject,
        message,
      });
      onSent(result?.sent ?? result?.total ?? 1);
    } catch (err) {
      setError(err.message || 'The message could not be sent.');
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Message hospital management</h3>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Your message appears in the admin&apos;s Notifications tab, and in their Mail.
        </p>
        {error && <div className="auth-banner auth-banner-error">{error}</div>}
        <form onSubmit={submit}>
          <FormRow label="Send to" hint={adminsQuery.isLoading ? 'Loading hospital management accounts…' : undefined}>
            <select value={adminId} onChange={(e) => setAdminId(e.target.value)}>
              <option value="">All hospital management accounts</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName}
                  {a.hospital?.name ? ` — ${a.hospital.name}` : ''}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Subject">
            <input required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </FormRow>
          <FormRow label="Message">
            <textarea required rows={6} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </FormRow>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={loading}><Send size={14} /> Send message</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
