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
    try {
    	await esClient.snapshot.getRepository({
            repository: 'acbrainz_backup'
        });
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
    let songs = [];
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

        songs.push({
            mbid: h._id,
            title: h._source.metadata.tags.title,
            artist: h._source.metadata.tags.artist,
            album: h._source.metadata.tags.album,
            next: next
        });
    }

    saveJSON(songs);
}




function saveJSON (obj) {
    fs.writeFileSync('songs-data.json', JSON.stringify(obj));
    log.info('Saved songs to file');
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

    try {
        await getAllSongs();
    } catch (err) { log.error(err) }
}

if (process.argv.length == 2) {
    main();
}
