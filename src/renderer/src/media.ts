/** Builds a media:// URL for a file inside a project directory (see main/index.ts). */
export function mediaUrl(mainDir: string, projectName: string, file: string): string {
  return 'media://local/' + encodeURIComponent([mainDir, projectName, file].join('/'));
}
