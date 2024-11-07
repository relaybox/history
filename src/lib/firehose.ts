import { FirehoseClient } from '@aws-sdk/client-firehose';

const AWS_REGION = process.env.AWS_REGION || '';

const client = new FirehoseClient({ region: AWS_REGION });

export function getFirehoseClient(): FirehoseClient {
  return client;
}
