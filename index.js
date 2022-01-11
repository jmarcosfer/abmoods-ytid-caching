import { Client } from '@elastic/elasticsearch';
import scraper from './scraper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import log from './logging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const esClient = new Client({ node: 'http://localhost:9200' });


async function setupESBackup () {
    let repositoryExists;
    try {
    	const getResp = await esClient.snapshot.getRepository({
            repository: 'acbrainz_backup'
        });
        repositoryExists = getResp.statusCode == 200 ? true : false;
    } catch (err) {
        log.info('ES Repository didnt exist, creating...');
        await esClient.snapshot.createRepository({
            repository: 'acbrainz_backup',
            body: {
                type: 'fs',
                settings: {
                    location: '/mnt/backups/'
                }
            }
        });

        await esClient.snapshot.restore({
            repository: 'acbrainz_backup',
            snapshot: 'snapshot_01_dyn_withapi'
        });
    }
}

async function getAllSongs () {
    const scrollSearch = await esClient.helpers.scrollSearch({
        index: 'acbrainz_highlevel',
        scroll: '5m',
        size: 10000,
        body: {
            query: {
                match_all: {}
            }
        },
        _source: ["_id", "metadata.tags.title", "metadata.tags.artist", "metadata.tags.album"]
    });

    let allHits = [];
    let firstScroll = true;
    let scrollCount = 0;
    for await (const result of scrollSearch) {
        if (firstScroll) {
            log.info(`Returned ${result.body.hits.total.relation} ${result.body.hits.total.value} results`);
            firstScroll = false;
        }
        scrollCount += 1;
        log.info(`Scrolling through index... ${scrollCount}`);
        allHits = allHits.concat(result.body.hits.hits);
    }

    // Prepare data structure for iteration
    let songs = {};
    for (let i=0; i < allHits.length; i++) {
        let h = allHits[i];
        if (!h._source.metadata) {log.skip(`no metadata could be retrieved for document with mbid: ${h._id}`); continue};
        let next;
        if (i == 0) songs.start = h._id;
        if (!allHits[i+1]) { 
            next = null;
        } else {
            let skipCount = 1;
            next = allHits[i+skipCount]._id;
            while (!allHits[i+skipCount]._source.metadata) {
                skipCount++;
                next = allHits[i+skipCount]._id;
                if (!allHits[i+skipCount]) {
                    next = null;
                    break;
                }
            }
        }

        songs[h._id] = {
            mbid: h._id,
            title: h._source.metadata.tags.title,
            artist: h._source.metadata.tags.artist,
            album: h._source.metadata.tags.album,
            next: next
        }
    }

    return songs;
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
    try {
        await setupESBackup();
        log.info('Successfully recovered Elasticsearch data from backup');
    } catch (err) {
        log.error(err)
        log.info(`Couldn't set up Elasticsearch. Make sure the docker container is running.`);
        return 1;
    }

    // 1.a Retrieve all songs: mbid + metadata(title, artist, album)
    let songs, totalSongs;
    try {
        songs = await getAllSongs();
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
        if (fs.existsSync(path.join(__dirname, `results/${song.mbid}.json`))) {
            log.skip(`Skipping ${song.mbid}, already exists.`);
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
