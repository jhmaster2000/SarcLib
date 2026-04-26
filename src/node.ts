import fs from 'node:fs';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { SarcFile as SarcFileCore } from './SarcFile.js';

export { FileEntry } from './FileEntry.js';

export class SarcFile extends SarcFileCore {
    /**
     * Load and parse a SARC archive.
     * File may be compressed with Yaz0.
     *
     * @param filePath the sarc file path.
     * @throws Error if the SARC archive is invalid, unsupported, or not found */
    loadFrom(filePath: string) {
        const data = fs.readFileSync(filePath);
        this.load(data);
    };

    /**
     * Save current SARC archive to file.
     *
     * @param filePath the save destination. Will use `.szs` (compressed) or `.sarc` (uncompressed) if no file extension was provided.
     * @param compression what Yaz0 compression level to use. `0`: no compression (fastest), `9`: best compression (slowest)
     * @returns full output file path */
    saveTo(filePath: string, compression: number = 0): string {
        const finalPath = path.resolve(filePath + (/\.[^/.]+$/.test(filePath) ? '' : (compression === 0 ? '.sarc' : '.szs')));
        const out = this.save(compression);
        fs.writeFileSync(finalPath, out);
        return finalPath;
    };

    /**
     * Add a file to the SARC archive.
     * In order to 'put' it in a folder, use a custom `destinationFilePath`
     *
     * @param filePath the path to the file you want to add
     * @param destinationFilePath e.g. `image.jpg`, or `extra/image.jpg` */
    addFileFromPath(filePath: string, destinationFilePath: string = '') {
        const data = fs.readFileSync(filePath);
        this.addRawFile(new Uint8Array(data), destinationFilePath || path.basename(filePath));
    };

    /**
     * Add all files inside a folder to the SARC archive (recursively).
     * Notes:
     * - the contents of this folder are stored in the root of the SARC: the folder itself is not included.
     * - empty directories are skipped
     * In order to 'put' the contents in a folder, use a custom `destinationFolderPath`
     *
     * @param folderPath the path to the folder you want to add
     * @param destinationFolderName e.g. `images`, or `extra/images` */
    async addFolderContentsFromPath(folderPath: string, destinationFolderName: string = '') {
        for await (const f of getFiles(folderPath)) {
            const fileName = f.path
                .replace(folderPath, '') // remove common base paths
                .replaceAll(/^[\\/]+|[\\/]+$/g, ''); // trim slashes
            this.addRawFile(f.data, path.join(destinationFolderName, fileName));
        }
    };

    /**
     * Extract all SARC archive contents to a directory.
     *
     * @param destDir the destination directory path */
    extractTo(destDir: string) {
        const files = this.extract();
        for (const [name, data] of files) {
            const filePath = destDir.replace(/[\\/]$/, '') + '/' + name;
            try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch { /* no-op */ }
            fs.writeFileSync(filePath, data);
        }
    };
}

async function* getFiles(dir: string): AsyncGenerator<{ path: string; data: Uint8Array }, void, unknown> {
    const dirents = await readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
        const res = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
            yield* getFiles(res);
        } else {
            yield { path: res, data: new Uint8Array(fs.readFileSync(res)) };
        }
    }
}
