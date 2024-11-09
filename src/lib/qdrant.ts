import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';

const QDRANT_URL = process.env.QDRANT_URL || '';

export function getQdrantVectorStore(collectionName: string) {
  const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-ada-002'
  });

  return new QdrantVectorStore(embeddings, {
    url: QDRANT_URL,
    collectionName
  });
}
