import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';

const QDRANT_URL = process.env.QDRANT_URL || '';

const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || '';
const AZURE_OPENAI_API_INSTANCE_NAME = process.env.AZURE_OPENAI_API_INSTANCE_NAME || '';
const AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME =
  process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME || '';
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '';

export function getQdrantVectorStore(collectionName: string) {
  const embeddings = new AzureOpenAIEmbeddings({
    azureOpenAIApiKey: AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiEmbeddingsDeploymentName: AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: AZURE_OPENAI_API_VERSION,
    maxRetries: 1
  });

  return new QdrantVectorStore(embeddings, {
    url: QDRANT_URL,
    collectionName
  });
}
