import { Client } from '@elastic/elasticsearch';
import scraper from './scraper.js';
import fs from 'fs';
import log from './logging.js';

const esClient = new Client({ node: 'http://localhost:9200' });


async function setupESBackup () {
    let repositoryExists = false;
    try {
        const getResp = await esClient.snapshot.getRepository({
            repository: 'acbrainz_backup'
        });
        repositoryExists = getResp.statusCode == 200 ? true : false;
    } catch (err) {
        await esClient.snapshot.createRepository({
            repository: 'acbrainz_backup',
            body: {
                type: 'fs',
                settings: {
                    location: '/mnt/backups/'
                }
            }
        })
    } finally {
        if (!repositoryExists) {
            await esClient.snapshot.restore({
                repository: 'acbrainz_backup',
                snapshot: 'snapshot_01_dyn_withapi'
            });
        }
    }
}

async function getAllSongs () {
    const resp = await esClient.search({
        index: 'acbrainz_highlevel',
        scroll: '1h',
        body: {
            query: {
                match_all: {}
            }
        },
        _source: ["_id", "metadata.tags.title", "metadata.tags.artist", "metadata.tags.album"]
    });

    log.info(`Returned ${resp.body.hits.total.relation} ${resp.body.hits.total.value} results`);

    // Prepare data structure for iteration
    let arr = resp.body.hits.hits;
    let songs = {};
    for (let i=0; i < 4; i++) { // temporary, only test with first 4 values
        let h = arr[i];
        let next;
        if (i == 0) songs.start = h._id;
        if (i == 3) { // !arr[i+1]
            next = null;
        } else {
            next = arr[i+1]._id;
        }

        if (i == 0) songs.start = h._id; 
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
    }

    // 1.a Retrieve all songs: mbid + metadata(title, artist, album)
    const songs = await getAllSongs();
    const totalSongs = Object.entries(songs).length;
    let counter = 0;

    async function runRequests (song) {
        log.info(`Downloading ${song.mbid}... (Status: ${counter}/${totalSongs})`);
        let ytData = await downloadYoutubeID(song);
        writeToFile(song.mbid, ytData);
        if (!song.next) {
            return;
        }
    
        counter += 1;
        setTimeout( () => {
            runRequests(songs[song.next]);
        }, getRandomWaitingTime());
    }

    // 2. Iterate. For each song: a) search youtube and parse for yt ID; b) save to file; c) wait for ~2sec \
    await runRequests(songs[songs.start], songs);
}

if (process.argv.length == 2) {
    main();
}