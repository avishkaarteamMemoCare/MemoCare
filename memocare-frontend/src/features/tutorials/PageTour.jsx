import { useEffect } from 'react';
import { X, Lightbulb, Check } from 'lucide-react';
import { PAGE_TOURS } from './pageTourContent';
import './pageTour.css';

/**
 * One-time walkthrough for a sidebar page. It never closes on its own — the
 * user dismisses it with the X (or the “Got it” button / Escape). Backdrop
 * clicks deliberately do nothing: because it is shown only once, an accidental
 * click must not use it up.
 */
export default function PageTour({ pageKey, onClose }) {
  const content = PAGE_TOURS[pageKey];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!content) return null;

  return (
    <div className="tour-backdrop" role="presentation">
      <div
        className="tour-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-intro"
      >
        <button type="button" className="tour-close" onClick={onClose} aria-label="Close tutorial" title="Close tutorial">
          <X size={20} />
        </button>

        <div className="tour-eyebrow">Quick tour · shown once</div>
        <h2 id="tour-title" className="tour-title">{content.title}</h2>
        {content.intro && <p id="tour-intro" className="tour-intro">{content.intro}</p>}

        <ul className="tour-points">
          {content.points.map((point) => (
            <li key={point}>
              <span className="tour-check" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
              <span>{point}</span>
            </li>
          ))}
        </ul>

        {content.tip && (
          <div className="tour-tip">
            <Lightbulb size={16} />
            <span>{content.tip}</span>
          </div>
        )}

        <div className="tour-footer">
          <span className="tour-hint">You won’t see this again for this page.</span>
          <button type="button" className="tour-done" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
