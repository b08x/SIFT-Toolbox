import { CacheableQueryDetails, CachedSiftReport, UploadedFile } from '../types.ts';

export const SIFT_PROMPT_VERSION = "1.2"; // Increment this if SIFT prompts change significantly

// Helper function to convert string to ArrayBuffer
function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length * 2); // 2 bytes for each char
  const bufView = new Uint16Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

// Helper function to convert ArrayBuffer to hex string
function ab2hex(ab: ArrayBuffer): string {
  return Array.prototype.map.call(new Uint8Array(ab), x => ('00' + x.toString(16)).slice(-2)).join('');
}

async function hashString(input: string): Promise<string> {
  if (!input) return Promise.resolve('');
  const buffer = str2ab(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return ab2hex(hashBuffer);
}

export async function generateCacheKey(details: CacheableQueryDetails): Promise<string> {
  const {
    text,
    files,
    reportType,
    provider,
    modelId,
    modelConfigParams,
  } = details;

  const textHash = await hashString(text || '');
  
  const filesToHash = files || [];
  const fileHashes = await Promise.all(
    filesToHash.map(file => hashString(file.base64Data + file.name))
  );
  const combinedFileHash = await hashString(fileHashes.sort().join('|'));
  
  // Sort modelConfigParams by key to ensure consistent key generation
  const sortedConfigKeys = Object.keys(modelConfigParams).sort();
  const configString = sortedConfigKeys.map(key => `${key}:${modelConfigParams[key]}`).join('|');
  const configHash = await hashString(configString);

  const keyParts = [
    `v:${SIFT_PROMPT_VERSION}`,
    `txt:${textHash}`,
    `files:${combinedFileHash}`,
    `rt:${reportType}`,
    `pvd:${provider}`,
    `mdl:${modelId}`,
    `cfg:${configHash}`,
  ];
  const fullKey = `siftCache-${keyParts.join('-')}`;
  return `siftCache-${await hashString(fullKey)}`; // Hash the whole key to keep it a reasonable length
}

export function getCachedSiftReport(key: string): CachedSiftReport | null {
  try {
    const item = localStorage.getItem(key);
    if (item) {
      const parsedItem = JSON.parse(item) as CachedSiftReport;
      // Optional: Add cache expiration logic here, e.g., if (Date.now() - parsedItem.cachedAt > TTL) return null;
      return parsedItem;
    }
  } catch (error) {
    console.error("Error retrieving SIFT report from cache:", error);
    localStorage.removeItem(key); // Remove corrupted item
  }
  return null;
}

export function setSiftReportCache(key: string, data: CachedSiftReport): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error("Error saving SIFT report to cache:", error);
    // Optional: Implement cache pruning if localStorage is full
    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        console.warn("Cache full, consider implementing pruning logic.");
    }
  }
}