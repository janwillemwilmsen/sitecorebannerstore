const fs = require('fs-extra');
const path = require('path');
const xml2js = require('xml2js');

async function debugExtract() {
    const basePath = 'c:\\www\\sitecorebannerstore\\unpacked\\561422fc-85cc-4b99-8dfe-76b2feba9543\\package\\package - kopie\\items\\master\\sitecore\\content';
    let filesChecked = 0;
    async function walkContent(dir) {
        let files = await fs.readdir(dir);
        for (const file of files) {
            let fullPath = path.join(dir, file);
            let stat = await fs.stat(fullPath);
            if (stat.isDirectory()) {
                await walkContent(fullPath);
            } else if (file.endsWith('.xml')) {
                filesChecked++;
                try {
                    const rawXml = await fs.readFile(fullPath, 'utf8');
                    const xmlDoc = await new xml2js.Parser({ explicitArray: false, ignoreAttrs: false, mergeAttrs: false }).parseStringPromise(rawXml);
                    
                    if (xmlDoc && xmlDoc.item && xmlDoc.item.$ && xmlDoc.item.$.template === 'banner') {
                        console.log("FOUND ONE!", fullPath);
                    } else if (filesChecked < 5) {
                        console.log("NOT A BANNER:", xmlDoc?.item?.$?.template, fullPath);
                    }
                } catch(e) {}
            }
        }
    }
    
    await walkContent(basePath);
    console.log("Total XMLs checked:", filesChecked);
}

debugExtract();
