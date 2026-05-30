const { parentPort, workerData } = require('worker_threads');
const AdmZip = require('adm-zip');
const fs = require('fs-extra');
const path = require('path');
const { extractBanners } = require('./extractor');

// Extract a zip while rejecting entries that would write outside the target
// directory (Zip Slip / path traversal via "../" or absolute entry names).
function extractZipSafely(zipPath, targetDir) {
    const zip = new AdmZip(zipPath);
    const resolvedTarget = path.resolve(targetDir);
    for (const entry of zip.getEntries()) {
        const entryPath = path.resolve(resolvedTarget, entry.entryName);
        if (entryPath !== resolvedTarget && !entryPath.startsWith(resolvedTarget + path.sep)) {
            throw new Error(`Unsafe zip entry (path traversal): ${entry.entryName}`);
        }
    }
    zip.extractAllTo(targetDir, true);
}

async function run() {
    const { zipPath, unpackedTargetDir, dataFilePath } = workerData;

    extractZipSafely(zipPath, unpackedTargetDir);

    // Sitecore packages typically wrap the items in a nested package.zip.
    const unzippedItems = await fs.readdir(unpackedTargetDir);
    for (const item of unzippedItems) {
        if (item.toLowerCase().endsWith('.zip')) {
            const innerZipPath = path.join(unpackedTargetDir, item);
            const innerTarget = path.join(unpackedTargetDir, item.replace(/\.zip$/i, ''));
            extractZipSafely(innerZipPath, innerTarget);
        }
    }

    const banners = await extractBanners(unpackedTargetDir);
    await fs.writeJson(dataFilePath, banners, { spaces: 2 });
    return banners.length;
}

run()
    .then((bannerCount) => parentPort.postMessage({ ok: true, bannerCount }))
    .catch((err) => parentPort.postMessage({ ok: false, error: err.message }));
