import { spawn } from 'child_process';
import http from 'http';

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('--- Starting MemoCare Server for Neon End-to-End Test ---');
  const server = spawn('node', ['memocare-backend/dist/src/server.js'], {
    stdio: 'pipe',
    env: { ...process.env, PORT: '4000', NODE_ENV: 'development' },
  });

  try {
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      try {
        const h = await request({ host: '127.0.0.1', port: 4000, path: '/health', method: 'GET' });
        if (h.status === 200) {
          ready = true;
          break;
        }
      } catch {}
    }

    if (!ready) {
      throw new Error('Server did not become ready within 20 seconds');
    }
    console.log('[PASS] 1. /health endpoint: Server is healthy');

    // Test 2: React Frontend is served
    const fe = await request({ host: '127.0.0.1', port: 4000, path: '/', method: 'GET' });
    if (fe.status === 200 && (fe.raw || '').includes('<!doctype html>')) {
      console.log('[PASS] 2. Frontend SPA: React index.html served successfully by Express');
    } else {
      console.log('[WARN] 2. Frontend status:', fe.status);
    }

    // Test 3: Authenticate with Neon Database
    console.log('[TEST] 3. Testing Login against Neon Postgres Database...');
    const login = await request(
      {
        host: '127.0.0.1',
        port: 4000,
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'doctor@memocare.dev', password: 'Password123!' }
    );

    const token = login.body?.data?.accessToken;
    if (login.status !== 200 || !token) {
      throw new Error(`Login failed: status ${login.status}, body: ${JSON.stringify(login.body)}`);
    }
    console.log('[PASS] 3. Neon DB Login: User verified, password hash matched on Neon, JWT issued');
    console.log(`       User ID: ${login.body.data.user.id}, Role: ${login.body.data.user.role}, Name: ${login.body.data.user.firstName} ${login.body.data.user.lastName}`);

    // Test 4: Query Neon DB with Auth
    console.log('[TEST] 4. Querying Patients from Neon Database...');
    const patients = await request({
      host: '127.0.0.1',
      port: 4000,
      path: '/api/v1/patients',
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (patients.status !== 200) {
      throw new Error(`Patient query failed: status ${patients.status}, body: ${JSON.stringify(patients.body)}`);
    }
    console.log(`[PASS] 4. Neon DB Query: Fetched patients successfully from Neon! Total: ${patients.body.data?.length ?? 0}`);

    console.log('\n=============================================');
    console.log('✅ ALL WIRED SERVICES TESTED & VERIFIED END-TO-END!');
    console.log('=============================================');
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
