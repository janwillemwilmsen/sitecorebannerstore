require('dotenv').config();

const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories setup
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const UNPACKED_DIR = path.join(__dirname, 'unpacked');
const DATA_DIR = path.join(__dirname, 'data');

fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(UNPACKED_DIR);
fs.ensureDirSync(DATA_DIR);

const upload = multer({ 
    dest: UPLOADS_DIR,
    limits: { fileSize: 500 * 1024 * 1024 } // 500 MB limit
});

app.use(express.json());

// --- Authentication: single shared passphrase ------------------------------
// The login page and the login/logout endpoints are the only routes reachable
// without a valid session cookie. Everything registered after the requireAuth
// gate below (static files + API) is private.
const APP_PASSPHRASE = process.env.APP_PASSPHRASE;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_COOKIE = 'sbs_auth';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

if (!APP_PASSPHRASE) {
    console.error('FATAL: APP_PASSPHRASE is not set. Copy .env.example to .env and set a passphrase.');
    process.exit(1);
}
if (!process.env.SESSION_SECRET) {
    console.warn('WARNING: SESSION_SECRET is not set; using a random one. Active logins will be invalidated on restart.');
}

// Stateless auth cookie ("<expiry>.<hmac>"): no server-side session store is
// needed, and logins survive restarts as long as SESSION_SECRET is stable.
function signValue(value) {
    return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}
function issueToken() {
    const exp = String(Date.now() + SESSION_TTL_MS);
    return `${exp}.${signValue(exp)}`;
}
function verifyToken(token) {
    if (typeof token !== 'string') return false;
    const dot = token.indexOf('.');
    if (dot === -1) return false;
    const sig = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(signValue(token.slice(0, dot)));
    if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return false;
    const exp = Number(token.slice(0, dot));
    return Number.isFinite(exp) && exp > Date.now();
}
function passphraseMatches(input) {
    if (typeof input !== 'string') return false;
    const a = Buffer.from(input);
    const b = Buffer.from(APP_PASSPHRASE);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
    }
    return out;
}
function isAuthed(req) {
    return verifyToken(parseCookies(req.headers.cookie)[AUTH_COOKIE]);
}

app.get('/login', (req, res) => {
    if (isAuthed(req)) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const passphrase = req.body && req.body.passphrase;
    if (!passphraseMatches(passphrase)) {
        return res.status(401).json({ error: 'Incorrect passphrase.' });
    }
    res.cookie(AUTH_COOKIE, issueToken(), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS
    });
    res.json({ success: true });
});

app.post('/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    res.json({ success: true });
});
app.get('/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    res.redirect('/login');
});

// Gate: every route registered after this requires a valid session.
function requireAuth(req, res, next) {
    if (isAuthed(req)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Authentication required' });
    return res.redirect('/login');
}
app.use(requireAuth);
app.use(express.static('public'));

// File-based tracker for extractions
const archiveListPath = path.join(DATA_DIR, 'archives.json');
if (!fs.existsSync(archiveListPath)) {
    fs.writeJsonSync(archiveListPath, []);
}

async function readArchives() {
    return fs.readJson(archiveListPath).catch(() => []);
}

// Serialize all read-modify-write cycles through a single chain so concurrent
// uploads/extractions can't clobber each other's updates, and write atomically
// (temp file + rename) so a concurrent reader never sees a half-written file.
let archiveWriteChain = Promise.resolve();
function mutateArchives(mutator) {
    const run = async () => {
        const archives = await readArchives();
        await mutator(archives);
        const tmpPath = `${archiveListPath}.${crypto.randomUUID()}.tmp`;
        await fs.writeJson(tmpPath, archives, { spaces: 2 });
        await fs.move(tmpPath, archiveListPath, { overwrite: true });
    };
    // Run regardless of whether the previous mutation resolved or rejected.
    const result = archiveWriteChain.then(run, run);
    archiveWriteChain = result.catch(() => {});
    return result;
}

// Archive IDs are server-generated UUIDs; validating the route param keeps
// untrusted input from escaping the data directory via path traversal.
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidId(id) {
    return typeof id === 'string' && ID_PATTERN.test(id);
}

// Upload endpoint
app.post('/api/upload', upload.single('zipfile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const id = crypto.randomUUID();
    const originalName = req.file.originalname;
    const size = req.file.size;
    const uploadedAt = new Date().toISOString();
    
    const targetZipPath = path.join(UPLOADS_DIR, `${id}.zip`);
    const unpackedTargetDir = path.join(UNPACKED_DIR, id);
    const dataFilePath = path.join(DATA_DIR, `${id}.json`);
    
    try {
        await fs.move(req.file.path, targetZipPath);

        // Register early so the UI sees it as "processing"
        await mutateArchives((archives) => {
            archives.push({ id, originalName, size, uploadedAt, status: 'processing', bannerCount: 0 });
        });

        // Return OK instantly; extraction runs off the event loop in a worker.
        res.json({ success: true, id, message: 'Upload received, processing started.' });

        startExtraction({ id, zipPath: targetZipPath, unpackedTargetDir, dataFilePath });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Offload the unzip + XML parsing to a worker thread so a large upload can't
// block the event loop (and freeze every other request) while it processes.
function startExtraction({ id, zipPath, unpackedTargetDir, dataFilePath }) {
    const worker = new Worker(path.join(__dirname, 'src', 'services', 'extractionWorker.js'), {
        workerData: { zipPath, unpackedTargetDir, dataFilePath }
    });

    let settled = false;
    const finish = (patch) => {
        if (settled) return;
        settled = true;
        mutateArchives((archives) => {
            const target = archives.find((a) => a.id === id);
            if (target) Object.assign(target, patch);
        });
    };

    worker.on('message', (msg) => {
        if (msg.ok) finish({ status: 'ready', bannerCount: msg.bannerCount });
        else finish({ status: 'error', error: msg.error });
    });
    worker.on('error', (err) => {
        console.error('Extraction worker error:', err);
        finish({ status: 'error', error: err.message });
    });
    worker.on('exit', (code) => {
        if (code !== 0) finish({ status: 'error', error: `Extraction worker stopped unexpectedly (exit ${code})` });
    });
}

app.get('/api/archives', async (req, res) => {
    const archives = await readArchives();
    res.json(archives.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)));
});

app.delete('/api/archives/:id', async (req, res) => {
    const id = req.params.id;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid archive id' });

    let found = false;
    await mutateArchives((archives) => {
        const idx = archives.findIndex((a) => a.id === id);
        if (idx !== -1) { archives.splice(idx, 1); found = true; }
    });
    if (!found) return res.status(404).json({ error: 'Not found' });

    // Clean up
    await fs.remove(path.join(UPLOADS_DIR, `${id}.zip`)).catch(() => {});
    await fs.remove(path.join(UNPACKED_DIR, id)).catch(() => {});
    await fs.remove(path.join(DATA_DIR, `${id}.json`)).catch(() => {});

    res.json({ success: true });
});

app.get('/api/banners/:id', async (req, res) => {
    const id = req.params.id;
    if (!isValidId(id)) return res.status(400).json({ error: 'Invalid archive id' });
    const dataFilePath = path.join(DATA_DIR, `${id}.json`);
    if (await fs.pathExists(dataFilePath)) {
        res.sendFile(dataFilePath);
    } else {
        res.status(404).json({ error: 'Data not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
