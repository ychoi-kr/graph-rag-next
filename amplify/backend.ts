import { defineBackend, defineFunction } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { StartingPosition, FilterCriteria, FilterRule } from 'aws-cdk-lib/aws-lambda';
import { StreamViewType, CfnTable } from 'aws-cdk-lib/aws-dynamodb';
import { IAspect, Aspects } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

const extractGraphFn = defineFunction({
  name: 'extract-graph',
  entry: './functions/extract-graph/handler.ts',
  timeoutSeconds: 300,
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

// Enable unauthenticated access (Guest)
const { cfnIdentityPool } = backend.auth.resources.cfnResources;
cfnIdentityPool.allowUnauthenticatedIdentities = true;

// Function URL removed as we use AppSync + DynamoDB Stream pattern exclusively.

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

// Aspect to enable DynamoDB Streams for all tables
class EnableDynamoDBStreamAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof CfnTable) {
      // Check if this is the ExtractionJob table (optional check, or apply to all)
      // For now, we apply to all tables to be safe and robust
      node.streamSpecification = {
        streamViewType: StreamViewType.NEW_AND_OLD_IMAGES,
      };
    }
  }
}

// Apply the Aspect to the backend stack
Aspects.of(backend.stack).add(new EnableDynamoDBStreamAspect());

// 1. Get ExtractionJob table for Event Source
const extractionJobTable = backend.data.resources.tables['ExtractionJob'];

// 2. Add DynamoDB Stream Event Source to Lambda
backend.extractGraphFn.resources.lambda.addEventSource(
  new DynamoEventSource(extractionJobTable, {
    startingPosition: StartingPosition.LATEST,
    filters: [
      FilterCriteria.filter({
        eventName: FilterRule.isEqual('INSERT'),
      }),
    ],
  })
);

// Lambda에 테이블 이름 환경 변수 추가
backend.extractGraphFn.addEnvironment(
  'AMPLIFY_DATA_EXTRACTIONJOB_TABLE_NAME',
  backend.data.resources.tables['ExtractionJob'].tableName
);