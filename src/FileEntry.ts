export class FileEntry {
    /**
     * Name may include slashes. This will be treated as folder structure.
     */
    name: string;
    data: Uint8Array;

    /**
     * @param data raw file `Uint8Array`
     * @param name e.g. `image.jpg`, or `extra/image.jpg`
     */
    constructor(data: Uint8Array = new Uint8Array(0), name: string) {
        this.name = name;
        this.data = data;
    }
}
