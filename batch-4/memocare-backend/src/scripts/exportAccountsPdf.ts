import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';

/**
 * Builds one printable PDF of every demo account in the database, grouped by
 * section, with the email and password needed to sign in.
 *
 * Run with:  npm run pdf:accounts
 * Writes:    ../MemoCare-Demo-Accounts.pdf  (project root)
 */

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'Password123!';
const STORE_SAMPLE_PASSWORD = '12345678';
const OUT_PATH = path.join(__dirname, '../../../MemoCare-Demo-Accounts.pdf');

type Row = { name: string; email: string; password: string; detail: string };
type Section = { title: string; note?: string; rows: Row[] };

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

function drawHeader(doc: PDFKit.PDFDocument, order: string[]) {
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#241F5C').text('MemoCare — Demo Accounts', 48, 54);
  doc.font('Helvetica').fontSize(10.5).fillColor('#4A4964').text(
    'Every account in this document exists in the live demo database. Sign in at http://localhost:3000/login',
    48,
    84
  );
  doc.fontSize(9.5).fillColor('#83829C').text(
    `Generated ${new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}`,
    48,
    100
  );
  doc.moveTo(48, 118).lineTo(547, 118).strokeColor('#E8E4DA').stroke();
  doc.y = 130;
  order.forEach(() => {});
}

function drawSection(doc: PDFKit.PDFDocument, section: Section) {
  if (doc.y > 640) doc.addPage();

  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#241F5C').text(section.title, 48, doc.y);
  if (section.note) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#83829C').text(section.note, 48, doc.y + 2);
  }
  doc.moveDown(0.4);

  // Table header
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#4A4964');
  doc.text('NAME', 48, y, { width: 140 });
  doc.text('EMAIL (LOGIN)', 190, y, { width: 185 });
  doc.text('PASSWORD', 378, y, { width: 84 });
  doc.text('ROLE / DETAILS', 464, y, { width: 84 });
  doc.y = y + 14;
  doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#E8E4DA').stroke();
  doc.y += 6;

  for (const row of section.rows) {
    const cellOpts = { width: 132 };
    const heights = [
      doc.heightOfString(row.name, { ...cellOpts, width: 136 }),
      doc.heightOfString(row.email, { ...cellOpts, width: 180 }),
      doc.heightOfString(row.password, { ...cellOpts, width: 80 }),
      doc.heightOfString(row.detail, { ...cellOpts, width: 80 }),
    ];
    const rowHeight = Math.max(16, ...heights) + 8;

    if (doc.y + rowHeight > 760) {
      doc.addPage();
      doc.y = 54;
    }

    const top = doc.y;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1B1A2E').text(row.name, 48, top, { width: 136 });
    doc.font('Helvetica').fontSize(9).fillColor('#1B1A2E').text(row.email, 190, top, { width: 180 });
    doc.font('Courier-Bold').fontSize(9).fillColor('#16123B').text(row.password, 378, top, { width: 80 });
    doc.font('Helvetica').fontSize(8.5).fillColor('#4A4964').text(row.detail, 464, top, { width: 80 });

    doc.y = top + rowHeight;
    doc.moveTo(48, doc.y - 4).lineTo(547, doc.y - 4).strokeColor('#F0EDE5').stroke();
  }
  doc.y += 4;
}

async function buildSections(): Promise<Section[]> {
  const sections: Section[] = [];

  // ---- Core demo logins ---------------------------------------------------
  const coreEmails = ['admin@memocare.dev', 'doctor@memocare.dev', 'family@memocare.dev', 'caretaker@memocare.dev', 'store@memocare.dev'];
  const core = await prisma.user.findMany({ where: { email: { in: coreEmails } } });
  sections.push({
    title: 'Administrator & demo logins',
    note: 'The five original walkthrough accounts. The admin sees every patient in the system.',
    rows: core
      .sort((a, b) => coreEmails.indexOf(a.email) - coreEmails.indexOf(b.email))
      .map((u) => ({
        name: fullName(u),
        email: u.email,
        password: DEFAULT_PASSWORD,
        detail: u.role === 'ADMIN' ? 'Administrator' : u.role.replace('_', ' ').toLowerCase(),
      })),
  });

  // ---- Doctors (active) ---------------------------------------------------
  const doctors = await prisma.user.findMany({
    where: { role: 'HOSPITAL_STAFF', status: 'ACTIVE', email: { notIn: coreEmails } },
    orderBy: [{ firstName: 'asc' }],
  });
  sections.push({
    title: `Medical doctors — active (${doctors.length})`,
    note: 'Full hospital-staff access: patients, screening tests, clinical reports and notes.',
    rows: doctors.map((u) => ({
      name: `Dr. ${fullName(u)}`,
      email: u.email,
      password: DEFAULT_PASSWORD,
      detail: [u.profession, u.degrees].filter(Boolean).join(', '),
    })),
  });

  // ---- Pending approvals --------------------------------------------------
  const pending = await prisma.user.findMany({
    where: { role: 'HOSPITAL_STAFF', status: 'PENDING_APPROVAL' },
    orderBy: { createdAt: 'asc' },
  });
  sections.push({
    title: `Staff approvals — awaiting review (${pending.length})`,
    note: 'Left deliberately unapproved so Admin → Staff Approvals has real entries to approve or reject.',
    rows: pending.map((u) => ({
      name: `Dr. ${fullName(u)}`,
      email: u.email,
      password: DEFAULT_PASSWORD,
      detail: `${u.profession ?? ''}${u.yearsOfExperience ? `, ${u.yearsOfExperience} yrs` : ''}`,
    })),
  });

  // ---- Caretakers ---------------------------------------------------------
  const caretakers = await prisma.user.findMany({
    where: { role: 'CARETAKER', email: { notIn: coreEmails } },
    orderBy: { firstName: 'asc' },
    include: { patientLinks: { include: { patient: true } } },
  });
  sections.push({
    title: `Caretakers (${caretakers.length})`,
    note: 'Each caretaker is linked to two patients and can log medications, appointments and location check-ins.',
    rows: caretakers.map((u) => ({
      name: fullName(u),
      email: u.email,
      password: DEFAULT_PASSWORD,
      detail: u.patientLinks.map((l) => fullName(l.patient)).join(', '),
    })),
  });

  // ---- Family members -----------------------------------------------------
  const family = await prisma.user.findMany({
    where: { role: 'FAMILY', email: { notIn: coreEmails } },
    orderBy: { firstName: 'asc' },
    include: { patientLinks: { include: { patient: true } } },
  });
  sections.push({
    title: `Family members (${family.length})`,
    note: 'Each family login is linked to one patient and sees the simplified progress and report view.',
    rows: family.map((u) => ({
      name: fullName(u),
      email: u.email,
      password: DEFAULT_PASSWORD,
      detail: u.patientLinks.map((l) => fullName(l.patient)).join(', '),
    })),
  });

  // ---- Medical stores -----------------------------------------------------
  const stores = await prisma.user.findMany({
    where: { role: 'MEDICAL_STORE' },
    orderBy: { email: 'asc' },
    include: { medicalStore: true },
  });
  sections.push({
    title: `Medical store accounts (${stores.length})`,
    note: 'The 25 samplemedicine accounts use the password below; the original store@memocare.dev account uses Password123!.',
    rows: stores.map((u) => ({
      name: u.medicalStore?.storeName ?? fullName(u),
      email: u.email,
      password: u.email.startsWith('samplemedicine') ? STORE_SAMPLE_PASSWORD : DEFAULT_PASSWORD,
      detail: u.medicalStore ? `${u.medicalStore.city ?? ''} ${u.medicalStore.openTime ?? ''}-${u.medicalStore.closeTime ?? ''}`.trim() : 'No store profile',
    })),
  });

  // ---- Patients (records, not logins) ------------------------------------
  const patients = await prisma.patient.findMany({
    where: { status: 'ACTIVE', createdById: (await prisma.user.findUnique({ where: { email: 'admin@memocare.dev' } }))?.id },
    orderBy: [{ firstName: 'asc' }],
    include: { assignedDoctor: true },
  });
  sections.push({
    title: `Patients on the admin dashboard (${patients.length})`,
    note: 'Patient records do not have their own login — staff, family and caretaker accounts open them.',
    rows: patients.map((p) => ({
      name: fullName(p),
      email: p.diagnosisStatus ?? 'undiagnosed',
      password: new Date(p.dateOfBirth).toLocaleDateString('en-IN'),
      detail: p.assignedDoctor ? `Dr. ${fullName(p.assignedDoctor)}` : 'Unassigned',
    })),
  });

  return sections;
}

async function main() {
  const sections = await buildSections();

  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
  const stream = fs.createWriteStream(OUT_PATH);
  doc.pipe(stream);

  drawHeader(doc, []);

  // Contents
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#241F5C').text('Contents', 48, doc.y);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(9.5).fillColor('#4A4964');
  sections.forEach((s) => doc.text(`•  ${s.title}`, { indent: 4 }));
  doc.moveDown(0.6);
  doc.font('Helvetica').fontSize(9).fillColor('#4A4964').text(
    `All accounts listed above use the password ${DEFAULT_PASSWORD} unless stated otherwise in the section note. ` +
      'This document contains demo credentials for a local development database only — do not reuse these logins anywhere real.',
    { width: 480 }
  );

  for (const section of sections) drawSection(doc, section);

  // Footer page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor('#83829C').text(
      `MemoCare demo account sheet · page ${i + 1} of ${range.count}`,
      48,
      790,
      { width: 500, align: 'center' }
    );
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  console.log(`PDF written to ${OUT_PATH}`);
  sections.forEach((s) => console.log(`  ${s.title}: ${s.rows.length}`));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
