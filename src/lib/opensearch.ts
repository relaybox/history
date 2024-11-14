import { OpenAIEmbeddings } from '@langchain/openai';
import { Client } from '@opensearch-project/opensearch';
import { OpenSearchVectorStore } from '@langchain/community/vectorstores/opensearch';

const OPENSEARCH_URL = process.env.OPENSEARCH_URL || '';
const OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME || '';
const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD || '';

let client: Client | null = null;

export function getOpenSearchClient(): Client {
  if (client) {
    return client;
  }

  client = new Client({
    nodes: [OPENSEARCH_URL],
    auth: {
      username: OPENSEARCH_USERNAME,
      password: OPENSEARCH_PASSWORD
    },
    ssl: {
      rejectUnauthorized: false
    }
  });

  return client;
}

export function getOpenSearchVectorStore(client: Client, indexName: string): OpenSearchVectorStore {
  const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-ada-002'
  });

  const indexNameToLowerCase = indexName.toLowerCase();

  return new OpenSearchVectorStore(embeddings, {
    client,
    indexName: indexNameToLowerCase
  });
}
