const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('./config');

const enabled = Boolean(
  config.r2.accountId && config.r2.bucket && config.r2.accessKeyId && config.r2.secretAccessKey
);

const client = enabled
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey
      }
    })
  : null;

async function uploadMedia({ buffer, contentType, key }) {
  if (!enabled || !client) {
    return { key, url: '' };
  }

  await client.send(
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType
    })
  );

  const url = config.r2.publicUrl ? `${config.r2.publicUrl.replace(/\/$/, '')}/${key}` : '';
  return { key, url };
}

module.exports = { uploadMedia, r2Enabled: enabled };
