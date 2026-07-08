declare module "write-file-atomic" {
  export interface WriteFileAtomicOptions {
    encoding?: BufferEncoding | null;
    fsync?: boolean;
    mode?: number | false;
    tmpfileCreated?: (tmpPath: string) => void;
  }

  export default function writeFileAtomic(
    filename: string,
    data: string | Uint8Array,
    options?: WriteFileAtomicOptions,
  ): Promise<void>;
}
