/*
 https://github.com/kinnay/Nintendo-File-Formats/wiki/SARC-File-Format
 Based on SarcLib by MasterVermilli0n/AboodXD and sarc by zeldamods/leoetlino
 */
import { FileEntry } from './FileEntry.js';
import { alignUp, FileDataSection, hashFileName, SARCSection, SFATSection, SFNTSection } from './Sections.js';
import { compressYaz0, decompressYaz0 } from 'yaz0lib-ng';

export class SarcFile {

    private hashMultiplier: number = 0x65;
    private isLittleEndian: boolean;
    private defaultAlignment = 0x04;

    private entries: Array<FileEntry> = [];

    /**
     * Construct a new SARC archive.
     * This library
     * - does not support files with duplicate names
     * - does not support files without name
     *
     * @param isLittleEndian if `true`, endian is set to little, if `false` endian is set to big
     */
    constructor(isLittleEndian: boolean = false) {
        this.isLittleEndian = isLittleEndian;
    }

    /**
     * Add a file to this SARC archive.
     *
     * @param file a FileEntry instance
     */
    addFile(file: FileEntry) {
        this.entries.push(file);
    }

    /**
     * Add a file to this SARC archive.
     * In order to 'put' it in a folder, use a custom `destinationFilePath`
     *
     * @param data raw file `Uint8Array`
     * @param destinationFilePath e.g. `image.jpg`, or `extra/image.jpg`
     */
    addRawFile(data: Uint8Array, destinationFilePath: string) {
        this.entries.push(new FileEntry(data, destinationFilePath));
    }

    /**
     * Remove a specific FileEntry from the contents.
     * Use `getFiles()` to know which objects are available.
     *
     * @param file the FileEntry object to remove.
     */
    removeFile(file: FileEntry) {
        this.entries.splice(this.entries.indexOf(file), 1);
    }

    /**
     * Get all FileEntries in this SARC archive.
     */
    getFiles() {
        return this.entries;
    }

    /**
     * Instead of using the default-default alignment of `0x04`, use a different value.
     *
     * @param value the new default alignment
     * @throws Error if alignment is not non-zero or not a power of 2
     */
    setDefaultAlignment(value: number) {
        if (value === 0 || (value & Number((value - 1) !== 0)) >>> 0) {
            throw new Error('Alignment must be a non-zero power of 2');
        }
        this.defaultAlignment = value;
    }

    /**
     * Set the hash multiplier used for filename hashing.
     *
     * @param value the new hash multiplier
     */
    setHashMultiplier(value: number) {
        this.hashMultiplier = value;
    }

    /**
     * Return whether the SARC archive is little endian.
     *
     * @returns `true` if little, `false` if big
     */
    getIsLittleEndian(): boolean {
        return this.isLittleEndian;
    }

    /**
     * Set endian of the SARC archive to little.
     *
     * @param isLittleEndian if `true`, endian is set to little, if `false` endian is set to big
     */
    setLittleEndian(isLittleEndian: true | false) {
        this.isLittleEndian = isLittleEndian;
    }

    private readUInt16(buffer: Uint8Array, offset: number = 0) {
        const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        return dv.getUint16(offset, this.isLittleEndian);
    }

    private readUInt32(buffer: Uint8Array, offset: number = 0) {
        const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        return dv.getUint32(offset, this.isLittleEndian);
    }

    private static readName(data: Uint8Array, offset: number): string {
        const end = data.indexOf(0, offset);
        return new TextDecoder().decode(data.subarray(offset, end));
    }

    private parseFileNodes(data: Uint8Array, nodeOffset: number, nodeCount: number, nameTableOffset: number, dataOffset: number) {
        const nodes: Array<FileEntry> = [];

        let offset = nodeOffset;
        for (let i = 0; i < nodeCount; i++) {
            const nameHash = this.readUInt32(data, offset);
            const nameId = this.readUInt32(data, offset + 4);
            //const _hasFilename = nameId >>> 24;
            const nameOffset = (nameId & 0xFFFFFF) >>> 0;
            const fileDataBegin = this.readUInt32(data, offset + 8) + dataOffset;
            const fileDataEnd = this.readUInt32(data, offset + 0xC) + dataOffset;

            if (nameId === 0) {
                throw new Error('Unnamed files are not supported');
            }
            const absNameOffset = nameTableOffset + 4 * nameOffset;
            if (absNameOffset > dataOffset) {
                throw new Error('Invalid name offset for 0x' + nameHash.toString(16));
            }

            const name = SarcFile.readName(data, absNameOffset);
            nodes.push(new FileEntry(data.subarray(fileDataBegin, fileDataEnd), name));
            offset += 0x10;
        }

        return nodes;
    }

    /**
     * Load and parse a SARC archive.
     * File may be compressed with Yaz0.
     *
     * @param data the raw sarc file data `Uint8Array`
     * @throws Error if the SARC archive is invalid or unsupported
     */
    load(data: Uint8Array) {
        let decompressed = data;
        try {
            decompressed = decompressYaz0(decompressed);
        } catch {
            // suppress error
        }

        // This mirrors what the official library does when reading an archive
        // (sead::SharcArchiveRes::prepareArchive_)

        // Parse the SARC header.
        if (new TextDecoder().decode(decompressed.subarray(0x00, 0x04)) !== SARCSection.magic) {
            throw new Error('Unknown SARC magic');
        }
        const bom = decompressed.subarray(0x06, 0x08);
        this.isLittleEndian = bom[0] === 0xFF && bom[1] === 0xFE;
        if (!this.isLittleEndian && !(bom[0] === 0xFE && bom[1] === 0xFF)) {
            throw new Error('Invalid BOM');
        }
        const version = this.readUInt16(decompressed, 0x10);
        if (version !== SARCSection.version) {
            throw new Error('Unknown SARC version');
        }
        const sarcHeaderSize = this.readUInt16(decompressed, 0x4);
        if (sarcHeaderSize !== SARCSection.headerSize) {
            throw new Error('Unexpected SARC header size');
        }

        // Parse the SFAT header.
        const sfatHeaderOffset = sarcHeaderSize;
        if (new TextDecoder().decode(decompressed.subarray(sfatHeaderOffset, sfatHeaderOffset + 4)) !== SFATSection.magic) {
            throw new Error('Unknown SFAT magic');
        }
        const sfatHeaderSize = this.readUInt16(decompressed, sfatHeaderOffset + 4);
        if (sfatHeaderSize !== SFATSection.headerSize) {
            throw new Error('Unexpected SFAT header size');
        }
        const nodeCount = this.readUInt16(decompressed, sfatHeaderOffset + 6);
        const nodeOffset = sarcHeaderSize + sfatHeaderSize;
        if ((nodeCount >>> 0xE) !== 0) {
            throw new Error('Too many entries');
        }

        // Parse the SFNT header.
        const sfntHeaderOffset = nodeOffset + 0x10 * nodeCount;
        if (new TextDecoder().decode(decompressed.subarray(sfntHeaderOffset, sfntHeaderOffset + 4)) !== SFNTSection.magic) {
            throw new Error('Unknown SFNT magic');
        }
        const sfntHeaderSize = this.readUInt16(decompressed, sfntHeaderOffset + 4);
        if (sfntHeaderSize !== SFNTSection.headerSize) {
            throw new Error('Unexpected SFNT header size');
        }
        const nameTableOffset = sfntHeaderOffset + sfntHeaderSize;

        // Check the data offset.
        const dataOffset = this.readUInt32(decompressed, 0xC);
        if (dataOffset < nameTableOffset) {
            throw new Error('File data should not be stored before the name table');
        }

        this.entries = this.parseFileNodes(decompressed, nodeOffset, nodeCount, nameTableOffset, dataOffset);
    }

    /**
     * Save current SARC archive to a `Uint8Array`.
     *
     * @param compression what Yaz0 compression level to use. `0`: no compression (fastest), `9`: best compression (slowest)
     * @returns the output file `Uint8Array`
     */
    save(compression: number = 0): Uint8Array {
        // File preparations ------------------------------------------
        const hashedList: { [name: number]: FileEntry } = {};

        for (const file of this.entries) {
            file.name = file.name.replaceAll(/[\\/]+/gm, '/');
            hashedList[hashFileName(file.name, this.hashMultiplier)] = file;
        }

        const sortedFlatList = Object.keys(hashedList).sort().reduce(
            (obj, key) => {
                const keyn = key as unknown as keyof typeof hashedList;
                obj[keyn] = hashedList[keyn]!;
                return obj;
            },
            {} as typeof hashedList,
        );
        const sortedHashes = Object.keys(sortedFlatList);

        // Sections ----------------------------------------------------

        // SARC
        const sarc = new SARCSection(this.isLittleEndian);

        // SFAT, SFNT & File Data
        const sfat = new SFATSection(this.isLittleEndian);
        sfat.setHashMultiplier(this.hashMultiplier);
        sfat.setDefaultAlignment(this.defaultAlignment);

        const sfnt = new SFNTSection(this.isLittleEndian);
        const fileData = new FileDataSection(this.isLittleEndian);

        for (const hash of sortedHashes) {
            const file = hashedList[Number(hash)]!;
            const alignment = sfat.addFile(Number(hash), file);
            sfnt.addFile(file);
            fileData.addFile(file, alignment);
        }

        const sfatBuffer = sfat.getBuffer();
        const sfntBuffer = sfnt.getBuffer();

        fileData.setDataOffsetAlignment(sfat.getDataOffsetAlignment());
        fileData.setCursorPosition(SARCSection.headerSize + sfatBuffer.length + sfntBuffer.length);
        const fileDataBuffer = fileData.getBuffer();

        const dataStartOffset = alignUp(
            alignUp(SARCSection.headerSize + sfatBuffer.length + sfntBuffer.length, 0x04),
            sfat.getDataOffsetAlignment(),
        );

        // Write file size and data offset
        const totalFileLength = SARCSection.headerSize + sfatBuffer.length + sfntBuffer.length + fileDataBuffer.length;
        sarc.setFileSize(totalFileLength);
        sarc.setDataOffset(dataStartOffset);

        let outputBuffer = concatUint8([
            sarc.getBuffer(),
            sfatBuffer,
            sfntBuffer,
            fileDataBuffer,
        ]);

        if (compression !== 0) {
            outputBuffer = compressYaz0(outputBuffer, sfat.getDataOffsetAlignment(), compression);
        }

        return outputBuffer;
    }

    /**
     * Extract all SARC archive contents to an in-memory map.
     *
     * @returns Map of filepath -> Uint8Array
     */
    extract(): Map<string, Uint8Array> {
        const out = new Map<string, Uint8Array>();
        for (const file of this.entries) {
            out.set(file.name, file.data);
        }
        return out;
    }
}

// helper used by save to concatenate Uint8Arrays
function concatUint8(arrs: Uint8Array[]): Uint8Array {
    let total = 0;
    for (const a of arrs) total += a.length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const a of arrs) { out.set(a, pos); pos += a.length; }
    return out;
}