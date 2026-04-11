const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { extractBanners } = require('./src/services/extractor');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories setup
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const UNPACKED_DIR = path.join(__dirname, 'unpacked');
const DATA_DIR = path.join(__dirname, 'data');

fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(UNPACKED_DIR);
fs.ensureDirSync(DATA_DIR);

const upload = multer({ dest: UPLOADS_DIR });

app.use(express.static('public'));
app.use(express.json());

// In-memory or simple file-based tracker for extractions
const archiveListPath = path.join(DATA_DIR, 'archives.json');
if (!fs.existsSync(archiveListPath)) {
    fs.writeJsonSync(archiveListPath, []);
}

function getArchives() {
    return fs.readJsonSync(archiveListPath);
}

function saveArchives(archives) {
    fs.writeJsonSync(archiveListPath, archives);
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
        const archives = getArchives();
        const archObj = {
            id,
            originalName,
            size,
            uploadedAt,
            status: 'processing',
            bannerCount: 0
        };
        archives.push(archObj);
        saveArchives(archives);
        
        // Return OK instantly, process in background
        res.json({ success: true, id, message: 'Upload received, processing started.' });
        
        // Background extraction
        setTimeout(async () => {
            try {
                const zip = new AdmZip(targetZipPath);
                zip.extractAllTo(unpackedTargetDir, true);
                
                // Check for nested .zip files (like package.zip typically found in Sitecore packages)
                const unzippedItems = await fs.readdir(unpackedTargetDir);
                for (const item of unzippedItems) {
                    if (item.toLowerCase().endsWith('.zip')) {
                        const innerZipPath = path.join(unpackedTargetDir, item);
                        const innerZip = new AdmZip(innerZipPath);
                        // Extract to a folder named without the .zip extension (e.g. package.zip to /package/)
                        const innerTarget = path.join(unpackedTargetDir, item.replace(/\.zip$/i, ''));
                        innerZip.extractAllTo(innerTarget, true);
                    }
                }

                const banners = await extractBanners(unpackedTargetDir);
                await fs.writeJson(dataFilePath, banners, { spaces: 2 });
                
                // Update status
                const currentArchives = getArchives();
                const target = currentArchives.find(a => a.id === id);
                if (target) {
                    target.status = 'ready';
                    target.bannerCount = banners.length;
                    saveArchives(currentArchives);
                }
            } catch (err) {
                console.error('Background processing error:', err);
                const currentArchives = getArchives();
                const target = currentArchives.find(a => a.id === id);
                if (target) {
                    target.status = 'error';
                    target.error = err.message;
                    saveArchives(currentArchives);
                }
            }
        }, 0);
        
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.get('/api/archives', (req, res) => {
    res.json(getArchives().sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)));
});

app.delete('/api/archives/:id', async (req, res) => {
    const id = req.params.id;
    const archives = getArchives();
    const filtered = archives.filter(a => a.id !== id);
    if (archives.length === filtered.length) return res.status(404).json({error: 'Not found'});
    
    saveArchives(filtered);
    
    // Clean up
    await fs.remove(path.join(UPLOADS_DIR, `${id}.zip`)).catch(()=>{});
    await fs.remove(path.join(UNPACKED_DIR, id)).catch(()=>{});
    await fs.remove(path.join(DATA_DIR, `${id}.json`)).catch(()=>{});
    
    res.json({success: true});
});

app.get('/api/banners/:id', async (req, res) => {
    const dataFilePath = path.join(DATA_DIR, `${req.params.id}.json`);
    if (await fs.pathExists(dataFilePath)) {
        res.sendFile(dataFilePath);
    } else {
        res.status(404).json({ error: 'Data not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
