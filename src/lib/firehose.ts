import { FirehoseClient } from '@aws-sdk/client-firehose';

const client = new FirehoseClient({ region: 'REGION' });

export function getFirehoseClient(): FirehoseClient {
  return client;
}
