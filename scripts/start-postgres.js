const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync } = require('child_process');

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  }
}

function parseDatabaseUrl(urlStr = process.env.DATABASE_URL) {
  if (!urlStr) {
    loadEnv();
    urlStr = process.env.DATABASE_URL;
  }
  if (!urlStr) {
    return {
      host: '127.0.0.1',
      port: 5432,
      user: 'postgres',
      password: 'postgres',
      database: 'sifr_db',
    };
  }
  try {
    const parsed = new URL(urlStr);
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parseInt(parsed.port || '5432', 10),
      user: decodeURIComponent(parsed.username || 'postgres'),
      password: decodeURIComponent(parsed.password || 'postgres'),
      database: parsed.pathname.replace(/^\//, '') || 'sifr_db',
    };
  } catch {
    return {
      host: '127.0.0.1',
      port: 5432,
      user: 'postgres',
      password: 'postgres',
      database: 'sifr_db',
    };
  }
}

function checkTcpConnection(port, host, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;

    const done = (result) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      done({ ok: true, eperm: false });
    });

    socket.on('timeout', () => {
      done({ ok: false, eperm: false, timeout: true });
    });

    socket.on('error', (err) => {
      const isEperm = err.code === 'EPERM' || (err.message && err.message.includes('EPERM'));
      done({ ok: false, eperm: isEperm, code: err.code, error: err });
    });

    socket.connect(port, host === 'localhost' ? '127.0.0.1' : host);
  });
}

async function getPostgresBinaries() {
  try {
    const binModule = require('embedded-postgres/dist/binary.js');
    const getBin = binModule.default || binModule;
    return await getBin();
  } catch {
    const darwinArm64Path = path.join(
      process.cwd(),
      'node_modules',
      '@embedded-postgres',
      'darwin-arm64',
      'native',
      'bin'
    );
    if (fs.existsSync(darwinArm64Path)) {
      return {
        initdb: path.join(darwinArm64Path, 'initdb'),
        pg_ctl: path.join(darwinArm64Path, 'pg_ctl'),
        postgres: path.join(darwinArm64Path, 'postgres'),
      };
    }
    throw new Error('Could not resolve embedded PostgreSQL binaries.');
  }
}

async function ensurePostgresRunning() {
  loadEnv();
  const dbConfig = parseDatabaseUrl();
  const host = dbConfig.host === 'localhost' ? '127.0.0.1' : dbConfig.host;
  const port = dbConfig.port;

  console.log(`[SIFR Database] Checking PostgreSQL availability on ${host}:${port}...`);

  const initialCheck = await checkTcpConnection(port, host, 1000);

  if (initialCheck.eperm) {
    const err = new Error(
      `connect EPERM ${host}:${port}: Socket access denied by restricted environment.`
    );
    err.isSandboxEperm = true;
    throw err;
  }

  if (initialCheck.ok) {
    console.log(`[SIFR Database] ✓ PostgreSQL is active and accepting connections on ${host}:${port}.`);
  } else {
    console.log(`[SIFR Database] PostgreSQL is not reachable on port ${port}. Starting PostgreSQL...`);
    const bin = await getPostgresBinaries();
    const dataDir = path.join(process.cwd(), 'data', 'db');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const isInitialized = fs.existsSync(path.join(dataDir, 'PG_VERSION'));
    if (!isInitialized) {
      console.log(`[SIFR Database] Initializing PostgreSQL cluster in ${dataDir}...`);
      execSync(`"${bin.initdb}" -D "${dataDir}" --auth=trust --username="${dbConfig.user}"`, {
        stdio: 'inherit',
      });
    }

    // Check for stale postmaster.pid
    const pidFile = path.join(dataDir, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      try {
        const statusOut = execSync(`"${bin.pg_ctl}" status -D "${dataDir}"`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
        if (!statusOut.includes('server is running')) {
          fs.unlinkSync(pidFile);
        }
      } catch {
        try {
          fs.unlinkSync(pidFile);
        } catch {}
      }
    }

    const logFile = path.join(dataDir, 'postgres.log');
    console.log(`[SIFR Database] Spawning PostgreSQL daemon via pg_ctl...`);
    try {
      execSync(`"${bin.pg_ctl}" start -D "${dataDir}" -l "${logFile}" -o "-p ${port}"`, {
        stdio: 'inherit',
      });
    } catch (startErr) {
      console.warn(`[SIFR Database] pg_ctl start note:`, startErr.message);
    }

    // Wait and retry TCP connection up to 15 seconds
    console.log(`[SIFR Database] Waiting for PostgreSQL to accept connections on port ${port}...`);
    const deadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < deadline) {
      const check = await checkTcpConnection(port, host, 500);
      if (check.eperm) {
        const err = new Error(
          `connect EPERM ${host}:${port}: Socket access denied by restricted environment.`
        );
        err.isSandboxEperm = true;
        throw err;
      }
      if (check.ok) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!ready) {
      throw new Error(
        `PostgreSQL did not accept connections on ${host}:${port} within 15s. Check ${logFile}`
      );
    }
    console.log(`[SIFR Database] ✓ PostgreSQL is now accepting connections on ${host}:${port}.`);
  }

  // Verify database connectivity using Prisma
  console.log(`[SIFR Database] Verifying database "${dbConfig.database}" connectivity with Prisma...`);
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`[SIFR Database] ✓ Database "${dbConfig.database}" is reachable and verified.`);
  } catch (dbErr) {
    if (dbErr.message && (dbErr.message.includes('EPERM') || dbErr.code === 'EPERM')) {
      const err = new Error(
        `Prisma connect EPERM: Process lacks socket permissions to reach localhost:${port}.`
      );
      err.isSandboxEperm = true;
      throw err;
    }
    throw new Error(`Prisma connection failed for "${dbConfig.database}": ${dbErr.message}`);
  } finally {
    await prisma.$disconnect();
  }

  return { ok: true, host, port, database: dbConfig.database };
}

if (require.main === module) {
  ensurePostgresRunning()
    .then(() => {
      console.log('[SIFR Database] Startup & verification complete.');
      process.exit(0);
    })
    .catch((err) => {
      if (err.isSandboxEperm) {
        console.error('\n' + '='.repeat(70));
        console.error('[SIFR Database Error] connect EPERM 127.0.0.1:5432');
        console.error('The command was executed inside a restricted sandbox environment.');
        console.error('Local TCP socket connections are blocked by the environment.');
        console.error('Action: Run outside the sandbox in a standard local terminal.');
        console.error('='.repeat(70) + '\n');
      } else {
        console.error('\n[SIFR Database Startup Error]:', err.message, '\n');
      }
      process.exit(1);
    });
}

module.exports = {
  loadEnv,
  parseDatabaseUrl,
  checkTcpConnection,
  getPostgresBinaries,
  ensurePostgresRunning,
};
