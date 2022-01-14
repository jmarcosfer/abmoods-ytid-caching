import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main () {
    let downloadedMBIDs = [];
    const downloadedFiles = fs.readdirSync(path.join(__dirname, 'results'));
    
    for (let f of downloadedFiles) {
        const name = f.split('.')[0] // take ID only
        downloadedMBIDs.push(name);
    }

    fs.writeFileSync('downloaded.json', JSON.stringify(downloadedMBIDs));
    console.info(`Saved ${downloadedFiles.length} already downloaded ids to file`);
}

if (process.argv.length == 2) {
    main();
}