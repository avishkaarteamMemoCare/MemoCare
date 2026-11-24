import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Demo people for the MemoCare walkthrough.
 *
 * Re-runnable: every account is upserted by email, and every patient is found
 * by name before being created, so running this twice never duplicates anyone.
 *
 * Creates:
 *   • 10 active doctors (HOSPITAL_STAFF / DOCTOR) at the demo hospital
 *   • 20 patients created by the admin, assigned across those doctors
 *   • 20 family-member logins, each linked to one of those patients
 *   • 10 caretaker logins, each linked to two of those patients
 *   • 5 doctors left in the Staff Approvals list (PENDING_APPROVAL, untouched)
 *
 * All logins use the demo password Password123!
 */

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'Password123!';

const email = (prefix: string, first: string, last: string) =>
  `${prefix}.${first}.${last}`.toLowerCase().replace(/[^a-z0-9.@]/g, '') + '@memocare.dev';

const phone = (n: number) => `+91 98${String(20000000 + n * 137911).slice(0, 8)}`;

interface DoctorSeed {
  first: string;
  last: string;
  profession: string;
  degrees: string;
  years: number;
  address: string;
}

const DOCTORS: DoctorSeed[] = [
  { first: 'Arjun', last: 'Mehta', profession: 'Neurologist', degrees: 'MBBS, MD (Neurology)', years: 14, address: 'Flat 402, Sea Breeze, Sector 20, Kharghar, Navi Mumbai 410210' },
  { first: 'Kavita', last: 'Iyer', profession: 'Geriatric Psychiatrist', degrees: 'MBBS, MD (Psychiatry)', years: 11, address: 'B-12, Palm Meadows, Nerul East, Navi Mumbai 400706' },
  { first: 'Rohan', last: 'Deshpande', profession: 'Geriatrician', degrees: 'MBBS, MD (Geriatric Medicine)', years: 9, address: 'Row House 7, Tulsi Vihar, Vashi, Navi Mumbai 400703' },
  { first: 'Sneha', last: 'Kulkarni', profession: 'Neuropsychologist', degrees: 'M.Phil (Clinical Psychology), PhD', years: 8, address: '204, Shanti Residency, Belapur, Navi Mumbai 400614' },
  { first: 'Vikram', last: 'Nair', profession: 'Neurologist', degrees: 'MBBS, DM (Neurology)', years: 16, address: 'C-903, Green Heights, Panvel, Navi Mumbai 410206' },
  { first: 'Anjali', last: 'Sharma', profession: 'Geriatric Medicine Specialist', degrees: 'MBBS, MD (Internal Medicine), Fellowship in Geriatrics', years: 12, address: '11, Shreeji Apartments, Kamothe, Navi Mumbai 410209' },
  { first: 'Sameer', last: 'Joshi', profession: 'Psychiatrist', degrees: 'MBBS, DPM', years: 10, address: 'Flat 15, Anmol CHS, Ulwe, Navi Mumbai 410206' },
  { first: 'Neha', last: 'Bhatt', profession: 'Cognitive Neurologist', degrees: 'MBBS, MD, DM (Neurology)', years: 7, address: '602, Sagar Darshan, Seawoods, Navi Mumbai 400706' },
  { first: 'Aditya', last: 'Rane', profession: 'Internal Medicine Specialist', degrees: 'MBBS, MD (Internal Medicine)', years: 13, address: '8, Sai Kripa, Airoli, Navi Mumbai 400708' },
  { first: 'Pooja', last: 'Menon', profession: 'Geriatric Psychiatrist', degrees: 'MBBS, MD (Psychiatry)', years: 6, address: 'A-304, Lake View, Ghansoli, Navi Mumbai 400701' },
];

const PENDING_DOCTORS: (DoctorSeed & { applied: string })[] = [
  { first: 'Harish', last: 'Pillai', profession: 'Neurologist', degrees: 'MBBS, MD (Neurology)', years: 15, address: '12, Regency Park, Kharghar, Navi Mumbai 410210', applied: 'Applied to join the memory clinic as a consulting neurologist.' },
  { first: 'Meera', last: 'Chavan', profession: 'Geriatric Psychiatrist', degrees: 'MBBS, MD (Psychiatry), Fellowship in Geriatric Psychiatry', years: 9, address: '301, Om Sai Residency, Panvel, Navi Mumbai 410206', applied: 'Referral from the memory clinic’s psychiatry network.' },
  { first: 'Karan', last: 'Shetty', profession: 'Neuropsychologist', degrees: 'M.Phil (Clinical Psychology)', years: 5, address: '22, Silver Oak, Nerul, Navi Mumbai 400706', applied: 'Wants to run cognitive assessments and family counselling sessions.' },
  { first: 'Shruti', last: 'Kamble', profession: 'Geriatrician', degrees: 'MBBS, MD (Geriatrics)', years: 8, address: '5, Vasant Vihar, Vashi, Navi Mumbai 400703', applied: 'Transferring from a Pune hospital, available from next month.' },
  { first: 'Nikhil', last: 'Verghese', profession: 'Psychiatrist', degrees: 'MBBS, MD (Psychiatry)', years: 11, address: '904, Suncrest Tower, Seawoods, Navi Mumbai 400706', applied: 'Applying for the weekend memory-care OPD slot.' },
];

const CARETAKERS = [
  { first: 'Seema', last: 'Patil', years: 7, address: 'Sector 19, Kamothe, Navi Mumbai 410209' },
  { first: 'Ramesh', last: 'Pawar', years: 5, address: 'Khandeshwar, Panvel, Navi Mumbai 410206' },
  { first: 'Lata', last: 'Gaikwad', years: 9, address: 'Sector 21, Kharghar, Navi Mumbai 410210' },
  { first: 'Sunil', last: 'More', years: 4, address: 'Nerul West, Navi Mumbai 400706' },
  { first: 'Vaishali', last: 'Bhosale', years: 6, address: 'Khanda Colony, New Panvel 410206' },
  { first: 'Prakash', last: 'Jadhav', years: 12, address: 'Vashi Sector 17, Navi Mumbai 400703' },
  { first: 'Anita', last: 'Sawant', years: 8, address: 'Ulwe Sector 5, Navi Mumbai 410206' },
  { first: 'Deepak', last: 'Thakur', years: 3, address: 'Airoli Sector 8, Navi Mumbai 400708' },
  { first: 'Manisha', last: 'Kadam', years: 10, address: 'Belapur CBD, Navi Mumbai 400614' },
  { first: 'Santosh', last: 'Shinde', years: 6, address: 'Taloja Phase 1, Navi Mumbai 410208' },
];

const FAMILY = [
  { first: 'Rohan', last: 'Deshpande', relation: 'Son' },
  { first: 'Priya', last: 'Kulkarni', relation: 'Daughter' },
  { first: 'Amit', last: 'Sharma', relation: 'Son' },
  { first: 'Neeta', last: 'Joshi', relation: 'Daughter-in-law' },
  { first: 'Sandeep', last: 'Rao', relation: 'Son' },
  { first: 'Kavya', last: 'Nair', relation: 'Daughter' },
  { first: 'Rajesh', last: 'Menon', relation: 'Son' },
  { first: 'Shweta', last: 'Iyer', relation: 'Daughter' },
  { first: 'Vivek', last: 'Bhatt', relation: 'Son' },
  { first: 'Aarti', last: 'Rane', relation: 'Daughter' },
  { first: 'Manoj', last: 'Chavan', relation: 'Nephew' },
  { first: 'Pooja', last: 'Shetty', relation: 'Daughter' },
  { first: 'Ajay', last: 'Kamble', relation: 'Son' },
  { first: 'Snehal', last: 'Verghese', relation: 'Daughter' },
  { first: 'Rahul', last: 'Pillai', relation: 'Son' },
  { first: 'Divya', last: 'Mehta', relation: 'Daughter' },
  { first: 'Nitin', last: 'Gaikwad', relation: 'Son' },
  { first: 'Ashwini', last: 'Pawar', relation: 'Daughter' },
  { first: 'Girish', last: 'Sawant', relation: 'Son' },
  { first: 'Trupti', last: 'More', relation: 'Daughter' },
];

interface PatientSeed {
  first: string;
  last: string;
  dob: string;
  sex: 'male' | 'female';
  diagnosis: string;
  notes: string;
}

const PATIENTS: PatientSeed[] = [
  { first: 'Shantaram', last: 'Patil', dob: '1942-03-14', sex: 'male', diagnosis: 'Mild cognitive impairment (MCI)', notes: 'Occasional word-finding difficulty. On donepezil 5mg since 2024. Lives with his son in Kharghar.' },
  { first: 'Kamlabai', last: 'Joshi', dob: '1945-07-22', sex: 'female', diagnosis: 'Early-stage Alzheimer’s disease', notes: 'Short-term memory loss noticed 18 months ago. Needs reminders for medication and appointments.' },
  { first: 'Ramchandra', last: 'Iyer', dob: '1939-11-02', sex: 'male', diagnosis: 'Vascular cognitive impairment', notes: 'Hypertension and type 2 diabetes. Slower processing speed; speech sample trend is stable.' },
  { first: 'Saraswati', last: 'Nair', dob: '1947-01-09', sex: 'female', diagnosis: 'undiagnosed', notes: 'Family reports repeating questions. Baseline screening in progress.' },
  { first: 'Vinayak', last: 'Deshmukh', dob: '1941-05-30', sex: 'male', diagnosis: 'MCI — amnestic type', notes: 'Misses appointments unless reminded. Walks daily in the society garden.' },
  { first: 'Sulochana', last: 'Kulkarni', dob: '1944-09-18', sex: 'female', diagnosis: 'Early-stage Alzheimer’s disease', notes: 'Lives alone with a daytime caretaker. Daughter manages the care plan.' },
  { first: 'Bhaskar', last: 'Rao', dob: '1948-02-11', sex: 'male', diagnosis: 'undiagnosed', notes: 'Referred by his physician after a fall. Screening and speech baseline booked.' },
  { first: 'Indira', last: 'Menon', dob: '1940-12-05', sex: 'female', diagnosis: 'Moderate Alzheimer’s disease', notes: 'Requires full-time supervision. Family quiz used weekly for face recognition practice.' },
  { first: 'Dattatray', last: 'Shinde', dob: '1946-06-27', sex: 'male', diagnosis: 'Parkinson’s disease with mild cognitive impairment', notes: 'Tremor in the right hand. Speech recordings are shorter but consistent.' },
  { first: 'Prabhavati', last: 'Chavan', dob: '1943-04-03', sex: 'female', diagnosis: 'MCI — vascular', notes: 'Post-stroke follow-up. Attends the memory clinic every six weeks.' },
  { first: 'Mohan', last: 'Kamat', dob: '1937-08-16', sex: 'male', diagnosis: 'Early-stage Alzheimer’s disease', notes: 'Retired teacher; still reads the newspaper daily with a magnifier.' },
  { first: 'Vimal', last: 'Bhosale', dob: '1949-10-21', sex: 'female', diagnosis: 'undiagnosed', notes: 'Family noticed mood changes and forgetfulness. Awaiting a full assessment.' },
  { first: 'Shankar', last: 'Pawar', dob: '1945-12-12', sex: 'male', diagnosis: 'MCI — amnestic type', notes: 'Widower, lives with his daughter in Khanda Colony. Very consistent with reminders.' },
  { first: 'Anusuya', last: 'Sawant', dob: '1942-02-08', sex: 'female', diagnosis: 'Early-stage Alzheimer’s disease', notes: 'Uses a safe zone around her home; no alerts in the last month.' },
  { first: 'Krishnaji', last: 'Bhagat', dob: '1938-07-04', sex: 'male', diagnosis: 'Moderate cognitive impairment', notes: 'Hearing difficulty — recordings are made with a close microphone.' },
  { first: 'Laxmibai', last: 'Salvi', dob: '1946-03-26', sex: 'female', diagnosis: 'MCI — single domain', notes: 'Keeps a written diary of her medicines. Caretaker visits twice a day.' },
  { first: 'Govind', last: 'Naik', dob: '1944-11-19', sex: 'male', diagnosis: 'undiagnosed', notes: 'Recently moved to Navi Mumbai to live with his son. New patient at the clinic.' },
  { first: 'Shobha', last: 'Tendulkar', dob: '1951-05-07', sex: 'female', diagnosis: 'Mild cognitive impairment (MCI)', notes: 'Still drives locally. Family monitors for any decline in orientation scores.' },
  { first: 'Hari', last: 'Wagh', dob: '1940-09-29', sex: 'male', diagnosis: 'Vascular dementia', notes: 'Stroke in 2021. Attends physiotherapy; cognitive scores fluctuate with fatigue.' },
  { first: 'Sushila', last: 'Kadam', dob: '1948-01-15', sex: 'female', diagnosis: 'Early-stage Alzheimer’s disease', notes: 'Lives with her daughter-in-law. Prefers Marathi-language instructions.' },
];

async function main() {
  console.log('Seeding demo doctors, patients, family and caretakers…');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const admin = await prisma.user.findUnique({ where: { email: 'admin@memocare.dev' } });
  if (!admin) throw new Error('Run `npm run seed` first — the demo admin account is missing.');

  const hospital =
    (admin.hospitalId ? await prisma.hospital.findUnique({ where: { id: admin.hospitalId } }) : null) ??
    (await prisma.hospital.findUnique({ where: { inviteCode: 'DEMO-HOSPITAL-001' } })) ??
    (await prisma.hospital.findFirst({ where: { isApproved: true } }));
  if (!hospital) throw new Error('No approved hospital found. Run `npm run seed` first.');

  // ---- Doctors -------------------------------------------------------------
  const doctors = [];
  for (const [index, doc] of DOCTORS.entries()) {
    const docEmail = email('dr', doc.first, doc.last);
    const user = await prisma.user.upsert({
      where: { email: docEmail },
      update: {
        passwordHash,
        role: 'HOSPITAL_STAFF',
        status: 'ACTIVE',
        staffTitle: 'DOCTOR',
        hospitalId: hospital.id,
        firstName: doc.first,
        lastName: doc.last,
        phone: phone(index + 1),
        address: doc.address,
        profession: doc.profession,
        degrees: doc.degrees,
        yearsOfExperience: doc.years,
        emailVerifiedAt: new Date(),
      },
      create: {
        email: docEmail,
        passwordHash,
        role: 'HOSPITAL_STAFF',
        status: 'ACTIVE',
        staffTitle: 'DOCTOR',
        firstName: doc.first,
        lastName: doc.last,
        phone: phone(index + 1),
        address: doc.address,
        profession: doc.profession,
        degrees: doc.degrees,
        yearsOfExperience: doc.years,
        hospitalId: hospital.id,
        emailVerifiedAt: new Date(),
      },
    });
    doctors.push(user);
  }
  console.log(`  ✓ ${doctors.length} doctors`);

  // ---- Pending staff (left in the approvals list on purpose) ---------------
  const pending = [];
  for (const [index, doc] of PENDING_DOCTORS.entries()) {
    const docEmail = email('dr', doc.first, doc.last);
    const user = await prisma.user.upsert({
      where: { email: docEmail },
      update: {
        passwordHash,
        role: 'HOSPITAL_STAFF',
        status: 'PENDING_APPROVAL',
        staffTitle: 'DOCTOR',
        hospitalId: hospital.id,
        firstName: doc.first,
        lastName: doc.last,
        phone: phone(40 + index),
        address: doc.address,
        profession: doc.profession,
        degrees: doc.degrees,
        yearsOfExperience: doc.years,
        emailVerifiedAt: new Date(),
      },
      create: {
        email: docEmail,
        passwordHash,
        role: 'HOSPITAL_STAFF',
        status: 'PENDING_APPROVAL',
        staffTitle: 'DOCTOR',
        firstName: doc.first,
        lastName: doc.last,
        phone: phone(40 + index),
        address: doc.address,
        profession: doc.profession,
        degrees: doc.degrees,
        yearsOfExperience: doc.years,
        hospitalId: hospital.id,
        emailVerifiedAt: new Date(),
      },
    });
    pending.push(user);
  }
  console.log(`  ✓ ${pending.length} doctors awaiting approval`);

  // ---- Patients (created by the admin, so they appear on the admin list) ---
  const patients = [];
  for (const [index, p] of PATIENTS.entries()) {
    const existing = await prisma.patient.findFirst({
      where: { firstName: p.first, lastName: p.last, dateOfBirth: new Date(p.dob) },
    });
    const data = {
      firstName: p.first,
      lastName: p.last,
      dateOfBirth: new Date(p.dob),
      sex: p.sex,
      phone: phone(60 + index),
      address: ['Kharghar', 'Panvel', 'Vashi', 'Nerul', 'Belapur', 'Kamothe', 'Ulwe', 'Seawoods'][index % 8] + ', Navi Mumbai',
      emergencyContactName: `${FAMILY[index % FAMILY.length].first} ${FAMILY[index % FAMILY.length].last}`,
      emergencyContactPhone: phone(90 + index),
      medicalHistoryNotes: p.notes,
      diagnosisStatus: p.diagnosis,
      relatives: [{ name: `${FAMILY[index % FAMILY.length].first} ${FAMILY[index % FAMILY.length].last}`, relationship: FAMILY[index % FAMILY.length].relation, phone: phone(90 + index) }],
      hospitalId: hospital.id,
      assignedDoctorId: doctors[index % doctors.length].id,
      createdById: admin.id,
      status: 'ACTIVE' as const,
    };
    const patient = existing
      ? await prisma.patient.update({ where: { id: existing.id }, data })
      : await prisma.patient.create({ data });
    patients.push(patient);
  }
  console.log(`  ✓ ${patients.length} patients under the admin dashboard`);

  // ---- Family members (one linked patient each) ---------------------------
  const familyUsers = [];
  for (const [index, person] of FAMILY.entries()) {
    const memberEmail = email('family', person.first, person.last);
    const user = await prisma.user.upsert({
      where: { email: memberEmail },
      update: {
        passwordHash,
        role: 'FAMILY',
        status: 'ACTIVE',
        firstName: person.first,
        lastName: person.last,
        phone: phone(120 + index),
        address: `${['Kharghar', 'Panvel', 'Vashi', 'Nerul', 'Belapur', 'Kamothe', 'Ulwe', 'Seawoods'][index % 8]}, Navi Mumbai`,
        emailVerifiedAt: new Date(),
      },
      create: {
        email: memberEmail,
        passwordHash,
        role: 'FAMILY',
        status: 'ACTIVE',
        firstName: person.first,
        lastName: person.last,
        phone: phone(120 + index),
        address: `${['Kharghar', 'Panvel', 'Vashi', 'Nerul', 'Belapur', 'Kamothe', 'Ulwe', 'Seawoods'][index % 8]}, Navi Mumbai`,
        emailVerifiedAt: new Date(),
      },
    });
    const patient = patients[index % patients.length];
    await prisma.patientLink.upsert({
      where: { patientId_userId: { patientId: patient.id, userId: user.id } },
      update: { linkRole: 'FAMILY_MEMBER' },
      create: { patientId: patient.id, userId: user.id, linkRole: 'FAMILY_MEMBER' },
    });
    familyUsers.push({ user, patient });
  }
  console.log(`  ✓ ${familyUsers.length} family members`);

  // ---- Caretakers (two linked patients each) ------------------------------
  const caretakerUsers = [];
  for (const [index, person] of CARETAKERS.entries()) {
    const caretakerEmail = email('caretaker', person.first, person.last);
    const user = await prisma.user.upsert({
      where: { email: caretakerEmail },
      update: {
        passwordHash,
        role: 'CARETAKER',
        status: 'ACTIVE',
        firstName: person.first,
        lastName: person.last,
        phone: phone(150 + index),
        address: person.address,
        profession: 'Home care attendant',
        yearsOfExperience: person.years,
        emailVerifiedAt: new Date(),
      },
      create: {
        email: caretakerEmail,
        passwordHash,
        role: 'CARETAKER',
        status: 'ACTIVE',
        firstName: person.first,
        lastName: person.last,
        phone: phone(150 + index),
        address: person.address,
        profession: 'Home care attendant',
        yearsOfExperience: person.years,
        emailVerifiedAt: new Date(),
      },
    });
    const assigned = [patients[(index * 2) % patients.length], patients[(index * 2 + 1) % patients.length]];
    for (const patient of assigned) {
      await prisma.patientLink.upsert({
        where: { patientId_userId: { patientId: patient.id, userId: user.id } },
        update: { linkRole: 'CARETAKER' },
        create: { patientId: patient.id, userId: user.id, linkRole: 'CARETAKER' },
      });
    }
    caretakerUsers.push({ user, patients: assigned });
  }
  console.log(`  ✓ ${caretakerUsers.length} caretakers`);

  // ---- Seed document, used by the PDF export ------------------------------
  const accounts = [
    ...doctors.map((u) => ({ section: 'Medical Doctors', name: `Dr. ${u.firstName} ${u.lastName}`, email: u.email, role: 'Doctor (active)', extra: `${DOCTORS.find((d) => d.first === u.firstName)?.profession ?? ''}` })),
    ...pending.map((u) => ({ section: 'Staff Approvals (pending)', name: `Dr. ${u.firstName} ${u.lastName}`, email: u.email, role: 'Doctor (awaiting approval)', extra: `${PENDING_DOCTORS.find((d) => d.first === u.firstName)?.profession ?? ''}` })),
    ...caretakerUsers.map(({ user }) => ({ section: 'Caretakers', name: `${user.firstName} ${user.lastName}`, email: user.email, role: 'Caretaker', extra: `${user.yearsOfExperience ?? ''} yrs experience` })),
    ...familyUsers.map(({ user, patient }) => ({ section: 'Family Members', name: `${user.firstName} ${user.lastName}`, email: user.email, role: 'Family member', extra: `Linked to ${patient.firstName} ${patient.lastName}` })),
  ];
  const docPath = `${process.cwd()}/prisma/demo-accounts.generated.json`;
  const { writeFileSync } = await import('fs');
  writeFileSync(docPath, JSON.stringify(accounts, null, 2));

  console.log('Done. All new logins use the password:', DEMO_PASSWORD);
  console.log(`  ${accounts.length} login accounts written to ${docPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
