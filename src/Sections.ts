import { FileEntry } from './FileEntry.js';

abstract class Section {
    private isLittleEndian: boolean;
    protected buffer?: Uint8Array;

    constructor(isLittleEndian: boolean = false) {
        this.isLittleEndian = isLittleEndian;
    }

    setIsLittleEndian(isLittleEndian: boolean) {
        this.isLittleEndian = isLittleEndian;
    }

    abstract getBuffer(): Uint8Array;

    protected writeUInt16(value: number, offset: number = 0, buffer?: Uint8Array, isLittleEndian?: boolean) {
        const little = isLittleEndian === undefined ? this.isLittleEndian : isLittleEndian;
        const dest = buffer ?? this.buffer;
        if (dest === undefined) throw new Error('no buffer');
        const dv = new DataView(dest.buffer, dest.byteOffset, dest.byteLength);
        return little ? dv.setUint16(offset, value, true) : dv.setUint16(offset, value, false);
    }

    protected writeUInt32(value: number, offset: number = 0, buffer?: Uint8Array, isLittleEndian?: boolean) {
        const little = isLittleEndian === undefined ? this.isLittleEndian : isLittleEndian;
        const dest = buffer ?? this.buffer;
        if (dest === undefined) throw new Error('no buffer');
        const dv = new DataView(dest.buffer, dest.byteOffset, dest.byteLength);
        return little ? dv.setUint32(offset, value, true) : dv.setUint32(offset, value, false);
    }

}

function concatUint8(arrs: Uint8Array[]) {
    let total = 0;
    for (const a of arrs) total += a.length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const a of arrs) { out.set(a, pos); pos += a.length; }
    return out;
}

export class SARCSection extends Section {
    static readonly magic = 'SARC';
    public static readonly headerSize = 0x14;
    private static readonly endianConst = 0xFEFF;
    static readonly version = 0x100;
    private fileSize?: number;
    private dataOffset?: number;

    getBuffer(): Uint8Array {
        if (this.fileSize === undefined) throw new Error('SARCSection.getBuffer called before setFileSize');
        if (this.dataOffset === undefined) throw new Error('SARCSection.getBuffer called before setDataOffset');

        this.buffer = new Uint8Array(SARCSection.headerSize);

        const enc = new TextEncoder();
        this.buffer.set(enc.encode(SARCSection.magic), 0);
        this.writeUInt16(SARCSection.headerSize, 0x4);
        this.writeUInt16(SARCSection.endianConst, 0x6);
        this.writeUInt32(this.fileSize, 0x8);
        this.writeUInt32(this.dataOffset, 0xC);
        this.writeUInt16(SARCSection.version, 0x10);
        this.writeUInt16(0, 0x12);

        return this.buffer;
    }

    setFileSize(size: number) {
        this.fileSize = size;
    }

    setDataOffset(offset: number) {
        this.dataOffset = offset;
    }

}

export class SFATSection extends Section {
    static readonly magic = 'SFAT';
    public static readonly headerSize = 0xC;
    public static readonly entrySize = 0x10;
    private hashMultiplier = 0x65;
    private fileBuffers: Uint8Array[] = [];

    private defaultAlignment = 0x04;
    private nameOffset = 0;
    private dataOffset = 0;
    private dataOffsetAlignment = 1;

    addFile(hash: number, file: FileEntry): number {
        const entry = new Uint8Array(SFATSection.entrySize);

        this.writeUInt32(hash, 0x0, entry);
        this.writeUInt32(0x01000000 | (this.nameOffset >>> 2), 0x4, entry);

        const alignment = getDataAlignment(file.data, this.defaultAlignment);
        this.dataOffsetAlignment = Math.max(this.dataOffsetAlignment, alignment);
        this.dataOffset = alignUp(this.dataOffset, alignment);

        this.writeUInt32(this.dataOffset, 0x8, entry);
        this.dataOffset += file.data.length;
        this.writeUInt32(this.dataOffset, 0xC, entry);
        this.nameOffset += alignUp(new TextEncoder().encode(file.name).length + 1, 4);

        this.fileBuffers.push(entry);

        return alignment;
    }

    getBuffer(): Uint8Array {
        this.buffer = new Uint8Array(SFATSection.headerSize);

        const enc = new TextEncoder();
        this.buffer.set(enc.encode(SFATSection.magic), 0);
        this.writeUInt16(SFATSection.headerSize, 0x4);
        this.writeUInt16(this.fileBuffers.length, 0x6);
        this.writeUInt32(this.hashMultiplier, 0x8);

        return concatUint8([this.buffer, ...this.fileBuffers]);
    }

    setHashMultiplier(multiplier: number) {
        this.hashMultiplier = multiplier;
    }

    setDefaultAlignment(alignment: number) {
        this.defaultAlignment = alignment;
    }

    getDataOffsetAlignment() {
        return this.dataOffsetAlignment;
    }

}

export class SFNTSection extends Section {
    static readonly magic = 'SFNT';
    public static readonly headerSize = 0x8;

    private fileBuffers: Uint8Array[] = [];

    addFile(file: FileEntry) {
        const nameBytes = new TextEncoder().encode(file.name);
        const roundedUpLength = alignUp(nameBytes.length + 1, 4);
        const entry = new Uint8Array(roundedUpLength);

        entry.set(nameBytes, 0);

        this.fileBuffers.push(entry);
    }

    getBuffer(): Uint8Array {
        this.buffer = new Uint8Array(SFNTSection.headerSize);

        const enc = new TextEncoder();
        this.buffer.set(enc.encode(SFNTSection.magic), 0);
        this.writeUInt16(SFNTSection.headerSize, 0x4);
        this.writeUInt16(0, 0x6);

        return concatUint8([this.buffer, ...this.fileBuffers]);
    }

}

export class FileDataSection extends Section {
    private fileBuffers: Uint8Array[] = [];
    private sectionSize = 0;

    private dataOffsetAlignment?: number;
    private cursorPosition?: number;

    addFile(file: FileEntry, alignment: number) {
        const totalFileLength = alignUp(this.sectionSize, alignment);
        const padding = totalFileLength - this.sectionSize;

        const pad = new Uint8Array(padding);
        const entry = concatUint8([
            pad,
            file.data,
        ]);

        this.sectionSize += entry.length;
        this.fileBuffers.push(entry);
    }

    getBuffer(): Uint8Array {
        if (this.cursorPosition === undefined) throw new Error('FileDataSection.getBuffer called before setCursorPosition');
        if (this.dataOffsetAlignment === undefined) throw new Error('FileDataSection.getBuffer called before setDataOffsetAlignment');

        const dataPadding = alignUpAsPadding(this.cursorPosition, this.dataOffsetAlignment);
        return concatUint8([
            new Uint8Array(dataPadding),
            ...this.fileBuffers,
        ]);
    }

    setDataOffsetAlignment(dataOffsetAlignment: number) {
        this.dataOffsetAlignment = dataOffsetAlignment;
    }

    setCursorPosition(position: number) {
        this.cursorPosition = position;
    }

}

export function hashFileName(name: string, multiplier: number): number {
    let result = 0;
    for (const byte of new TextEncoder().encode(name)) {
        result = ((result * multiplier + byte) & 0xFFFFFFFF) >>> 0;
    }
    return result;
}

export function alignUp(n: number, alignment: number): number {
    return ((n + alignment - 1) & -alignment) >>> 0;
}

function alignUpAsPadding(n: number, alignment: number): number {
    return (alignment - (n % alignment)) % alignment;
}

function readAscii(slice: Uint8Array) {
    return new TextDecoder().decode(slice);
}

function getDataAlignment(data: Uint8Array, defaultAlignment: number): number {
    if (readAscii(data.subarray(0, 4)) === 'SARC') {
        return 0x2000; // SARC archive
    } else if (readAscii(data.subarray(0, 4)) === 'Yaz0') {
        return 0x80; // Yaz0 compressed archive
    } else if (readAscii(data.subarray(0, 4)) === 'FFNT') {
        return 0x2000; // Wii U/Switch Binary font
    } else if (readAscii(data.subarray(0, 4)) === 'CFNT') {
        return 0x80; // 3DS Binary font
    } else if (
        readAscii(data.subarray(0, 4)) === 'CSTM' ||
        readAscii(data.subarray(0, 4)) === 'FSTM' ||
        readAscii(data.subarray(0, 4)) === 'FSTP' ||
        readAscii(data.subarray(0, 4)) === 'CWAV' ||
        readAscii(data.subarray(0, 4)) === 'FWAV'
    ) {
        return 0x20; // Audio data
    } else if (
        readAscii(data.subarray(0, 4)) === 'BNTX' ||
        readAscii(data.subarray(0, 4)) === 'BNSH' ||
        readAscii(data.subarray(0, 8)) === 'FSHA    '
    ) {
        return 0x1000; // Switch GPU data
    } else if (readAscii(data.subarray(0, 4)) === 'Gfx2' || readAscii(data.subarray(-0x28, -0x24)) === 'FLIM') {
        return 0x2000; // Wii U GPU data and Wii U/Switch Binary Resources
    } else if (readAscii(data.subarray(0, 4)) === 'CTPK') {
        return 0x10; // 3DS Texture package
    } else if (readAscii(data.subarray(0, 4)) === 'CGFX' || readAscii(data.subarray(-0x28, -0x24)) === 'CLIM') {
        return 0x80; // 3DS Layout image and Binary Resources
    } else if (readAscii(data.subarray(0, 4)) === 'AAMP') {
        return 8; // Environment settings
    } else if (
        readAscii(data.subarray(0, 2)) === 'YB' ||
        readAscii(data.subarray(0, 2)) === 'BY' ||
        readAscii(data.subarray(0, 8)) === 'MsgStdBn' ||
        readAscii(data.subarray(0, 8)) === 'MsgPrjBn'
    ) {
        return 0x80;  // Binary text
    } else if (readAscii(data.subarray(0xC, 0x10)) === 'SCDL') {
        return 0x100; // SMM2 Course data
    }

    return Math.max(defaultAlignment, getFileAlignmentForNewBinaryFile(data));
}

function getFileAlignmentForNewBinaryFile(data: Uint8Array): number {
    if (data.length <= 0x20) return 0;

    const bom = readAscii(data.subarray(0xC, 0xC + 2));
    if (bom !== '\xFF\xFE' && bom !== '\xFE\xFF') return 0;

    const isLittleEndian = bom === '\xFF\xFE';
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const fileSize = isLittleEndian ? dv.getUint32(0x1C, true) : dv.getUint32(0x1C, false);
    if (data.length !== fileSize) {
        return 0;
    }
    return 1 << data[0xE]!;
}