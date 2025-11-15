import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from './logger';

// S3/MinIO Configuration
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'oltu-platform';
const S3_REGION = process.env.S3_REGION || 'us-east-1';

// Check if S3 is configured
const isS3Configured = () => {
  return !!(S3_ENDPOINT && S3_ACCESS_KEY && S3_SECRET_KEY);
};

// Initialize S3 client
let s3Client: S3Client | null = null;

if (isS3Configured()) {
  s3Client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
      accessKeyId: S3_ACCESS_KEY!,
      secretAccessKey: S3_SECRET_KEY!,
    },
    forcePathStyle: true, // Required for MinIO
  });
  logger.info('S3/MinIO storage client initialized', {
    endpoint: S3_ENDPOINT,
    bucket: S3_BUCKET,
  });
} else {
  logger.warn('S3 storage not configured - voice messages will use local filesystem');
}

/**
 * Save audio file to S3/MinIO
 */
export async function saveAudioFileToS3(
  buffer: Buffer,
  filename: string,
  mimetype: string
): Promise<{ path: string; url: string }> {
  if (!s3Client) {
    throw new Error('S3 storage is not configured');
  }

  try {
    // Generate unique filename
    const timestamp = Date.now();
    const ext = mimetype.split('/')[1] || 'webm';
    const safeFilename = `${timestamp}_${filename.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;
    
    // S3 key (path in bucket)
    const key = `audio/${safeFilename}`;
    
    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      ContentLength: buffer.length,
    });
    
    await s3Client.send(command);
    
    logger.info('Audio file saved to S3', {
      filename: safeFilename,
      size: buffer.length,
      mimetype,
      key,
    });
    
    // Generate public URL (for MinIO/development)
    const url = `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;
    
    return {
      path: key,
      url,
    };
  } catch (error) {
    logger.error('Failed to save audio file to S3', error);
    throw error;
  }
}

/**
 * Get audio file URL from S3/MinIO
 */
export async function getAudioFileUrl(key: string, expiresIn: number = 3600): Promise<{ exists: boolean; url: string }> {
  if (!s3Client) {
    throw new Error('S3 storage is not configured');
  }

  try {
    // Check if file exists
    const headCommand = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });
    
    await s3Client.send(headCommand);
    
    // Generate signed URL for secure access
    const getCommand = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });
    
    const url = await getSignedUrl(s3Client, getCommand, { expiresIn });
    
    return {
      exists: true,
      url,
    };
  } catch (error: any) {
    if (error.name === 'NotFound') {
      return {
        exists: false,
        url: '',
      };
    }
    
    logger.error('Failed to get audio file URL from S3', error);
    throw error;
  }
}

/**
 * Delete audio file from S3/MinIO
 */
export async function deleteAudioFileFromS3(key: string): Promise<boolean> {
  if (!s3Client) {
    throw new Error('S3 storage is not configured');
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });
    
    await s3Client.send(command);
    
    logger.info('Audio file deleted from S3', { key });
    return true;
  } catch (error) {
    logger.warn('Failed to delete audio file from S3', { key, error });
    return false;
  }
}

/**
 * Check if S3 storage is available
 */
export function isS3Available(): boolean {
  return s3Client !== null;
}

/**
 * Get storage configuration info
 */
export function getS3Config() {
  return {
    configured: isS3Configured(),
    endpoint: S3_ENDPOINT,
    bucket: S3_BUCKET,
    region: S3_REGION,
  };
}

