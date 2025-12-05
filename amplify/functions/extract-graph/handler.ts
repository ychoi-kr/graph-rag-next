import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBStreamEvent } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const region = process.env.BEDROCK_REGION ?? 'ap-northeast-2';
const modelId =
  process.env.BEDROCK_MODEL_ID ??
  'anthropic.claude-3-5-sonnet-20240620-v1:0';

const client = new BedrockRuntimeClient({ region });
const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const PROMPT = `
You are an information extraction model for literary text.

Your job:
- Read the ENTIRE input text.
- Extract a property graph that covers ALL important characters
  and as many places/objects/events as reasonable.
- The graph must be useful later for QA and graph-based reasoning.

You MUST return ONE JSON object with EXACTLY these top-level keys:
{
  "nodes": [...],
  "edges": [...],
  "spans": [...]
}

No other top-level keys are allowed.

================================
SCHEMA (MUST FOLLOW EXACTLY):
================================

"nodes": [
  {
    "id": "person:suk-hee",
    "type": "PERSON",           // One of: PERSON / PLACE / OBJECT / EVENT
    "name": "숙희",             // Surface name (Korean allowed)
    "aliases": ["숙"],          // Alternate names, [] if none
    "attrs": {},                // Additional attributes, {} if none
    "evidence_spans": ["ch1_p1_s1", "ch1_p3_s2"]  // 1–3 span IDs
  }
],

"edges": [
  {
    "src": "person:suk-hee",    // Node id (must match an existing node.id)
    "dst": "person:oppa",       // Node id (must match an existing node.id)
    "type": "RELATION",
    "attrs": {
      "relation_type": "형제자매",   // ✅ Korean, MUST be one of the list below
      "confidence": 0.9             // 0.0 ~ 1.0
    },
    "evidence_spans": ["ch1_p2_s1"] // 1–3 span IDs
  }
],

"spans": [
  {
    "id": "ch1_p1_s1",
    "text": "Original sentence text",
    "chapter": "1",
    "paragraph": 1,
    "sentence": 1
  }
]

================================
RELATION_TYPE VALUES (IN KOREAN):
================================

Use ONLY the following Korean strings for attrs.relation_type.
Do NOT invent new labels.

1) PERSON–PERSON (인물 ↔ 인물)
- "형제자매"   (siblings: 오빠/누나/언니/동생 etc.)
- "부모자식"   (parent–child, including adoptive)
- "가족기타"   (other family: cousins, relatives)
- "친구"
- "연인"
- "선후배"
- "직장동료"
- "스승제자"
- "라이벌"
- "기타인물관계"  (any other interpersonal relation)

2) PERSON–PLACE (인물 ↔ 장소)
- "위치"         (being at / going to / staying at a place)
- "거주지"       (place of residence, home)
- "출신지"       (place of origin)
- "만남장소"     (place where people meet)
- "여행지"       (travel destination)
- "기타장소관계"

3) PERSON–EVENT (인물 ↔ 이벤트)
- "참여"         (participates in an event)
- "주최"         (hosts or organizes an event)
- "피해자"       (victim in an event)
- "가해자"       (perpetrator in an event)
- "기타이벤트관계"

4) PERSON–OBJECT/ABSTRACT (인물 ↔ 사물·추상)
- "소유"         (owns something)
- "사용"         (uses something)
- "선물"         (gives/receives as gift)
- "상징"         (symbolic object)
- "기타사물관계"

5) OTHER / UNCERTAIN
- "불명"         (relation exists but type is unclear or uncertain)

You MUST choose exactly one of the above for every edge.attrs.relation_type.

================================
COVERAGE RULES (VERY IMPORTANT):
================================

- Every explicitly named human character (e.g., “숙희”, “오빠”, “지수”, “할아버지”)
  MUST have a PERSON node.
- Important places / objects / events should also be nodes whenever reasonable.
  - Use type: PLACE / OBJECT / EVENT for them.
- Family / friends / seniors-juniors / lovers / teacher-student and similar
  interpersonal relations MUST be represented as RELATION edges.
- If a relation is shown between a person and a place/event/object,
  create an edge with the most appropriate relation_type from the list above.
- Even if the relation is vague or uncertain:
  - Prefer to create an edge rather than omitting it.
  - Use "불명" (unknown) or the closest safe category.
  - Set attrs.confidence to a lower value (e.g., 0.3–0.5).

- If later parts of the text (middle or end) add NEW information about
  a character/place/event (e.g. background, trauma, ideology, role),
  you should:
  - Update that node’s attrs to include this later information, and/or
  - Add additional edges that capture the new relationships,
  - So that important developments in the later text are reflected in the graph.

=========================
TEXT COVERAGE STRATEGY:
=========================

To avoid focusing only on the beginning:

- First, quickly read the ENTIRE input text from start to end.
- Then, mentally divide the text into three parts:
  - Early: roughly the first 1/3
  - Middle: roughly the middle 1/3
  - Late: roughly the last 1/3
- For EACH part (early, middle, late):
  - Internally note the most important characters, places, events, and relations.
  - These notes are for your internal reasoning; DO NOT output them.

- After that, design the graph once, using ALL three parts:
  - Combine what you noted from early/middle/late
  - Then construct nodes / edges / spans and output the final JSON.

- The final graph MUST NOT be biased only toward the beginning.
  It should reflect important information from early, middle, and late sections.

=========================
STRICT EDGE RULES (IMPORTANT):
=========================

- Every edge MUST have attrs.relation_type.
  - No empty string, null, missing key, or English keywords.
  - Use ONLY one of the Korean labels defined in the RELATION_TYPE section.
- Never omit attrs for any edge.
  - Minimum structure:
    "attrs": {
      "relation_type": "<one of the allowed Korean values>",
      "confidence": <number between 0.0 and 1.0>
    }
- The more ambiguous the relation:
  - Use a safer, higher-level category or "불명".
  - Lower the confidence (e.g., 0.3–0.5).
- src and dst MUST exactly match some id in the nodes array.
  - Do NOT create edges pointing to non-existent nodes.

=========================
OUTPUT SIZE (VERY IMPORTANT):
=========================

For roughly one chapter of literary prose:

- Aim for:
  - 4–10 nodes
  - 4–20 edges
  within these hard limits:
  - MAX nodes: 8
  - MAX edges: 16

- Do NOT always hit the maximum; keep only the most important entities and relations.

- "spans" should be a set of REPRESENTATIVE sample sentences, not every sentence.
  - MAX spans: 40
  - Choose spans that best support the nodes and edges, across the whole text.

- If at least one character appears, you MUST NOT leave nodes as an empty array.

=========================
EVIDENCE SPANS:
=========================

- Every node and every edge MUST have at least 1 evidence_spans id.
- Each node or edge MUST have at most 3 evidence_spans ids.
  - Do NOT list dozens of span IDs.
  - Choose the most representative sentences.

- When the text is long (e.g., a full chapter):
  - The overall spans array should include sentences from
    early, middle, and late parts of the text.
  - As a rule of thumb, try to include at least:
    - 3 or more spans from the early 1/3,
    - 3 or more spans from the middle 1/3,
    - 3 or more spans from the late 1/3,
    if the text provides relevant sentences.

- If a character or relation is strongly emphasized in the LATE part of the text,
  try to ensure that:
  - At least one of its evidence_spans comes from that late section.

=========================
GENERAL RULES:
=========================

- Use the exact key names defined above.
  - At top level: only "nodes", "edges", "spans".
  - Do NOT add extra top-level keys such as title, author, metadata, etc.
- Do NOT output any explanation, comments, or Markdown formatting
  (no \`\`\`json, no prose).
  - Output exactly ONE JSON object as plain text.

- The examples in this prompt (ids, names, relation_type values, etc.)
  are ONLY examples.
  - Do NOT copy them.
  - You must generate ids/names/relations that match the ACTUAL input text.

- HARD LIMITS (upper bounds):
  - nodes: up to 8
  - edges: up to 16
  - spans: up to 40

- Even when you are uncertain:
  - Prefer to create nodes/edges that seem reasonable.
  - Use a lower confidence value.
  - Use "불명" or the closest category for relation_type.

REMEMBER:
- Read the entire text.
- Think in terms of early / middle / late coverage.
- Then output a SINGLE, valid JSON object with:
  {
    "nodes": [...],
    "edges": [...],
    "spans": [...]
  }
and NOTHING else.
`;

async function extractGraph(text: string) {
  const userPrompt = `${PROMPT}\n\nLiterary text:\n${text}`;

  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 8192,
    temperature: 0.2,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: userPrompt }],
      },
    ],
  };

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(JSON.stringify(body)),
  });

  const response = await client.send(command);
  const raw = new TextDecoder().decode(response.body);
  const data = JSON.parse(raw);
  const answerText: string = data.content?.[0]?.text ?? '';

  let graph: any;
  try {
    const start = answerText.indexOf('{');
    const end = answerText.lastIndexOf('}');
    const jsonStr = answerText.slice(start, end + 1);
    graph = JSON.parse(jsonStr);
  } catch (parseError) {
    console.error('Failed to parse graph JSON from model response:', parseError);
    graph = { nodes: [], edges: [], spans: [] };
  }

  return {
    ok: true,
    graph,
  };
}

export const handler = async (event: DynamoDBStreamEvent) => {
  console.log('### incoming stream event records:', event.Records.length);

  for (const record of event.Records) {
    if (record.eventName !== 'INSERT') continue;

    const newImage = record.dynamodb?.NewImage;
    if (!newImage) continue;

    // Unmarshall DynamoDB JSON to standard JSON
    // @ts-ignore - types mismatch slightly but unmarshall works
    const item = unmarshall(newImage as any);
    const { id, text } = item;

    console.log(`Processing job: ${id}`);

    if (!id || !text) {
      console.error('Missing id or text for job');
      continue;
    }

    try {
      const graphData = await extractGraph(text);

      // Update DB with success
      await docClient.send(new UpdateCommand({
        TableName: process.env.AMPLIFY_DATA_EXTRACTIONJOB_TABLE_NAME,
        Key: { id },
        UpdateExpression: 'set #status = :status, #result = :result',
        ExpressionAttributeNames: { '#status': 'status', '#result': 'result' },
        ExpressionAttributeValues: {
          ':status': 'COMPLETED',
          ':result': JSON.stringify(graphData), // Store as string if using AWSJSON or to be safe
        },
      }));
      console.log(`Job ${id} completed`);

    } catch (error) {
      console.error(`Error processing job ${id}:`, error);

      // Update DB with failure
      await docClient.send(new UpdateCommand({
        TableName: process.env.AMPLIFY_DATA_EXTRACTIONJOB_TABLE_NAME,
        Key: { id },
        UpdateExpression: 'set #status = :status, #errorMessage = :error',
        ExpressionAttributeNames: { '#status': 'status', '#errorMessage': 'errorMessage' },
        ExpressionAttributeValues: {
          ':status': 'FAILED',
          ':error': String(error),
        },
      }));
    }
  }
};
