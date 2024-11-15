import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';

const QDRANT_URL = process.env.QDRANT_URL || '';

const AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME =
  process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME || '';
const AZURE_OPENAI_API_EMBEDDINGS_VERSION = process.env.AZURE_OPENAI_API_EMBEDDINGS_VERSION || '';
const AZURE_OPENAI_API_INSTANCE_NAME = process.env.AZURE_OPENAI_API_INSTANCE_NAME || '';

export function getQdrantVectorStore(collectionName: string) {
  const embeddings = new AzureOpenAIEmbeddings({
    azureOpenAIApiInstanceName: AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiEmbeddingsDeploymentName: AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: AZURE_OPENAI_API_EMBEDDINGS_VERSION,
    maxRetries: 1
  });

  return new QdrantVectorStore(embeddings, {
    url: QDRANT_URL,
    collectionName
  });
}
