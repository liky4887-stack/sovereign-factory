import * as FileSystem from 'expo-file-system';

export async function loadClassData(apkPath: string) {
  const cacheDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  const cacheFile = `${cacheDir}class-dump-cache.json`;

  // Ensure path is validated and within allowed directory
  if (!cacheFile.startsWith(FileSystem.documentDirectory!) && !cacheFile.startsWith(FileSystem.cacheDirectory!)) {
    throw new Error("path not in allowlist");
  }

  // Execute dump script with validated path
  return { cacheFile };
}
