import scraper from './scraper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import log from './logging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const previouslyDownloadedPath = path.join(__dirname, 'downloaded.json');
let previouslyDownloadedIDs = null;
if (fs.existsSync(previouslyDownloadedPath)) {
    previouslyDownloadedIDs = JSON.parse(fs.readFileSync(previouslyDownloadedPath));
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
    // 1.a Retrieve all songs: mbid + metadata(title, artist, album)
    let songs, totalSongs;
    try {
        let songsPath = path.join(__dirname, 'songs-data.json');
        if (!fs.existsSync(songsPath)) {
            throw new Error('songs-data.json file not found')
        }
        songs = JSON.parse(fs.readFileSync(songsPath));
        totalSongs = Object.entries(songs).length - 1; // songs obj contains a 'start' id property apart from each song obj
    } catch (err) { log.error(err) }
    
    let counter = 0;
    async function runRequests (song) {
        counter += 1;

        const getNext = () => {
            return new Promise((resolve) => {
                setTimeout( async () => {
                    await runRequests(songs[song.next]);
                    resolve(0);
                }, getRandomWaitingTime());
            })
        };

        // check if song's already been downloaded
        if (previouslyDownloadedIDs instanceof Array && previouslyDownloadedIDs.includes(song.mbid)) {
            log.skip(`Skipping ${song.mbid}, it already exists.`);
            return await getNext();
        }

        log.info(`Downloading ${song.mbid}... (Status: ${counter}/${totalSongs})`);
        let ytData = await downloadYoutubeID(song);
        writeToFile(song.mbid, ytData);
        if (!song.next) {
            log.info('Reached the end of the song list. Done!');
            return 0;
        }
    
        return await getNext();
    }

    // 2. Iterate. For each song: a) search youtube and parse for yt ID; b) save to file; c) wait for ~2sec \
    try {
        console.log('songs.start', songs.start);
        await runRequests(songs[songs.start]);
    } catch (err) { log.error(err) }
}

if (process.argv.length == 2) {
    main();
}
