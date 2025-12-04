import { defineBackend, defineFunction } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';

const extractGraphFn = defineFunction({
  name: 'extract-graph',
  entry: './functions/extract-graph/handler.ts',
  timeoutSeconds: 60,
  memoryMB: 1024,
  environment: {
    BEDROCK_REGION: 'ap-northeast-2',
    BEDROCK_MODEL_ID: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  },
});

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  extractGraphFn,
});

const extractGraphFnLambda = backend.extractGraphFn.resources.lambda;

const extractGraphUrl = extractGraphFnLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ['*'],
    allowedHeaders: ['Content-Type'],
  },
});

// 배포 후 URL을 알 수 있도록 출력에 추가
backend.addOutput({
  custom: {
    extractGraphUrl: extractGraphUrl.url,
  },
});