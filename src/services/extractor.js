const fs = require('fs-extra');
const path = require('path');
const xml2js = require('xml2js');

async function parseXmlFile(filePath) {
    const rawXml = await fs.readFile(filePath, 'utf8');
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, mergeAttrs: false });
    return parser.parseStringPromise(rawXml);
}

function cleanGuid(rawGuid) {
    if (!rawGuid) return '';
    return rawGuid.replace('{', '').replace('}', '').replace(/-/g, '');
}

async function findDir(startPath, targetStructure) {
    let foundPath = null;
    async function walk(dir) {
        if (foundPath) return;
        let files = await fs.readdir(dir);
        for (const file of files) {
            let fullPath = path.join(dir, file);
            let stat = await fs.stat(fullPath);
            if (stat.isDirectory()) {
                const normalized = fullPath.replace(/\\/g, '/').toLowerCase();
                if (normalized.endsWith(targetStructure.toLowerCase())) {
                    foundPath = fullPath;
                    return;
                }
                await walk(fullPath);
            }
        }
    }
    await walk(startPath);
    return foundPath;
}

async function extractBanners(unpackedDirPath) {
    let mediaBasePath = await findDir(unpackedDirPath, 'items/master/sitecore/media library');
    if (!mediaBasePath) mediaBasePath = path.join(unpackedDirPath, 'package/items/master/sitecore/media library');
    
    let basePath = await findDir(unpackedDirPath, 'items/master/sitecore/content');
    if (!basePath) basePath = path.join(unpackedDirPath, 'package/items/master/sitecore/content');
    console.log("RESOLVED BASEPATH:", basePath);

    const mediaCache = {}; // guid -> { [lang]: filepath }
    
    // 1. Build Media Cache
    if (await fs.pathExists(mediaBasePath)) {
        async function walkMedia(dir) {
            let files = await fs.readdir(dir);
            for (const file of files) {
                let fullPath = path.join(dir, file);
                let stat = await fs.stat(fullPath);
                if (stat.isDirectory()) {
                    await walkMedia(fullPath);
                } else if (file.toLowerCase().endsWith('.xml') || file.toLowerCase() === 'xml') {
                    const dirs = path.dirname(fullPath).split(path.sep);
                    if (dirs.length >= 2) {
                        // Sitecore path structure: .../{GUID}/{lang}/{version}/xml
                        const guidCandidate = dirs.length > 2 ? dirs[dirs.length - 3] : '';
                        const langCandidate = dirs.length > 1 ? dirs[dirs.length - 2] : '';
                        if (/^\{.*\}$/.test(guidCandidate)) {
                            if (!mediaCache[guidCandidate]) mediaCache[guidCandidate] = {};
                            mediaCache[guidCandidate][langCandidate] = fullPath;
                        }
                    }
                }
            }
        }
        await walkMedia(mediaBasePath);
    }

    const results = [];
    
    // 2. Iterate over content
    if (await fs.pathExists(basePath)) {
        async function walkContent(dir) {
            let files = await fs.readdir(dir);
            for (const file of files) {
                let fullPath = path.join(dir, file);
                let stat = await fs.stat(fullPath);
                if (stat.isDirectory()) {
                    await walkContent(fullPath);
                } else if (file.toLowerCase().endsWith('.xml') || file.toLowerCase() === 'xml') {
                    try {
                        const xmlDoc = await parseXmlFile(fullPath);
                        if (xmlDoc && xmlDoc.item && xmlDoc.item.$ && xmlDoc.item.$.template === 'banner') {
                            const item = xmlDoc.item;
                            const attr = item.$ || {};
                            const relPath = fullPath.substring(basePath.length).replace(/\\xml$/, '').replace(/\/xml$/, '');
                            const parts = relPath.split(path.sep).filter(Boolean);
                            
                            let baseFolder = '';
                            let subFolder = '';
                            
                            // Emulate original PS script behavior logic - usually parts[1] is base, parts[2] sub
                            // e.g. Mijn Essent\SBS\Banners\BASE\SUB\item
                            const bannersIndex = parts.findIndex(p => p.toLowerCase() === 'banners');
                            if (bannersIndex !== -1 && parts.length > bannersIndex + 1) {
                                baseFolder = parts[bannersIndex + 1];
                                if (parts.length > bannersIndex + 2 && (bannersIndex + 2) < parts.length - 1) { // -1 to avoid picking item itself
                                  subFolder = parts[bannersIndex + 2];
                                }
                            } else {
                                baseFolder = parts.length > 2 ? parts[parts.length - 3] : '';
                                subFolder = parts.length > 1 ? parts[parts.length - 2] : '';
                            }
                            
                            let bannerData = {
                                Id: attr.id || '',
                                Name: attr.name || '',
                                Language: attr.language || '',
                                Path: relPath,
                                BaseFolder: baseFolder,
                                SubFolder: subFolder,
                                Title: '',
                                Subtitle: '',
                                CampaignId: '',
                                Created: '',
                                Updated: '',
                                HeroImage: '',
                                AppTitle: '',
                                AppSubtitle: '',
                                AppImage: '',
                                AppImageAlt: '',
                                DismissBannerLabel: '',
                                CTAs: []
                            };

                            let fields = item.fields && item.fields.field ? item.fields.field : [];
                            if (!Array.isArray(fields)) fields = [fields];

                            let appImageGuid = '';

                            for (const field of fields) {
                                if (!field) continue;
                                const key = field.$ && field.$.key ? field.$.key : '';
                                const content = typeof field.content === 'object' ? field.content._ || '' : field.content || '';
                                
                                if (key === 'title') bannerData.Title = content;
                                else if (key === 'subtitle') bannerData.Subtitle = content;
                                else if (key === 'campaignid') bannerData.CampaignId = content;
                                else if (key === '__created') bannerData.Created = content;
                                else if (key === '__updated') bannerData.Updated = content;
                                else if (key === 'appbannertitle') bannerData.AppTitle = content;
                                else if (key === 'appbannersubtitle') bannerData.AppSubtitle = content;
                                else if (key === 'dismissbannerlabel') bannerData.DismissBannerLabel = content;
                                else if (['heroimage', 'background', 'contentimage'].includes(key)) {
                                    if (!bannerData.HeroImage && typeof content === 'string') {
                                        const match = content.match(/mediaid="({[^}]+})"/);
                                        if (match) bannerData.HeroImage = `${cleanGuid(match[1])}.ashx`;
                                    }
                                }
                                else if (key === 'appbannerimage') {
                                    if (typeof content === 'string') {
                                        const match = content.match(/mediaid="({[^}]+})"/);
                                        if (match) {
                                            appImageGuid = match[1];
                                            bannerData.AppImage = `${cleanGuid(appImageGuid)}.ashx`;
                                        }
                                        const altMatch = content.match(/alt="([^"]+)"/i);
                                        if (altMatch) bannerData.AppImageAlt = altMatch[1].replace(/[\n\r]/g, ' ').trim();
                                    }
                                }
                                else if (key.includes('calltoaction') && typeof content === 'string') {
                                    if (content.startsWith('<link ')) {
                                        try {
                                            const linkXml = await new xml2js.Parser({ explicitArray: false }).parseStringPromise(`<root>${content}</root>`);
                                            const linkObj = linkXml.root && linkXml.root.link ? linkXml.root.link : null;
                                            if (linkObj && linkObj.$) {
                                                const attr = linkObj.$;
                                                const lText = attr.text || attr.title || '';
                                                const lType = attr.linktype || '';
                                                let lUrl = '';
                                                
                                                if (lType === 'external') lUrl = attr.url || '';
                                                else if (lType === 'internal') lUrl = 'Sitecore ID: ' + attr.id;
                                                else if (lType === 'media') lUrl = 'Media ID: ' + attr.id;
                                                else lUrl = attr.url || '';
                                                
                                                if (lText || lUrl) {
                                                    bannerData.CTAs.push({ Key: key, Text: lText, Url: lUrl, Type: lType });
                                                }
                                            }
                                        } catch (e) {
                                           // silent fail for link parse
                                        }
                                    }
                                }
                            }

                            // Resolve alt text from media library if not present
                            if (!bannerData.AppImageAlt && appImageGuid && mediaCache[appImageGuid]) {
                                const mDict = mediaCache[appImageGuid];
                                const bLang = bannerData.Language;
                                let mPath = mDict[bLang] || Object.values(mDict)[0];
                                
                                if (mPath && await fs.pathExists(mPath)) {
                                    try {
                                        const mXml = await parseXmlFile(mPath);
                                        let mFields = mXml.item && mXml.item.fields && mXml.item.fields.field ? mXml.item.fields.field : [];
                                        if (!Array.isArray(mFields)) mFields = [mFields];
                                        for (const mField of mFields) {
                                            const mKey = mField.$ && mField.$.key ? mField.$.key : '';
                                            if (mKey === 'alt' && mField.content) {
                                                const mContent = typeof mField.content === 'object' ? mField.content._ || '' : mField.content;
                                                bannerData.AppImageAlt = mContent.trim();
                                                break;
                                            }
                                        }
                                    } catch (e) {}
                                }
                            }
                            
                            results.push(bannerData);
                        }
                    } catch (e) {
                        console.warn('Failed to parse', fullPath);
                    }
                }
            }
        }
        await walkContent(basePath);
    }
    
    return results;
}

module.exports = { extractBanners };
