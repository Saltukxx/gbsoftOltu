import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import crypto from 'crypto';
import { logger } from './logger';
import { 
  saveAudioFileToS3, 
  getAudioFileUrl, 
  deleteAudioFileFromS3, 
  isS3Available 
} from './s3Storage';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);

// Storage directory (relative to project root) - used as fallback when S3 is not available
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');
const AUDIO_DIR = path.join(STORAGE_DIR, 'audio');

/**
 * Sanitize filename to prevent directory traversal and other attacks
 */
function sanitizeFilename(filename: string): string {
  // Remove directory traversal sequences and dangerous characters
  const cleaned = filename
    .replace(/[\/\\:*?"<>|]/g, '_') // Replace dangerous characters
    .replace(/\.\./g, '_') // Replace directory traversal sequences
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 100); // Limit length
  
  // Ensure filename is not empty after sanitization
  return cleaned || crypto.randomBytes(8).toString('hex');
}

/**
 * Validate and sanitize relative path to prevent directory traversal
 */
function validateRelativePath(relativePath: string): string {
  // Normalize the path to resolve any .. sequences
  const normalizedPath = path.normalize(relativePath);
  
  // Check if the path tries to escape the storage directory
  if (normalizedPath.startsWith('../') || normalizedPath.includes('../') || path.isAbsolute(normalizedPath)) {
    throw new Error('Invalid file path: directory traversal not allowed');
  }
  
  // Ensure the path starts with 'audio/' for audio files
  if (!normalizedPath.startsWith('audio/')) {
    throw new Error('Invalid file path: must be within audio directory');
  }
  
  // Additional security: ensure the path doesn't contain null bytes
  if (normalizedPath.includes('\0')) {
    throw new Error('Invalid file path: null bytes not allowed');
  }
  
  return normalizedPath;
}

/**
 * Validate file extension against allowed types
 */
function validateFileExtension(filename: string, mimetype: string): void {
  const allowedExtensions = ['mp3', 'wav', 'ogg', 'webm', 'm4a'];
  const allowedMimeTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4'];
  
  const ext = path.extname(filename).toLowerCase().substring(1);
  
  if (!allowedExtensions.includes(ext) || !allowedMimeTypes.includes(mimetype)) {
    throw new Error(`Unsupported file type: ${ext} (${mimetype})`);
  }
}

/**
 * Initialize storage directories
 */
export async function initializeStorage(): Promise<void> {
  try {
    // Create storage directory if it doesn't exist
    await mkdir(STORAGE_DIR, { recursive: true });
    await mkdir(AUDIO_DIR, { recursive: true });
    
    logger.info('Storage directories initialized', {
      storageDir: STORAGE_DIR,
      audioDir: AUDIO_DIR,
    });
  } catch (error) {
    logger.error('Failed to initialize storage directories', error);
    throw error;
  }
}

/**
 * Save audio file to storage (S3 if configured, otherwise local filesystem)
 */
export async function saveAudioFile(
  buffer: Buffer,
  filename: string,
  mimetype: string
): Promise<{ path: string; fullPath: string }> {
  try {
    // Validate file extension and mimetype
    validateFileExtension(filename, mimetype);
    
    // Use S3 if available
    if (isS3Available()) {
      // S3 implementation already handles sanitization
      const { path: s3Path, url } = await saveAudioFileToS3(buffer, filename, mimetype);
      return {
        path: s3Path,
        fullPath: url,
      };
    }
    
    // Fallback to local filesystem with enhanced security
    // Generate unique filename with proper sanitization
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const sanitizedFilename = sanitizeFilename(filename);
    const ext = path.extname(sanitizedFilename) || '.webm';
    
    const safeFilename = `${timestamp}_${randomSuffix}_${path.basename(sanitizedFilename, ext)}${ext}`;
    
    // Validate the generated filename doesn't contain dangerous sequences
    if (safeFilename.includes('..') || safeFilename.includes('/') || safeFilename.includes('\\')) {
      throw new Error('Generated filename contains invalid characters');
    }
    
    // Full path on disk (using path.resolve to ensure absolute path)
    const fullPath = path.resolve(AUDIO_DIR, safeFilename);
    
    // Ensure the resolved path is still within the audio directory
    if (!fullPath.startsWith(path.resolve(AUDIO_DIR))) {
      throw new Error('File path resolves outside allowed directory');
    }
    
    // Relative path for database storage
    const relativePath = `audio/${safeFilename}`;
    
    // Write file to disk
    await writeFile(fullPath, buffer);
    
    logger.info('Audio file saved to local storage', {
      filename: safeFilename,
      size: buffer.length,
      mimetype,
      path: relativePath,
      sanitizedFrom: filename,
    });
    
    return {
      path: relativePath,
      fullPath,
    };
  } catch (error) {
    logger.error('Failed to save audio file', error);
    throw error;
  }
}

/**
 * Get audio file from storage (S3 if configured, otherwise local filesystem)
 */
export async function getAudioFile(relativePath: string): Promise<{ exists: boolean; fullPath: string }> {
  try {
    // Validate and sanitize the relative path to prevent directory traversal
    const safePath = validateRelativePath(relativePath);
    
    // Use S3 if available and path looks like an S3 key
    if (isS3Available() && safePath.startsWith('audio/')) {
      const { exists, url } = await getAudioFileUrl(safePath);
      return {
        exists,
        fullPath: url,
      };
    }
    
    // Fallback to local filesystem with path validation
    const fullPath = path.resolve(STORAGE_DIR, safePath);
    
    // Double-check that the resolved path is still within the storage directory
    const storageRealPath = path.resolve(STORAGE_DIR);
    if (!fullPath.startsWith(storageRealPath)) {
      logger.warn('Attempted directory traversal blocked', { 
        requestedPath: relativePath,
        resolvedPath: fullPath,
        storageDir: storageRealPath
      });
      return {
        exists: false,
        fullPath: '',
      };
    }
    
    // Check if file exists and is readable
    await access(fullPath, fs.constants.R_OK);
    
    return {
      exists: true,
      fullPath,
    };
  } catch (error) {
    // Log suspicious path access attempts
    if (relativePath.includes('..') || relativePath.includes('/etc') || relativePath.includes('\\')) {
      logger.warn('Suspicious file access attempt', { 
        path: relativePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    return {
      exists: false,
      fullPath: '',
    };
  }
}

/**
 * Delete audio file from storage (S3 if configured, otherwise local filesystem)
 */
export async function deleteAudioFile(relativePath: string): Promise<boolean> {
  try {
    // Validate and sanitize the relative path
    const safePath = validateRelativePath(relativePath);
    
    // Use S3 if available and path looks like an S3 key
    if (isS3Available() && safePath.startsWith('audio/')) {
      return await deleteAudioFileFromS3(safePath);
    }
    
    // Fallback to local filesystem with path validation
    const fullPath = path.resolve(STORAGE_DIR, safePath);
    
    // Ensure the resolved path is still within the storage directory
    const storageRealPath = path.resolve(STORAGE_DIR);
    if (!fullPath.startsWith(storageRealPath)) {
      logger.warn('Attempted directory traversal in delete operation blocked', { 
        requestedPath: relativePath,
        resolvedPath: fullPath 
      });
      return false;
    }
    
    // Check if file exists before trying to delete
    await access(fullPath, fs.constants.F_OK);
    
    // Delete the file
    await unlink(fullPath);
    
    logger.info('Audio file deleted from local storage', { path: safePath });
    return true;
  } catch (error) {
    logger.warn('Failed to delete audio file', { path: relativePath, error });
    return false;
  }
}

/**
 * Get storage directory paths
 */
export function getStoragePaths() {
  return {
    storageDir: STORAGE_DIR,
    audioDir: AUDIO_DIR,
  };
}

