import { defineBackend, defineFunction } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

const extractGraphFn = defineFunction({
  name: 'extract-graph',
  entry: './functions/extract-graph/handler.ts',
  timeoutSeconds: 300,
  memoryMB: 1024,
  environment: {
    BEDROCK_REGION: 'ap-northeast-2',
    BEDROCK_MODEL_ID: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    API_KEY: 'graph-rag-demo-key-2025',
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

// 배포 후 URL 및 함수 이름을 알 수 있도록 출력에 추가
backend.addOutput({
  custom: {
    extractGraphUrl: extractGraphUrl.url,
    extractGraphFunctionName: extractGraphFnLambda.functionName,
  },
});

// Lambda에 DynamoDB 접근 권한 부여
backend.extractGraphFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:PutItem', 'dynamodb:UpdateItem'],
    resources: [backend.data.resources.tables['ExtractionJob'].tableArn],
  })
);

// Lambda에 Bedrock 접근 권한 부여
backend.extractGraphFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['bedrock:InvokeModel'],
    resources: [
      `arn:aws:bedrock:ap-northeast-2::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0`,
    ],
  })
);

// Lambda에 테이블 이름 환경 변수 추가
backend.extractGraphFn.addEnvironment(
  'AMPLIFY_DATA_EXTRACTIONJOB_TABLE_NAME',
  backend.data.resources.tables['ExtractionJob'].tableName
);