import scraper from './scraper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import log from './logging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resultsPath = path.join(__dirname, 'results');
let previouslyDownloadedIDs = null;
if (fs.existsSync(resultsPath)) {
    previouslyDownloadedIDs = [];
    const downloadedFiles = fs.readdirSync(resultsPath);
    
    for (let f of downloadedFiles) {
        const name = f.split('.')[0] // take ID only
        previouslyDownloadedIDs.push(name);
    }

    log.info(`Found ${downloadedFiles.length} already downloaded ids in /results directory.`);
}

async function downloadYoutubeID (song) {
    let secondTerm = song.artist;
    if (!song.artist) secondTerm = song.album;

    let ytResponse = await scraper.youtube(`${song.title} ${secondTerm}`, null, null);
    for (let item of ytResponse.results) {
        if (item.hasOwnProperty('video')) { // grab first result that is a video
            return {
                id: item.video.id,
                url: item.video.url
            }
        }
    }
}

function writeToFile (mbid, ytData) {
    // save mbid -> ytdata info
    let data = {mbid: mbid, youtube: ytData};
    fs.writeFileSync(`results/${mbid}.json`, JSON.stringify(data));
    log.info(`Saved ${mbid} to file`);
}

function getRandomWaitingTime() {
    // value: 0.5 to 1.5 seconds
    return 500 + (Math.random() * 1000);
}

async function main () {
    // Retrieve songs: mbid + metadata(title, artist, album)
    let songs, totalSongs;
    try {
        let songsPath = path.join(__dirname, 'songs-data.json');
        if (!fs.existsSync(songsPath)) {
            throw new Error('songs-data.json file not found')
        }
        songs = JSON.parse(fs.readFileSync(songsPath));
        totalSongs = songs.length;
        const whichThird = [1, 2, 3].includes(process.argv[2]) ? process.argv[2] : 1; // default: get first third
        const startIndex = Math.floor((totalSongs * (whichThird - 1) / 3));
        const endIndex = whichThird === 3 ? totalSongs : Math.floor((totalSongs * whichThird / 3));
        songs = songs.slice(startIndex, endIndex);
    } catch (err) { log.error(err) }
    
    const delay = (delayTime) => {
        return new Promise(resolve => {
            setTimeout(resolve, delayTime);
        });
    };

    let counter = 0;
    async function runRequests () {
        for (let song of songs) {
            counter += 1;
            // check if song's already been downloaded
            if (previouslyDownloadedIDs instanceof Array && previouslyDownloadedIDs.includes(song.mbid)) {
                log.skip(`Skipping ${song.mbid}, it already exists.`);
                continue;
            }
    
            log.info(`Downloading ${song.mbid}... (Status: ${counter}/${songs.length})`);
            let ytData;
            try {
                ytData = await downloadYoutubeID(song);
            } catch (err) {
                log.error(err);
                continue;
            }
            writeToFile(song.mbid, ytData);
            await delay(getRandomWaitingTime());
        }
        
        log.info('Reached the end of the song list. Done!');
        return 0;
    }

    // 2. Iterate. For each song: a) search youtube and parse for yt ID; b) save to file; c) wait for ~2sec \
    try {
        log.info('Starting download');
        await runRequests();
    } catch (err) { log.error(err) }
}

if (process.argv.length == 3) {
    main();
} else {
    console.error('Please provide an argument [1-3]: which 1/3 of the songs data you want to download.')
}
