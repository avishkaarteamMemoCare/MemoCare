import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LayoutGrid, MousePointerClick, RotateCcw, Timer, Trophy } from 'lucide-react';
import { patientService, screeningService } from '../../api';
import { PageHeader, Card, Button, Badge, LoadingState, EmptyState, ErrorState } from '../../components/ui/primitives';

// 4 x 4 board = 16 tiles = 8 matching pairs.
const OBJECTS = [
  { name: 'Apple', symbol: '🍎' },
  { name: 'Banana', symbol: '🍌' },
  { name: 'Grapes', symbol: '🍇' },
  { name: 'Watermelon', symbol: '🍉' },
  { name: 'Strawberry', symbol: '🍓' },
  { name: 'Mango', symbol: '🥭' },
  { name: 'Carrot', symbol: '🥕' },
  { name: 'Sunflower', symbol: '🌻' },
];
const PAIR_COUNT = OBJECTS.length;
const TILE_GAME_TITLE = 'Match the Tiles';

function shuffledDeck() {
  const cards = OBJECTS.flatMap((object) => [
    { ...object, id: `${object.name}-a` },
    { ...object, id: `${object.name}-b` },
  ]);
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// Perfect play is 8 matching moves; every extra move costs 5 points.
function scoreForMoves(moves) {
  return Math.max(5, Math.min(100, 100 - Math.max(0, moves - PAIR_COUNT) * 5));
}

function formatSeconds(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

function attemptSeconds(attempt) {
  if (!attempt?.startedAt || !attempt?.completedAt) return 0;
  return new Date(attempt.completedAt).getTime() - new Date(attempt.startedAt).getTime();
}

export default function MatchTilesPage() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const patientsQuery = useQuery({ queryKey: ['patients'], queryFn: patientService.list });
  const patients = patientsQuery.data || [];
  const [pickedPatientId, setPickedPatientId] = useState(params.get('patientId') || '');
  const patientId = pickedPatientId || patients[0]?.id || '';
  const patient = patients.find((p) => p.id === patientId);

  const [deck, setDeck] = useState(shuffledDeck);
  const [open, setOpen] = useState([]); // indices currently face-up (max 2)
  const [matchedIds, setMatchedIds] = useState([]);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finished, setFinished] = useState(false);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const savedRef = useRef(false);
  const hideTimerRef = useRef(null);

  const historyQuery = useQuery({
    queryKey: ['screening-attempts', patientId],
    queryFn: () => screeningService.listAttempts(patientId),
    enabled: Boolean(patientId),
  });
  const pastGames = useMemo(
    () => (historyQuery.data || []).filter((a) => a.test?.title === TILE_GAME_TITLE),
    [historyQuery.data]
  );

  const isFaceUp = (index) => open.includes(index) || matchedIds.includes(deck[index].id);

  const reset = () => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    savedRef.current = false;
    setDeck(shuffledDeck());
    setOpen([]);
    setMatchedIds([]);
    setMoves(0);
    setStartedAt(null);
    setElapsedMs(0);
    setFinished(false);
    setLocked(false);
    setSaveError('');
  };

  // A fresh board whenever the game is played for a different patient.
  useEffect(() => {
    reset();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [patientId]);

  // Live clock, from the first tile lifted until the board is cleared.
  useEffect(() => {
    if (!startedAt || finished) return undefined;
    const interval = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    return () => window.clearInterval(interval);
  }, [startedAt, finished]);

  // Board cleared: freeze the final time.
  useEffect(() => {
    if (finished || deck.length === 0 || matchedIds.length !== deck.length || !startedAt) return;
    setElapsedMs(Date.now() - startedAt);
    setFinished(true);
  }, [matchedIds.length, deck.length, finished, startedAt]);

  // Save the completed game once (score + time taken).
  useEffect(() => {
    if (!finished || savedRef.current || !patientId) return;
    savedRef.current = true;
    const elapsed = elapsedMs || (startedAt ? Date.now() - startedAt : 0);
    setSaving(true);
    screeningService
      .recordMatchTiles(patientId, { moves, pairs: PAIR_COUNT, elapsedMs: elapsed })
      .then(() => qc.invalidateQueries({ queryKey: ['screening-attempts', patientId] }))
      .catch((err) => setSaveError(err.message || 'The score could not be saved.'))
      .finally(() => setSaving(false));
  }, [finished, elapsedMs, moves, patientId, startedAt, qc]);

  const flip = (index) => {
    if (locked || finished || isFaceUp(index)) return;
    if (!startedAt) setStartedAt(Date.now());

    if (open.length === 0) {
      setOpen([index]);
      return;
    }
    const first = open[0];
    setMoves((m) => m + 1);

    if (deck[first].name === deck[index].name) {
      setMatchedIds((ids) => [...ids, deck[first].id, deck[index].id]);
      setOpen([]);
      return;
    }

    setOpen([first, index]);
    setLocked(true);
    hideTimerRef.current = window.setTimeout(() => {
      setOpen([]);
      setLocked(false);
    }, 800);
  };

  const score = scoreForMoves(moves);
  const matchedPairs = matchedIds.length / 2;

  if (patientsQuery.isLoading) return <LoadingState rows={4} />;
  if (patientsQuery.isError) return <ErrorState error={patientsQuery.error} onRetry={patientsQuery.refetch} />;
  if (patients.length === 0) {
    return (
      <div>
        <PageHeader eyebrow="Mind Games" title="Match the Tiles" />
        <EmptyState
          icon={<LayoutGrid size={28} />}
          title="No patients available"
          description="Games are played on behalf of a patient. Ask hospital management to assign one to you."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Mind Games"
        title="Match the Tiles"
        description="Lift the tiles two at a time and find the matching objects. The board is scored, and the time you take is recorded."
        actions={
          <Button as={Link} to="/mind-games" variant="secondary" size="sm">
            <ArrowLeft size={14} /> All games
          </Button>
        }
      />

      {patients.length > 1 && (
        <Card style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13.5, fontWeight: 600 }}>Playing as patient:</label>
          <select
            value={patientId}
            onChange={(e) => setPickedPatientId(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
            ))}
          </select>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <span className="field-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Timer size={15} /> Time: <strong style={{ color: 'var(--ink)' }}>{formatSeconds(elapsedMs)}</strong>
            </span>
            <span className="field-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <MousePointerClick size={15} /> Moves: <strong style={{ color: 'var(--ink)' }}>{moves}</strong>
            </span>
            <span className="field-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <LayoutGrid size={15} /> Pairs: <strong style={{ color: 'var(--ink)' }}>{matchedPairs}/{PAIR_COUNT}</strong>
            </span>
            {patient && <Badge tone="info">{patient.firstName} {patient.lastName}</Badge>}
            <span style={{ marginLeft: 'auto' }}>
              <Button size="sm" variant="ghost" onClick={reset}>
                <RotateCcw size={13} /> Restart
              </Button>
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 10,
              maxWidth: 460,
              margin: '0 auto',
            }}
          >
            {deck.map((card, index) => {
              const faceUp = isFaceUp(index);
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => flip(index)}
                  disabled={faceUp || finished}
                  aria-label={faceUp ? `${card.name} tile` : 'Face-down tile'}
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 16,
                    border: faceUp ? '2px solid var(--primary)' : '2px solid var(--line)',
                    background: faceUp
                      ? 'var(--paper-raised)'
                      : 'linear-gradient(145deg, var(--primary) 0%, var(--accent, #6d5bd0) 100%)',
                    color: faceUp ? 'inherit' : '#fff',
                    fontSize: 36,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: faceUp || finished ? 'default' : 'pointer',
                    transition: 'background 0.2s ease, transform 0.15s ease',
                    boxShadow: faceUp ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                    padding: 0,
                  }}
                >
                  {faceUp ? card.symbol : <span style={{ fontSize: 22, opacity: 0.8 }}>?</span>}
                </button>
              );
            })}
          </div>

          <p className="field-hint" style={{ marginTop: 14, marginBottom: 0 }}>
            Lift a tile, then lift a second one. Two matching objects stay face up; a wrong pair turns back over.
            Clear all {PAIR_COUNT} pairs to finish — perfect play is {PAIR_COUNT} moves.
          </p>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Trophy size={17} />
              <h3 style={{ margin: 0 }}>{finished ? 'Game complete' : 'Your score'}</h3>
            </div>

            {finished ? (
              <>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{score}</div>
                    <div className="field-hint">Score out of 100</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{formatSeconds(elapsedMs)}</div>
                    <div className="field-hint">Time taken</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{moves}</div>
                    <div className="field-hint">Moves</div>
                  </div>
                </div>
                <p className="field-hint" style={{ marginTop: 0 }}>
                  {saving
                    ? "Saving this score to the patient's history…"
                    : saveError
                      ? `Score not saved: ${saveError}`
                      : 'Saved to the patient\'s screening & game history.'}
                </p>
                <Button onClick={reset}>
                  <RotateCcw size={15} /> Play again
                </Button>
              </>
            ) : (
              <>
                <p className="field-hint" style={{ marginTop: 0 }}>
                  Start lifting tiles — the clock begins on your first tile. Finish all {PAIR_COUNT} pairs to see
                  your score.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 26, fontWeight: 800 }}>{matchedPairs}/{PAIR_COUNT}</span>
                  <span className="field-hint">pairs matched</span>
                </div>
              </>
            )}
          </Card>

          <Card>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>Past games</h3>
            <p className="field-hint" style={{ marginTop: 0 }}>Score and time for the last few rounds.</p>
            {historyQuery.isLoading && <LoadingState rows={2} />}
            {historyQuery.isError && <ErrorState error={historyQuery.error} onRetry={historyQuery.refetch} />}
            {!historyQuery.isLoading && pastGames.length === 0 && (
              <p className="field-hint">No completed games yet for this patient.</p>
            )}
            {pastGames.slice(0, 6).map((attempt) => (
              <div key={attempt.id} className="mini-row">
                <span>{new Date(attempt.completedAt || attempt.startedAt).toLocaleString()}</span>
                <span className="field-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Timer size={12} /> {formatSeconds(attemptSeconds(attempt))}
                </span>
                <Badge tone="info">{Math.round(attempt.scorePercentage ?? attempt.totalScore ?? 0)}/100</Badge>
              </div>
            ))}
            {pastGames.length > 0 && (
              <p className="field-hint" style={{ marginBottom: 0 }}>
                Scores can be deleted from the patient&apos;s Screening tab.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
