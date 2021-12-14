import fs from 'fs';
import util from 'util';
import path from 'path';
var __dirname = new URL('.', import.meta.url).pathname;

if (!fs.existsSync('logs')){
  fs.mkdirSync('logs');
}

var infoFile = fs.createWriteStream(path.join(__dirname, 'logs/info.log'), {flags : 'a'});
var debugFile = fs.createWriteStream(path.join(__dirname, 'logs/debug.log'), {flags : 'a'});
var logStdOut = process.stdout;

const log = {};

log.info = function (msg) { //
  infoFile.write(`\n${new Date()}\n${util.format(msg)}\n`);
  logStdOut.write(util.format(msg) + '\n');
};

log.error = function (err) { //
  debugFile.write(`\n${new Date()}\n${util.format(err.stack)}\n`);
  logStdOut.write(util.format(err.stack) + '\n');
};

export default log;
