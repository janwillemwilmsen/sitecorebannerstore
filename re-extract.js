const fs = require('fs-extra');
const path = require('path');
const { extractBanners } = require('./src/services/extractor');

const DATA_DIR = path.join(__dirname, 'data');
const UNPACKED_DIR = path.join(__dirname, 'unpacked');

async function reExtractAll() {
    console.log("Starting re-extraction for all unpacked archives...");
    
    // Read archives from data/archives.json
    const archiveListPath = path.join(DATA_DIR, 'archives.json');
    if (!await fs.pathExists(archiveListPath)) {
        console.log("archives.json not found.");
        return;
    }
    
    const archives = await fs.readJson(archiveListPath);
    
    for (const archive of archives) {
        const id = archive.id;
        const unpackedTargetDir = path.join(UNPACKED_DIR, id);
        const dataFilePath = path.join(DATA_DIR, `${id}.json`);
        
        if (await fs.pathExists(unpackedTargetDir)) {
            console.log(`Re-extracting data for archive ${id} (${archive.originalName})...`);
            try {
                const banners = await extractBanners(unpackedTargetDir);
                await fs.writeJson(dataFilePath, banners, { spaces: 2 });
                console.log(`Successfully updated ${id}.json with ${banners.length} banners.`);
                
                archive.bannerCount = banners.length;
            } catch (e) {
                console.error(`Error re-extracting ${id}:`, e.message);
            }
        }
    }
    
    await fs.writeJson(archiveListPath, archives, { spaces: 2 });
    console.log("Done.");
}

reExtractAll();
