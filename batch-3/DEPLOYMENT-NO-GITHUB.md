# 🚀 MemoCare — Publish Online Without GitHub

This guide explains how to publish and host your full MemoCare project (Frontend + Backend + Database) online so **anyone around the world can access it**, without needing a GitHub repository.

---

## 🛠️ Summary of Fixes Applied

1. **Frontend Optimization**:
   - Fixed dynamic import warning in `src/auth/AuthContext.jsx`.
   - Updated `src/api/client.js` so it automatically routes to `/api/v1` in production when served together, or accepts any custom backend URL.

2. **Backend Enhancements**:
   - Configured Express in `src/app.ts` to automatically host the compiled React frontend (`../memocare-frontend/dist`). The entire full-stack app now runs as a single service on one port (`4000`).
   - Relaxed Helmet Content-Security-Policy (CSP) to allow `blob:`, `data:`, and `https:` for audio/video recordings, screening test pictures, and medical PDF reports.
   - Enhanced CORS to support wildcard, comma-separated domains, or single-origin.
   - Added Redis connection error handling in `src/config/redis.ts` so the server does not crash if Redis is unavailable or restarting.
   - Added `ALLOW_LOCAL_STORAGE=true` option in `src/config/env.ts` so production deployments without AWS S3 buckets boot smoothly.
   - Created `scripts/generate-env.mjs` to generate cryptographically secure production keys.

---

## 🌐 Option 1: Instant Public Access via Live Tunnel (Zero Signup, 30 Seconds)

If you want an instant online URL right now so people can test your app from anywhere on the internet:

### Step 1: Start PostgreSQL & Redis
If you have Docker installed:
```powershell
cd memocare-backend
docker compose up -d
```
Or use a free cloud database from [Neon.tech](https://neon.tech) (see Option 2).

### Step 2: Build & Start MemoCare
From the project root:
```powershell
npm run build
npm start
```
Your app will be running at `http://localhost:4000`.

### Step 3: Make It Public to the World
Open a second PowerShell window and run:
```powershell
npx localtunnel --port 4000
```
or with Cloudflare Tunnel (if installed):
```powershell
cloudflared tunnel --url http://localhost:4000
```
You will immediately receive a public HTTPS URL (like `https://calm-badger-22.loca.lt`) that anyone can open in their browser on any phone, tablet, or PC worldwide.

---

## ☁️ Option 2: 24/7 Cloud Hosting (No GitHub Required)

To keep your application running permanently 24/7 online without keeping your personal computer on:

### 1. Get a Free Cloud PostgreSQL Database (60 Seconds)
1. Go to [Neon.tech](https://neon.tech) or [Supabase.com](https://supabase.com) and create a free account.
2. Create a new PostgreSQL database project.
3. Copy your Connection String (`DATABASE_URL`), which looks like:
   `postgresql://username:password@ep-cool-lake-1234.us-east-1.aws.neon.tech/neondb?sslmode=require`
4. Run migrations from your terminal:
   ```powershell
   cd memocare-backend
   $env:DATABASE_URL="your_neon_connection_string"
   npx prisma migrate deploy
   npx prisma db seed
   ```

### 2. Deploy Using Railway CLI (Direct CLI Upload, No GitHub)
[Railway](https://railway.app) allows you to push code directly from your local computer terminal:

1. Install Railway CLI:
   ```powershell
   npm install -g @railway/cli
   ```
2. Log in (opens browser to authenticate):
   ```powershell
   railway login
   ```
3. Initialize the project:
   ```powershell
   railway init
   ```
4. Set environment variables on Railway:
   - `DATABASE_URL`: Your Neon/Supabase connection string
   - `NODE_ENV`: `production`
   - `ALLOW_LOCAL_STORAGE`: `true`
   - `JWT_ACCESS_SECRET`: Generate using `npm run generate-secrets`
   - `JWT_REFRESH_SECRET`: Generate using `npm run generate-secrets`
   - `FIELD_ENCRYPTION_KEY`: Generate using `npm run generate-secrets`
   - `HOSPITAL_MANAGEMENT_CODE`: Your custom code (e.g., `MC-7B303B54`)
5. Deploy directly with one command:
   ```powershell
   railway up
   ```
Railway will build and host your application, assigning you a public `.up.railway.app` URL.

---

## ⚡ Option 3: Deploy Frontend on Vercel CLI & Backend on Render (No GitHub)

If you prefer hosting the React frontend on Vercel's global CDN:

1. Install Vercel CLI:
   ```powershell
   npm install -g vercel
   ```
2. Navigate to frontend and deploy:
   ```powershell
   cd memocare-frontend
   vercel
   ```
3. Set your production backend API URL in Vercel settings:
   `VITE_API_BASE_URL=https://your-backend-service.com/api/v1`
4. Deploy to production:
   ```powershell
   vercel --prod
   ```

---

## 🔑 Generating Production Secrets
Whenever you need fresh, secure keys for production deployment, run:
```powershell
npm run generate-secrets
```
It outputs ready-to-paste strings for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FIELD_ENCRYPTION_KEY`, and `HOSPITAL_MANAGEMENT_CODE`.
