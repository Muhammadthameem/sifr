const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const {
  ensurePostgresRunning,
  checkTcpConnection,
} = require('./start-postgres');

async function handlePort3000() {
  const tcpCheck = await checkTcpConnection(3000, '127.0.0.1', 400);

  if (!tcpCheck.ok && !tcpCheck.eperm) {
    console.log('[SIFR Startup] ✓ Port 3000 is available.');
    return;
  }

  if (tcpCheck.ok) {
    console.log('[SIFR Startup] Port 3000 is currently occupied. Checking active process...');
    try {
      const lsofOutput = execSync('lsof -n -iTCP:3000 -sTCP:LISTEN -t', {
        encoding: 'utf8',
      }).trim();
      const pids = lsofOutput
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean);

      for (const pidStr of pids) {
        const pid = parseInt(pidStr, 10);
        if (!pid || pid === process.pid) continue;

        let cmd = '';
        try {
          cmd = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8' }).trim();
        } catch {}

        const isSifrOrNext = cmd.includes('next') || cmd.includes('sifr');

        if (isSifrOrNext) {
          console.log(
            `[SIFR Startup] Terminating stale SIFR Next.js process (PID: ${pid})...`
          );
          try {
            process.kill(pid, 'SIGTERM');
            const deadline = Date.now() + 3000;
            while (Date.now() < deadline) {
              const check = await checkTcpConnection(3000, '127.0.0.1', 200);
              if (!check.ok) break;
              await new Promise((r) => setTimeout(r, 200));
            }
          } catch {}

          const remainingCheck = await checkTcpConnection(3000, '127.0.0.1', 200);
          if (remainingCheck.ok) {
            try {
              process.kill(pid, 'SIGKILL');
              await new Promise((r) => setTimeout(r, 400));
            } catch {}
          }
          console.log(`[SIFR Startup] ✓ Stale SIFR process terminated. Port 3000 freed.`);
        } else {
          console.warn(
            `[SIFR Startup Warning] Port 3000 is occupied by an external process (PID: ${pid}, command: "${cmd}"). Next.js may bind to another port (e.g. 3001).`
          );
        }
      }
    } catch (err) {
      console.warn(
        `[SIFR Startup Warning] Could not inspect process on port 3000: ${err.message}`
      );
    }
  }
}

function verifyStorefront() {
  const url = 'http://localhost:3000';
  const start = Date.now();
  const maxWaitMs = 60000;

  const timer = setInterval(async () => {
    if (Date.now() - start > maxWaitMs) {
      clearInterval(timer);
      return;
    }
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        clearInterval(timer);
        console.log(
          '\n[SIFR Startup] ✓ Storefront live at http://localhost:3000 (HTTP 200)'
        );
        console.log('[SIFR Startup] ✓ SSR and Prisma queries operational.');
        console.log('[SIFR Startup] READY\n');
      }
    } catch {
      // Waiting for server to accept connections
    }
  }, 1000);
}

async function main() {
  console.log('='.repeat(65));
  console.log('               SIFR Development Server Startup');
  console.log('='.repeat(65));

  // 1. Check PostgreSQL & Prisma
  try {
    await ensurePostgresRunning();
  } catch (err) {
    if (err.isSandboxEperm) {
      console.error('\n' + '='.repeat(75));
      console.error('[SIFR Startup Failure: Socket Permission Denied (connect EPERM 127.0.0.1:5432)]');
      console.error('='.repeat(75));
      console.error('The process cannot open TCP sockets to localhost.');
      console.error('Root cause:');
      console.error('The command was executed inside a restricted sandbox environment (such as an');
      console.error('isolated AI agent runner or container) where network and socket access is blocked.');
      console.error('');
      console.error('PostgreSQL may be running, but this process does not have permission to connect.');
      console.error('To resolve this:');
      console.error('Run "npm run dev" directly in your normal local terminal (macOS Terminal, iTerm,');
      console.error('VS Code terminal, etc.) or outside the sandbox environment.');
      console.error('='.repeat(75) + '\n');
      process.exit(1);
    }

    console.error('\n' + '='.repeat(75));
    console.error('[SIFR Startup Failure: PostgreSQL Not Reachable]');
    console.error('='.repeat(75));
    console.error('PostgreSQL is not reachable at localhost:5432.');
    console.error('Detail:', err.message);
    console.error('Action: Start PostgreSQL and retry.');
    console.error('='.repeat(75) + '\n');
    process.exit(1);
  }

  // 2. Check Port 3000
  await handlePort3000();

  // 3. Clear conflicting production build artifacts if present
  const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
  if (fs.existsSync(buildIdPath)) {
    console.log('[SIFR Startup] Detected production build artifacts in .next. Resetting build manifests for development mode...');
    try {
      const targets = [
        path.join(process.cwd(), '.next', 'BUILD_ID'),
        path.join(process.cwd(), '.next', 'build-manifest.json'),
        path.join(process.cwd(), '.next', 'app-build-manifest.json'),
        path.join(process.cwd(), '.next', 'static', 'css'),
      ];
      for (const target of targets) {
        if (fs.existsSync(target)) {
          fs.rmSync(target, { recursive: true, force: true });
        }
      }
      console.log('[SIFR Startup] ✓ Cleaned production build manifests for development mode.');
    } catch (err) {
      console.warn('[SIFR Startup Warning] Failed to clean build artifacts:', err.message);
    }
  }

  // 4. Launch Next.js dev server
  console.log('[SIFR Startup] Launching Next.js development server...\n');
  const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next');

  const child = spawn(nextBin, ['dev'], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  // 5. Background verification of storefront
  verifyStorefront();

  child.on('error', (err) => {
    console.error('[SIFR Startup Error] Failed to launch Next.js:', err);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });

  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
}

main().catch((err) => {
  console.error('[SIFR Startup Fatal Error]:', err);
  process.exit(1);
});
