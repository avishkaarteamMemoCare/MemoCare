/**
 * Creates (or refreshes) 25 sample medical-store accounts in Navi Mumbai,
 * each within 50 km of Panvel, with 15 random medicines in stock.
 *
 *   samplemedicine1@memocare.dev … samplemedicine25@memocare.dev
 *   password: 12345678
 *
 * Re-running it is safe: it updates the same 25 accounts and replaces only
 * their own medicine lists.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PASSWORD = '12345678';
const MEDICINES_PER_STORE = 15;

type SampleStore = {
  place: string;
  taluka: string;
  address: string;
  latitude: number;
  longitude: number;
  openTime: string;
  closeTime: string;
};

// Real Navi Mumbai / Panvel-area localities. Every point below is inside a
// 50 km radius of Panvel (18.9894, 73.1175).
const STORES: SampleStore[] = [
  { place: 'Vashi', taluka: 'Thane', address: 'Shop 4, Sector 17 Market Road', latitude: 19.0771, longitude: 72.9986, openTime: '09:00', closeTime: '21:00' },
  { place: 'Vashi', taluka: 'Thane', address: 'Shop 12, Sector 29 Palm Beach Road', latitude: 19.083, longitude: 72.989, openTime: '08:30', closeTime: '22:00' },
  { place: 'Sanpada', taluka: 'Thane', address: 'Ground Floor, Sector 5 Station Road', latitude: 19.0633, longitude: 73.0108, openTime: '09:00', closeTime: '21:30' },
  { place: 'Juinagar', taluka: 'Thane', address: 'Shop 2, Sector 11 Juinagar East', latitude: 19.0483, longitude: 73.0146, openTime: '08:00', closeTime: '21:00' },
  { place: 'Nerul', taluka: 'Thane', address: 'Shop 7, Sector 15 Market Complex', latitude: 19.033, longitude: 73.0169, openTime: '09:00', closeTime: '22:00' },
  { place: 'Nerul', taluka: 'Thane', address: 'Shop 21, Sector 44A Palm Beach Road', latitude: 19.02, longitude: 73.01, openTime: '08:00', closeTime: '23:00' },
  { place: 'Seawoods', taluka: 'Thane', address: 'Shop 3, Darave Road, Seawoods West', latitude: 19.0203, longitude: 73.0178, openTime: '09:30', closeTime: '21:30' },
  { place: 'CBD Belapur', taluka: 'Thane', address: 'Shop 14, Sector 15 Belapur Station Complex', latitude: 19.0176, longitude: 73.0387, openTime: '09:00', closeTime: '21:00' },
  { place: 'Kharghar', taluka: 'Panvel', address: 'Shop 8, Sector 7 Utsav Chowk Road', latitude: 19.047, longitude: 73.069, openTime: '08:30', closeTime: '22:00' },
  { place: 'Kharghar', taluka: 'Panvel', address: 'Shop 19, Sector 35 Central Park Road', latitude: 19.038, longitude: 73.068, openTime: '09:00', closeTime: '21:30' },
  { place: 'Kamothe', taluka: 'Panvel', address: 'Shop 5, Sector 20 Mansarovar Station Road', latitude: 19.017, longitude: 73.1, openTime: '08:00', closeTime: '21:00' },
  { place: 'Kalamboli', taluka: 'Panvel', address: 'Shop 11, Sector 4 Kalamboli Circle', latitude: 18.993, longitude: 73.1, openTime: '09:00', closeTime: '20:30' },
  { place: 'New Panvel', taluka: 'Panvel', address: 'Shop 6, Sector 19 New Panvel East', latitude: 18.993, longitude: 73.123, openTime: '08:30', closeTime: '22:00' },
  { place: 'Panvel', taluka: 'Panvel', address: 'Shop 1, Old Panvel Market Road', latitude: 18.9894, longitude: 73.1175, openTime: '07:30', closeTime: '22:30' },
  { place: 'Taloja', taluka: 'Panvel', address: 'Shop 9, Taloja Phase 1 Market', latitude: 19.07, longitude: 73.1, openTime: '09:00', closeTime: '21:00' },
  { place: 'Ulwe', taluka: 'Uran', address: 'Shop 15, Sector 17 Ulwe Node', latitude: 18.976, longitude: 73.03, openTime: '08:30', closeTime: '21:30' },
  { place: 'Dronagiri', taluka: 'Uran', address: 'Shop 2, Sector 5 Dronagiri Node', latitude: 18.91, longitude: 72.93, openTime: '09:00', closeTime: '20:00' },
  { place: 'Airoli', taluka: 'Thane', address: 'Shop 10, Sector 9 Airoli Market Road', latitude: 19.159, longitude: 72.993, openTime: '08:00', closeTime: '22:00' },
  { place: 'Ghansoli', taluka: 'Thane', address: 'Shop 13, Sector 3 Ghansoli Station Road', latitude: 19.123, longitude: 72.999, openTime: '09:00', closeTime: '21:00' },
  { place: 'Koparkhairane', taluka: 'Thane', address: 'Shop 4, Sector 12 Koparkhairane Market', latitude: 19.105, longitude: 72.997, openTime: '08:30', closeTime: '21:30' },
  { place: 'Rabale', taluka: 'Thane', address: 'Shop 7, Rabale Station Road', latitude: 19.14, longitude: 73.0, openTime: '09:00', closeTime: '20:30' },
  { place: 'Turbhe', taluka: 'Thane', address: 'Shop 18, Sector 24 Turbhe Naka', latitude: 19.08, longitude: 73.02, openTime: '08:00', closeTime: '22:00' },
  { place: 'Vashi', taluka: 'Thane', address: 'Shop 3, Sector 9 Vashi Market', latitude: 19.074, longitude: 73.007, openTime: '09:00', closeTime: '21:00' },
  { place: 'Kharghar', taluka: 'Panvel', address: 'Shop 16, Sector 20 Kharghar Station Road', latitude: 19.05, longitude: 73.075, openTime: '08:30', closeTime: '22:30' },
  { place: 'Panvel', taluka: 'Panvel', address: 'Shop 5, MIDC Road, Panvel', latitude: 18.97, longitude: 73.13, openTime: '09:00', closeTime: '21:00' },
];

// The 25 real pharmacy names, matched to the 25 locations above in order.
const STORE_NAMES = [
  'Swati Medical',
  'Zeno Health Pharmacy – MTNL Road',
  'Apollo Pharmacy – MTNL Panvel',
  'Wellness Forever Pharmacy – Durga Mata Mandir',
  'Maxwell Forever & Lifestyle Chemist',
  'Priti Medical Stores',
  'Sanjeevani Medical And General Stores',
  'Jay Medical And General Store',
  'Balaji Medical',
  'Prince Medical & General Stores',
  'Apollo Pharmacy – ST Stand',
  'Navaratan Medical',
  'Shreekant Pharma',
  'Dava Sai Pharmacy',
  'Balaji Chemist',
  'Yogeshwar Chemist',
  'MedPlus – New Panvel',
  'Zeno Health Pharmacy – Sector 19',
  'Wellness Forever Pharmacy – New Panvel East',
  'Bhavana Chemist',
  'Pharmazen Generic Medical',
  'Apollo Pharmacy – Panvel DC',
  'Metro Chemist – Khanda Colony',
  'Apollo Pharmacy – Khanda Colony',
  'MedPlus – Khanda Colony',
];

// Medicines and per-unit price ranges exactly as listed in the reference
// chart. Antibody infusions (Lecanemab / Donanemab), which are priced in
// US dollars per year and not sold off a pharmacy shelf, are left out.
const MEDICINES: { name: string; low: number; high: number }[] = [
  { name: 'Donepezil 5mg tablet', low: 3, high: 10 },
  { name: 'Rivastigmine 3mg capsule', low: 10, high: 25 },
  { name: 'Rivastigmine 4.6mg patch', low: 400, high: 700 },
  { name: 'Galantamine 8mg tablet', low: 10, high: 30 },
  { name: 'Memantine 10mg tablet', low: 8, high: 20 },
  { name: 'Donepezil + Memantine tablet', low: 15, high: 30 },
  { name: 'Sertraline 50mg tablet', low: 3, high: 8 },
  { name: 'Escitalopram 10mg tablet', low: 3, high: 10 },
  { name: 'Citalopram 20mg tablet', low: 3, high: 8 },
  { name: 'Mirtazapine 15mg tablet', low: 5, high: 12 },
  { name: 'Trazodone 50mg tablet', low: 5, high: 15 },
  { name: 'Risperidone 1mg tablet', low: 2, high: 6 },
  { name: 'Quetiapine 25mg tablet', low: 4, high: 12 },
  { name: 'Olanzapine 5mg tablet', low: 3, high: 8 },
  { name: 'Aripiprazole 5mg tablet', low: 5, high: 15 },
  { name: 'Melatonin 3mg tablet', low: 5, high: 10 },
  { name: 'Zolpidem 10mg tablet', low: 8, high: 15 },
  { name: 'Prazosin 1mg tablet', low: 3, high: 8 },
  { name: 'Carbamazepine 200mg tablet', low: 2, high: 6 },
  { name: 'Valproate 200mg tablet', low: 3, high: 10 },
  { name: 'Vitamin B12 tablet', low: 3, high: 10 },
  { name: 'Vitamin D3 60K sachet', low: 10, high: 40 },
  { name: 'Folic acid 5mg tablet', low: 1, high: 3 },
  { name: 'Omega-3 capsule', low: 10, high: 20 },
  { name: 'Ginkgo biloba tablet', low: 10, high: 25 },
  { name: 'Citicoline 500mg tablet', low: 20, high: 40 },
];

/** Small deterministic PRNG so each store gets the same random-looking set on a re-run. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickMedicines(seed: number) {
  const random = mulberry32(seed);
  const pool = [...MEDICINES];
  // Fisher-Yates shuffle with the seeded PRNG.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, MEDICINES_PER_STORE).map((med) => {
    const price = Math.round((med.low + random() * (med.high - med.low)) * 100) / 100;
    const quantity = 15 + Math.floor(random() * 186); // 15–200 units in stock
    return { name: med.name, price, quantity };
  });
}

function phoneFor(index: number) {
  return `98${String(70000000 + index * 4321).padStart(8, '0')}`;
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  console.log('Creating 25 sample medical stores in Navi Mumbai…');

  for (let index = 0; index < STORES.length; index++) {
    const number = index + 1;
    const location = STORES[index];
    const email = `samplemedicine${number}@memocare.dev`;
    const displayName = STORE_NAMES[index] ?? `Sample Medical ${number}`;
    const fullAddress = `${location.address}, ${location.place}, Navi Mumbai`;
    const phone = phoneFor(number);

    const owner = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        role: 'MEDICAL_STORE',
        status: 'ACTIVE',
        firstName: 'Sample',
        lastName: `Medical ${number}`,
        phone,
        address: fullAddress,
        emailVerifiedAt: new Date(),
      },
      create: {
        email,
        passwordHash,
        role: 'MEDICAL_STORE',
        status: 'ACTIVE',
        firstName: 'Sample',
        lastName: `Medical ${number}`,
        phone,
        address: fullAddress,
        emailVerifiedAt: new Date(),
      },
    });

    const store = await prisma.medicalStore.upsert({
      where: { ownerId: owner.id },
      update: {
        storeName: displayName,
        address: location.address,
        city: 'Navi Mumbai',
        taluka: location.taluka,
        latitude: location.latitude,
        longitude: location.longitude,
        phone,
        openTime: location.openTime,
        closeTime: location.closeTime,
      },
      create: {
        ownerId: owner.id,
        storeName: displayName,
        address: location.address,
        city: 'Navi Mumbai',
        taluka: location.taluka,
        latitude: location.latitude,
        longitude: location.longitude,
        phone,
        openTime: location.openTime,
        closeTime: location.closeTime,
      },
    });

    const medicines = pickMedicines(number * 7919);
    await prisma.storeMedicine.deleteMany({ where: { storeId: store.id } });
    await prisma.storeMedicine.createMany({
      data: medicines.map((med) => ({ storeId: store.id, ...med })),
    });

    console.log(
      `  ${email} · ${displayName} · ${location.place} (${location.taluka}) · ${medicines.length} medicines · ${location.openTime}–${location.closeTime}`
    );
  }

  console.log('\\nDone. 25 accounts ready.');
  console.log('Login emails: samplemedicine1@memocare.dev … samplemedicine25@memocare.dev');
  console.log(`Password for all: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
