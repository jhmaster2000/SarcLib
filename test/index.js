import fs from 'node:fs';
import path from 'node:path';
import { SarcFile } from '../dist/index.js';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const SARC_DIR = path.join(__dirname, 'dv_Yougan_2_extracted');
fs.rmSync(SARC_DIR, { recursive: true, force: true });

const readSarc = new SarcFile();
readSarc.loadFrom(path.join(__dirname, 'dv_Yougan_2.szs'));
readSarc.extractTo(SARC_DIR);

const sarcBig = new SarcFile();
await sarcBig.addFolderContentsFromPath(SARC_DIR);
sarcBig.saveTo(path.join(__dirname, 'dv_Yougan_2_resaved.sarc'));
sarcBig.saveTo(path.join(__dirname, 'dv_Yougan_2_resaved.szs'), 9);

console.log('Done!');
