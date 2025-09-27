const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET_NAME = process.env.S3_BUCKET;

async function testS3Connection() {
  if (!BUCKET_NAME) {
    throw new Error('S3 bucket name not configured');
  }
  console.log('S3 configuration verified');
}

async function generatePresignedUploadUrl(key, contentType = 'application/octet-stream') {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return { success: true, uploadUrl: signedUrl, key };
  } catch (error) {
    console.error('Generate upload URL error:', error);
    return { success: false, error: error.message };
  }
}

async function generatePresignedDownloadUrl(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return { success: true, downloadUrl: signedUrl };
  } catch (error) {
    console.error('Generate download URL error:', error);
    return { success: false, error: error.message };
  }
}

async function deleteFile(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    await s3Client.send(command);
    return { success: true };
  } catch (error) {
    console.error('Delete file error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  testS3Connection,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  deleteFile
};

