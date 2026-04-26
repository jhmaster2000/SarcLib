import path from 'node:path';
import { SarcFile } from '../dist/index.js';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const sarcBig = new SarcFile(false);

await sarcBig.addFolderContentsFromPath(path.resolve('Psl-8.0.0'));

sarcBig.saveTo(path.join(__dirname, 'Psl-8.0.0.decompressed.szs'));

const readSarc = new SarcFile();

readSarc.loadFrom(path.join(__dirname, 'Psl-8.0.0.decompressed.szs'));
readSarc.extractTo(path.join(__dirname, 'Psl-8.0.0.decompressed'));

console.log('Done!');
