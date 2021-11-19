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

async function getAllIDs () {
    esClient.search({
        index: 'acbrainz_highlevel'
    })
}

async function getSongDetails (acbrainzID) {

}

async function downloadYoutubeID (songDetails) {
    // use 'scraper.youtube(q, key, pageToken)'
}


async function main () {
    try {
        await setupESBackup();
        console.info('Successfully recovered Elasticsearch data from backup');
    } catch (err) {
        console.error(`Elasticsearch backup couldn't be restored \n`);
        console.error(err);
    }
}

if (process.argv.length == 2) {
    main();
}