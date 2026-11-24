import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, Trash2 } from 'lucide-react';
import { screeningService } from '../../../api';
import { Card, Button, Badge, LoadingState, EmptyState, ErrorState } from '../../../components/ui/primitives';
import FamilyRecognitionSection from './FamilyRecognitionSection';

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

function formatScore(a) {
  if (a.totalScore == null) return '';
  const base = a.maxPossibleScore ? `${a.totalScore} / ${a.maxPossibleScore}` : `${a.totalScore}`;
  return a.scorePercentage != null ? `${base} (${Math.round(a.scorePercentage)}%)` : base;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}


export default function ScreeningTab({ patient }) {
  return (
    <Routes>
      <Route index element={<ScreeningHome patient={patient} />} />
      <Route path="take/:testId" element={<TakeTest patient={patient} />} />
      <Route path="attempts/:attemptId" element={<AttemptResult patient={patient} />} />
      <Route path="family/*" element={<FamilyRecognitionSection patient={patient} />} />
    </Routes>
  );
}

// The 12-colour palette shared with the Color Pattern Recall game (same list
// the backend seeds its pattern pool from). Ordered display phase plays for
// each pattern_sequence item: colours appear one by one (1s each), then the
// pattern hides and the user waits out a countdown before answering.
const COLOR_PALETTE = [
  { name: 'Red', hex: '#E23B3B' }, { name: 'Blue', hex: '#2C6FE8' }, { name: 'Green', hex: '#2F9E5B' },
  { name: 'Yellow', hex: '#F5C518' }, { name: 'Purple', hex: '#7B4FD8' }, { name: 'Orange', hex: '#F08030' },
  { name: 'Pink', hex: '#EE6FA8' }, { name: 'Brown', hex: '#8B5A2B' }, { name: 'Black', hex: '#222222' },
  { name: 'White', hex: '#FFFFFF' }, { name: 'Grey', hex: '#9A9AA5' }, { name: 'Teal', hex: '#2FB8A8' },
];
const colorHex = (name) => (COLOR_PALETTE.find((c) => c.name.toLowerCase() === String(name).toLowerCase()) || {}).hex;

// Every game shows a short "Example" beside its question so the player always
// knows the shape of an acceptable answer before typing or tapping.
function ExampleNote({ children }) {
  return (
    <div className="field-hint" style={{ margin: '6px 0 12px', display: 'flex', gap: 5, alignItems: 'baseline' }}>
      <strong style={{ color: 'var(--primary-ink)', flexShrink: 0 }}>Example:</strong>
      <span>{children}</span>
    </div>
  );
}

function exampleForItem(item) {
  switch (item?.itemType) {
    case 'multiple_choice':
      return "tap the option you think is right, then press Next.";
    case 'image_naming':
      return "type the object's name in one word \u2014 like \u201ccup\u201d.";
    case 'word_recall':
      return "type the words separated by commas \u2014 like \u201cgarden, river, pencil\u201d.";
    default:
      return "type one word or a short phrase \u2014 like \u201cTuesday\u201d.";
  }
}

function ColorPatternPhase({ item, answers, setAnswer, canNext, next, error, submitting, isLast }) {
  const HIDE_AFTER_SECONDS = 5;
  // The server sends only the sequence that should be displayed (never the
  // answer key), so different seeded sequences are actually playable.
  const seq = Array.isArray(item.sequence) ? item.sequence : (item.choices || []).slice(0, 4);
  const [phase, setPhase] = useState('showing'); // 'showing' | 'hidden' | 'input'
  const [visibleIdx, setVisibleIdx] = useState(0);
  const [countLeft, setCountLeft] = useState(HIDE_AFTER_SECONDS);

  useEffect(() => {
    if (phase !== 'showing') return undefined;
    if (visibleIdx >= seq.length) {
      const t = setTimeout(() => setPhase('hidden'), 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisibleIdx((i) => i + 1), 1000);
    return () => clearTimeout(t);
  }, [phase, visibleIdx, seq.length]);

  useEffect(() => {
    if (phase !== 'hidden') return undefined;
    if (countLeft <= 0) {
      setPhase('input');
      return undefined;
    }
    const t = setTimeout(() => setCountLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countLeft]);

  const selected = Array.isArray(answers[item.id]) ? answers[item.id] : [];
  // A sequence may legitimately contain the same colour twice, so each tap adds
  // one card to the answer (duplicates allowed) and a card is removed by
  // clicking it in the answer row below — not by tapping the palette again.
  const addColor = (colorName) => {
    if (phase !== 'input') return;
    if (selected.length >= seq.length) return;
    setAnswer([...selected, colorName]);
  };
  const removeAt = (position) => {
    if (phase !== 'input') return;
    setAnswer(selected.filter((_, i) => i !== position));
  };

  return (
    <div>
      <div className="field-hint" style={{ marginBottom: 10 }}>
        {phase === 'showing' && 'Memorize the colours…'}
        {phase === 'hidden' && `Get ready… input opens in ${countLeft}s`}
        {phase === 'input' && `Now pick the colours back in the SAME order you saw them (${seq.length} cards). A colour can appear twice — tap it twice.`}
        {phase === 'input' && (
          <div style={{ display: 'flex', gap: 5, marginTop: 6, alignItems: 'baseline' }}>
            <strong style={{ color: 'var(--primary-ink)', flexShrink: 0 }}>Example:</strong>
            <span>if you saw Blue → Red → Blue, tap Blue, then Red, then Blue.</span>
          </div>
        )}
      </div>

      {phase !== 'input' && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '18px 0 22px' }}>
          {seq.map((c, i) => (
            <div
              key={i}
              style={{
                width: 66, height: 66, borderRadius: 14,
                background: phase === 'showing' && visibleIdx > i ? colorHex(c) : 'var(--line-soft)',
                border: '2px solid var(--line)',
                boxShadow: phase === 'showing' && visibleIdx > i ? 'var(--shadow-md)' : 'none',
                transition: 'background 0.25s ease',
              }}
              aria-label={phase === 'showing' && visibleIdx > i ? `Colour ${i + 1}` : 'Hidden colour'}
            />
          ))}
        </div>
      )}

      {phase === 'input' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, margin: '12px 0 16px', maxWidth: 420 }}>
            {COLOR_PALETTE.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => addColor(c.name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 9px', borderRadius: 10, cursor: 'pointer',
                  border: selected.includes(c.name) ? '2px solid var(--primary)' : '1px solid var(--line)',
                  background: selected.includes(c.name) ? 'var(--primary-tint)' : 'var(--paper-raised)',
                  fontSize: 12.5, fontWeight: 600,
                }}
              >
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: c.hex, border: '1px solid var(--line)', flexShrink: 0 }} />
                {c.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, minHeight: 38 }}>
            {Array.from({ length: seq.length }).map((_, i) => {
              const chosen = selected[i] ? COLOR_PALETTE.find((c) => c.name === selected[i]) : null;
              if (!chosen) {
                return (
                  <div
                    key={i}
                    aria-label={`Empty slot ${i + 1}`}
                    style={{ width: 96, height: 36, borderRadius: 10, border: '1px dashed var(--line)' }}
                  />
                );
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => removeAt(i)}
                  title="Remove this colour"
                  aria-label={`Remove ${chosen.name} from position ${i + 1}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    padding: '7px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 600,
                    border: '1px solid var(--line)', background: 'var(--paper-raised)',
                  }}
                >
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: chosen.hex, border: '1px solid var(--line)', flexShrink: 0 }} />
                  {chosen.name} ×
                </button>
              );
            })}
            {selected.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setAnswer([])}>Clear</Button>
            )}
          </div>
          <div className="field-hint" style={{ marginBottom: 10 }}>
            Your answer, in order: {selected.length ? selected.join(' → ') : '—'} ({selected.length}/{seq.length})
          </div>
          <Button onClick={next} disabled={!canNext} loading={submitting} style={{ width: '100%' }}>
            {isLast ? 'Submit' : 'Next'}
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Word Recall: the words are shown for a few seconds (received as `choices`),
 * then hidden, and the player types them back from memory. Scoring happens
 * server-side against the stored answer, so the words are not the answer field.
 */
function WordRecallPhase({ item, answers, setAnswer, next, submitting, isLast }) {
  const words = Array.isArray(item.choices) ? item.choices : [];
  const SHOW_SECONDS = 7;
  const [phase, setPhase] = useState('showing'); // 'showing' | 'input'
  const [left, setLeft] = useState(SHOW_SECONDS);

  useEffect(() => {
    if (phase !== 'showing') return undefined;
    if (left <= 0) {
      setPhase('input');
      return undefined;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left]);

  const value = answers[item.id] ?? '';
  const ready = String(value).trim().length > 0;

  return (
    <div>
      <div className="field-hint" style={{ marginBottom: 10 }}>
        {phase === 'showing'
          ? `Memorize these ${words.length} words — they hide in ${left}s.`
          : 'Now type the words you remember, in any order.'}
        {phase === 'input' && (
          <div style={{ display: 'flex', gap: 5, marginTop: 6, alignItems: 'baseline' }}>
            <strong style={{ color: 'var(--primary-ink)', flexShrink: 0 }}>Example:</strong>
            <span>“garden, river, pencil” — commas or spaces both work.</span>
          </div>
        )}
      </div>

      {phase === 'showing' ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', margin: '18px 0 22px' }}>
          {words.map((word) => (
            <div
              key={word}
              style={{
                padding: '14px 20px', borderRadius: 12, border: '1px solid var(--line)',
                background: 'var(--paper-raised)', fontWeight: 700, fontSize: 16,
              }}
            >
              {word}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="form-row" style={{ marginTop: 12 }}>
            <input
              autoFocus
              value={value}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type the words, separated by spaces or commas…"
            />
          </div>
          <Button onClick={next} disabled={!ready} loading={submitting} style={{ width: '100%', marginTop: 8 }}>
            {isLast ? 'Submit' : 'Next'}
          </Button>
        </>
      )}
    </div>
  );
}

function ScreeningHome({ patient }) {
  const qc = useQueryClient();
  const testsQuery = useQuery({ queryKey: ['screening-tests'], queryFn: screeningService.listTests });
  const attemptsQuery = useQuery({ queryKey: ['screening-attempts', patient.id], queryFn: () => screeningService.listAttempts(patient.id) });
  const [deletingId, setDeletingId] = useState('');
  const [clearing, setClearing] = useState(false);

  const refreshScores = () => {
    qc.invalidateQueries({ queryKey: ['screening-attempts', patient.id] });
    qc.invalidateQueries({ queryKey: ['progress-timeline', patient.id] });
    qc.invalidateQueries({ queryKey: ['progress-summary', patient.id] });
  };

  const deleteScore = async (attemptId) => {
    setDeletingId(attemptId);
    try {
      await screeningService.deleteAttempt(patient.id, attemptId);
      refreshScores();
    } finally {
      setDeletingId('');
    }
  };

  const clearScores = async () => {
    const count = attemptsQuery.data?.length || 0;
    if (!window.confirm(`Delete all ${count} screening and game score${count === 1 ? '' : 's'} for ${patient.firstName} ${patient.lastName}? This cannot be undone.`)) return;
    setClearing(true);
    try {
      await screeningService.clearAttempts(patient.id);
      refreshScores();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="overview-grid">
      <Card>
        <h3 style={{ marginBottom: 12 }}>Available tests</h3>
        {testsQuery.isLoading && <LoadingState rows={3} />}
        {testsQuery.isError && <ErrorState error={testsQuery.error} onRetry={testsQuery.refetch} />}
        {testsQuery.data?.length === 0 && <EmptyState icon={<ClipboardList size={26} />} title="No tests available yet" />}
        {testsQuery.data?.filter((t, index, all) => t.testType !== 'PATTERN_MEMORY' || index === all.findIndex((candidate) => candidate.testType === 'PATTERN_MEMORY')).map((t) => (
          <div key={t.id} className="list-row">
            <div>
              <div style={{ fontWeight: 600 }}>{t.title}</div>
              <div className="field-hint">{t.testType?.replaceAll('_', ' ')}</div>
            </div>
            <Button as={Link} to={`take/${t.id}`} size="sm">Take test</Button>
          </div>
        ))}
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 }}>
          <h3 style={{ margin: 0 }}>Past attempts & scores</h3>
          {attemptsQuery.data?.length > 0 && (
            <Button size="sm" variant="ghost" loading={clearing} onClick={clearScores}>
              <Trash2 size={13} /> Clear all scores
            </Button>
          )}
        </div>
        {attemptsQuery.isLoading && <LoadingState rows={3} />}
        {attemptsQuery.isError && <ErrorState error={attemptsQuery.error} onRetry={attemptsQuery.refetch} />}
        {attemptsQuery.data?.length === 0 && <p className="field-hint">No attempts yet.</p>}
        {attemptsQuery.data?.map((a) => (
          <div key={a.id} className="list-row" style={{ gap: 8 }}>
            <Link
              to={`attempts/${a.id}`}
              style={{ color: 'inherit', textDecoration: 'none', flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{a.test?.title || 'Screening test'}</div>
                <div className="field-hint">{formatDate(a.completedAt || a.startedAt)}</div>
              </div>
              <Badge tone="info">{formatScore(a) || 'In progress'}</Badge>
            </Link>
            <button
              type="button"
              className="icon-btn"
              onClick={() => deleteScore(a.id)}
              disabled={deletingId === a.id}
              aria-label={`Delete score: ${a.test?.title || 'screening test'}`}
              title="Delete this score"
              style={{ color: 'var(--danger)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </Card>

      <FamilyRecognitionLink />
    </div>
  );
}

function FamilyRecognitionLink() {
  return (
    <Card className="overview-span-2">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Family recognition</h3>
          <p className="field-hint" style={{ margin: '4px 0 0' }}>Add named family photos and take a "who is this?" quiz.</p>
        </div>
        <Button as={Link} to="family" size="sm">Open</Button>
      </div>
    </Card>
  );
}

function TakeTest({ patient }) {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    screeningService.getTest(testId).then(setTest).catch((e) => setError(e.message));
  }, [testId]);

  if (error) return <ErrorState error={{ message: error }} />;
  if (!test) return <LoadingState rows={4} />;

  const items = test.items || [];
  const item = items[index];
  const progressPct = items.length ? Math.round(((index) / items.length) * 100) : 0;
  const isPattern = item?.itemType === 'pattern_sequence' || test.testType === 'PATTERN_MEMORY';
  const isWordRecall = item?.itemType === 'word_recall' && Array.isArray(item?.choices) && item.choices.length > 0;
  const setAnswer = (val) => setAnswers((a) => ({ ...a, [item.id]: val }));
  const canNext = isPattern
    ? Array.isArray(answers[item?.id]) && answers[item?.id]?.length === (Array.isArray(item?.sequence) ? item.sequence.length : 4)
    : isWordRecall
    ? String(answers[item?.id] ?? '').trim().length > 0
    : answers[item?.id] != null && answers[item?.id] !== '';

  const next = async () => {
    if (index < items.length - 1) {
      setIndex((i) => i + 1);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = items.map((it) => ({ itemId: it.id, givenAnswer: answers[it.id] ?? '' }));
      const attempt = await screeningService.submit(patient.id, testId, payload);
      navigate(`../../attempts/${attempt.id}`, { relative: 'path', replace: true });
    } catch (err) {
      setError(err.message || 'Could not submit your answers.');
      setSubmitting(false);
    }
  };

  return (
    <Card style={{ maxWidth: 560 }}>
      <Link to="../.." relative="path" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 16 }}>
        <ArrowLeft size={14} /> Back to screening
      </Link>
      <div className="field-hint" style={{ marginBottom: 6 }}>Question {index + 1} of {items.length}</div>
      <div className="qa-progress-bar"><div className="qa-progress-fill" style={{ width: `${progressPct}%` }} /></div>

      {error && <div className="auth-banner auth-banner-error">{error}</div>}

      {isPattern ? (
        <ColorPatternPhase
          key={item.id}
          item={item}
          answers={answers}
          setAnswer={setAnswer}
          canNext={canNext}
          next={next}
          submitting={submitting}
          isLast={index === items.length - 1}
        />
      ) : isWordRecall ? (
        <WordRecallPhase
          key={item.id}
          item={item}
          answers={answers}
          setAnswer={setAnswer}
          next={next}
          submitting={submitting}
          isLast={index === items.length - 1}
        />
      ) : (
        <>
          <h3>{item?.prompt || item?.question}</h3>
          <ExampleNote>{exampleForItem(item)}</ExampleNote>

          {item?.mediaUrl && (
            <img
              src={item.mediaUrl}
              alt={item?.prompt ? `Picture for the question: ${item.prompt}` : 'Screening question picture'}
              style={{ maxWidth: '100%', borderRadius: 10, marginBottom: 14 }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}

          {item?.itemType === 'multiple_choice' && (
        <div style={{ marginTop: 12 }}>
          {(item.choices || []).map((choice) => (
            <button
              type="button"
              key={choice}
              className={`choice-option ${answers[item.id] === choice ? 'selected' : ''}`}
              onClick={() => setAnswer(choice)}
              aria-pressed={answers[item.id] === choice}
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      {(item?.itemType === 'text_answer' || item?.itemType === 'word_recall' || item?.itemType === 'image_naming' || !item?.itemType) && (
            <div className="form-row" style={{ marginTop: 12 }}>
              <input autoFocus value={answers[item?.id] ?? ''} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer…" />
            </div>
          )}

          <Button onClick={next} disabled={!canNext} loading={submitting} style={{ width: '100%', marginTop: 8 }}>
            {index < items.length - 1 ? 'Next' : 'Submit'}
          </Button>
        </>
      )}
    </Card>
  );
}

function AttemptResult({ patient }) {
  const { attemptId } = useParams();
  const [attempt, setAttempt] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    screeningService.getAttempt(patient.id, attemptId).then(setAttempt).catch(setError);
  }, [patient.id, attemptId]);

  if (error) return <ErrorState error={error} />;
  if (!attempt) return <LoadingState rows={4} />;

  return (
    <Card style={{ maxWidth: 560 }}>
      <Link to="../.." relative="path" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 16 }}>
        <ArrowLeft size={14} /> Back to screening
      </Link>
      <h3>{attempt.test?.title || 'Screening result'}</h3>
      <p className="field-hint">{formatDate(attempt.completedAt || attempt.startedAt, true)}</p>
      <div className="result-card">
        <div className="result-metric">
          <div className="result-metric-value">{formatScore(attempt) || '—'}</div>
          <div className="result-metric-label">Score</div>
        </div>
        {attempt.startedAt && attempt.completedAt &&
          new Date(attempt.completedAt).getTime() - new Date(attempt.startedAt).getTime() >= 1000 && (
          <div className="result-metric">
            <div className="result-metric-value">
              {formatDuration(new Date(attempt.completedAt).getTime() - new Date(attempt.startedAt).getTime())}
            </div>
            <div className="result-metric-label">Time taken</div>
          </div>
        )}
      </div>
      {attempt.answers?.length > 0 && (
        <>
          <h4 style={{ marginBottom: 8 }}>Item-by-item</h4>
          {attempt.answers.map((r, i) => (
            <div className="mini-row" key={r.id || i}>
              <span>{r.item?.prompt || `Item ${i + 1}`}</span>
              <Badge tone={r.isCorrect ? 'success' : 'danger'}>{r.isCorrect ? 'Correct' : 'Incorrect'}</Badge>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}
