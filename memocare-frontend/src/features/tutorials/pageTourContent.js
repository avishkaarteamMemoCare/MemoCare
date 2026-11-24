import { NAV_INFO } from '../../components/ui/navInfoCatalog';

/**
 * One short walkthrough per sidebar option. Shown the first time a user opens
 * that option (and never again for that account). `intro` reuses the same
 * wording as the little "What is this?" info panel, so the two never drift.
 */
const tour = (pageKey, title, points, tip) => ({
  title,
  intro: NAV_INFO[pageKey],
  points,
  tip,
});

export const PAGE_TOURS = {
  '/dashboard': tour(
    '/dashboard',
    'Your dashboard, explained',
    [
      'The cards at the top summarise how many patients you follow and how they split across LOW, MODERATE and HIGH risk.',
      'The table underneath lists your patients — click any row to open their full record.',
      'Recent notifications appear at the bottom, so new results and care-team updates are visible the moment you sign in.',
      'Family and caretaker accounts see patient cards with quick actions instead of the staff table.',
      'A Medical Store account sees its own store page here instead of patient information.',
    ],
    'Start here each day: high-risk patients are the ones to review first.'
  ),
  '/patients': tour(
    '/patients',
    'Managing patients',
    [
      'Register a new patient with the button at the top of the page.',
      'Search by name to find someone quickly, then open their record to work with it.',
      'Each row shows the latest risk level so you can spot who needs attention.',
      'Dismissing a patient keeps their full history but moves them out of the active list.',
    ],
    'Only staff and hospital management can register or dismiss patients.'
  ),
  '/patients/dismissed': tour(
    '/patients/dismissed',
    'The dismissed archive',
    [
      'Patients who were dismissed stay here with all their results and history intact.',
      'Open a dismissed patient to review past recordings, screenings and reports.',
      'A patient can be readmitted at any time — nothing is deleted when they are dismissed.',
    ],
    'Use this when a family asks about a patient who is no longer in active care.'
  ),
  '/screening-tests': tour(
    '/screening-tests',
    'Screening tests',
    [
      'Browse the cognitive tests available (orientation, word recall, naming, pattern memory) and open one to start an attempt.',
      'Answers are scored on the server, so results cannot be changed from the browser.',
      'Past attempts are listed with their score and completion time.',
      'Hospital management can create, edit or deactivate tests from this page.',
    ],
    'A single attempt is a snapshot — the Progress tab shows the trend that actually matters.'
  ),
  '/mind-games': tour(
    '/mind-games',
    'Mind games',
    [
      'These are the friendly, game-style versions of the formal screening tests.',
      'Patients can play them at home — each game takes only a couple of minutes.',
      'Results feed the same progress tracking used by the clinical screening tests.',
      'Different pictures and colour sequences are drawn each attempt, so games stay fresh.',
    ],
    'Never push a patient to replay until they “pass” — an honest baseline is more useful.'
  ),
  '/stores': tour(
    '/stores',
    'Medical stores',
    [
      'Search nearby pharmacies and check which medicines are in stock before travelling.',
      'Each store shows its address, opening hours and listed medicines with prices.',
      'A Medical Store account manages its own store page and stock from its dashboard.',
    ],
    'Stock changes through the day — phone the store first for anything urgent.'
  ),
  '/guidance': tour(
    '/guidance',
    'Guidance articles',
    [
      'Short, practical guides for families and caretakers — recording a clean voice sample, understanding risk scores, medication safety and more.',
      'Open an article to read it in full; the list marks what you have already read.',
      'Articles are written to be used day-to-day, not as medical advice.',
    ],
    'Start with “How to record a good speech sample” — it improves every later result.'
  ),
  '/notifications': tour(
    '/notifications',
    'Notifications',
    [
      'Risk alerts, screening results, recovery news, appointment and medication reminders all arrive here.',
      'Unread items are highlighted — click one to mark it read.',
      'Use Preferences to choose, per notification type, whether you want in-app alerts and email.',
      'Alerts go to the doctor, hospital management and every linked family member.',
    ],
    'Every message is delivered to the recipient’s Mail page in the app; connecting SMTP in Admin → Mail Center also sends it to their real email address.'
  ),
  '/inbox': tour(
    '/inbox',
    'Your mail',
    [
      'Every message addressed to your account email is delivered here by the app itself, so it works even before an SMTP account is configured.',
      'Each account only sees its own mail — the recipient address decides the owner.',
      'Risk alerts, recovery news, screening results, reminders and messages from hospital management all arrive here.',
      'Open a message with Read to see the full text.',
    ],
    'When hospital management connects SMTP in Admin → Mail Center, the same messages also reach the real email inbox.'
  ),
  '/admin/mail': tour(
    '/admin/mail',
    'Mail Center',
    [
      'Demo mail needs no setup: choose a registered user, write a subject and message, press Send — it is stored and appears in that person’s Mail page immediately.',
      'The SMTP account section is optional. Connect Gmail, Brevo, Outlook or any provider only if you also want outside email addresses to receive mail.',
      'Send a test email once SMTP is connected, to confirm the server accepts your credentials.',
      'Delivery history shows every attempt — emailed, in-app only, or failed — including automated risk alerts, recovery news and login summaries.',
    ],
    'Working offline or without credentials? Demo delivery still routes every message to the right user.'
  ),
  '/admin/hospitals': tour(
    '/admin/hospitals',
    'Hospital management',
    [
      'Register hospitals and keep their name, address and invite code up to date.',
      'The invite code is what staff enter when they sign up; rotate it if it leaks.',
      'Patients and staff are grouped under their hospital for access control.',
    ],
    'Rotating an invite code does not affect staff who have already joined.'
  ),
  '/admin/staff-approvals': tour(
    '/admin/staff-approvals',
    'Staff approvals',
    [
      'New hospital staff stay pending until someone approves them here.',
      'Approve with the correct title (doctor, nurse, clinician, admin staff) — it controls clinical access.',
      'Reject an account that should not have access to your hospital.',
    ],
    'Approving is a clinical-access decision: check the person is really who they claim to be.'
  ),
  '/admin/users': tour(
    '/admin/users',
    'Managing users',
    [
      'See every account associated with your hospital — staff, family, caretakers and stores.',
      'Filter by role or status to find pending or suspended accounts.',
      'Suspend an account immediately if it should no longer have access.',
    ],
    'Suspension keeps the data; it only blocks sign-in until the account is reactivated.'
  ),
};
