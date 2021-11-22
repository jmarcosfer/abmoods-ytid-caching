const { Client } = require('@elastic/elasticsearch');
const scraper = require('./scraper');

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

    console.info(`Returned ${resp.body.hits.total.relation} ${resp.body.hits.total.value} results`);
    return resp.body.hits.hits.map( (h) => {
        return {
            mbid: h["_id"],
            title: h["_source"].metadata.tags.title,
            artist: h["_source"].metadata.tags.artist,
            album: h["_source"].metadata.tags.album
        }
    });
}

async function downloadYoutubeID (songDetails) {
    // use 'scraper.youtube(q, key, pageToken)'
}

async function writeToFile (idMap) {
    // write mbid -> ytid map to .csv
}

async function main () {
    try {
        await setupESBackup();
        console.info('Successfully recovered Elasticsearch data from backup');
    } catch (err) {
        console.error(`Elasticsearch backup couldn't be restored \n`);
        console.error(err);
    }

    // 1. Retrieve all songs: mbid + metadata(title, artist, album)
    const songs = await getAllSongs();
    const testArray = songs.slice(2);

    // 2. Iterate. For each song: a) search youtube and parse for yt ID; b) save to file; c) wait for ~2sec 
    for (let i=0; i < testArray.length; i++) {
        
    }
}

if (process.argv.length == 2) {
    main();
}