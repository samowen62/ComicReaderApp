import type { ComicReaderApi } from '../../shared/types';

declare global {
  interface Window {
    api: ComicReaderApi;
  }
}

export {};
