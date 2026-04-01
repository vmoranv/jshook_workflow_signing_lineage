function toolNode(id, toolName, options) {
  return {
    kind: 'tool',
    id,
    toolName,
    input: options?.input,
    retry: options?.retry,
    timeoutMs: options?.timeoutMs,
  };
}
function sequenceNode(id, steps) {
  return { kind: 'sequence', id, steps };
}
function parallelNode(id, steps, maxConcurrency, failFast) {
  return { kind: 'parallel', id, steps, maxConcurrency, failFast };
}

const workflowId = 'workflow.signing-lineage.v1';

const signingLineageWorkflow = {
  kind: 'workflow-contract',
  version: 1,
  id: workflowId,
  displayName: 'Signing Lineage',
  description:
    'Traces the full signing lineage from ciphertext back to plaintext: intercepts signed requests, locates the signing function via initiator stacks, extracts the parameter normalization chain, hooks intermediate transforms, and captures the complete plaintext → normalize → concat → hash/encrypt → inject pipeline.',
  tags: ['reverse', 'signature', 'lineage', 'crypto', 'trace', 'hook', 'parameter', 'mission'],
  timeoutMs: 12 * 60_000,
  defaultMaxConcurrency: 3,

  build(ctx) {
    const prefix = 'workflows.signingLineage';
    const url = String(ctx.getConfig(`${prefix}.url`, 'https://example.com'));
    const waitUntil = String(ctx.getConfig(`${prefix}.waitUntil`, 'networkidle0'));
    const targetParam = String(ctx.getConfig(`${prefix}.targetParam`, 'sign'));
    const requestTail = Number(ctx.getConfig(`${prefix}.requestTail`, 30));
    const traceDepth = Number(ctx.getConfig(`${prefix}.traceDepth`, 5));
    const searchKeywords = String(
      ctx.getConfig(
        `${prefix}.searchKeywords`,
        'sign,signature,encrypt,hmac,md5,sha,hash,token,digest,secret,key,iv,nonce',
      ),
    );
    const maxConcurrency = Number(ctx.getConfig(`${prefix}.parallel.maxConcurrency`, 3));

    return sequenceNode('signing-lineage-root', [
      // Phase 1: Network Setup & Navigate
      toolNode('enable-network', 'network_enable', { input: { enableExceptions: true } }),
      toolNode('navigate', 'page_navigate', { input: { url, waitUntil } }),

      // Phase 2: Initial Request Capture
      toolNode('capture-requests', 'network_get_requests', { input: { tail: requestTail } }),

      // Phase 3: Parallel Source Analysis
      parallelNode(
        'analyse-sources',
        [
          toolNode('search-signing', 'search_in_scripts', {
            input: { query: searchKeywords, matchType: 'any' },
          }),
          toolNode('detect-crypto', 'detect_crypto', { input: {} }),
          toolNode('collect-code', 'collect_code', { input: { includeInline: true, limit: 30 } }),
        ],
        maxConcurrency,
        false,
      ),

      // Phase 4: Deep Function Tree — find the signing entry point
      toolNode('extract-signing-tree', 'extract_function_tree', {
        input: { targetParam, depth: traceDepth },
      }),

      // Phase 5: Inject Function Tracer on signing path
      toolNode('inject-tracer', 'console_inject_function_tracer', {
        input: { persistent: false },
      }),

      // Phase 6: Hook the signing chain at multiple levels
      toolNode('hook-signing', 'manage_hooks', {
        input: { action: 'add', targetParam, captureArgs: true, captureReturn: true },
      }),

      // Phase 7: Interceptor injection for XHR/Fetch to catch signed requests
      toolNode('inject-xhr-interceptor', 'console_inject_xhr_interceptor', {
        input: { persistent: false },
      }),
      toolNode('inject-fetch-interceptor', 'console_inject_fetch_interceptor', {
        input: { persistent: false },
      }),

      // Phase 8: Re-capture after instrumentation
      toolNode('recapture-requests', 'network_get_requests', { input: { tail: requestTail } }),

      // Phase 9: Auth Surface Extraction
      toolNode('extract-auth', 'network_extract_auth', { input: { minConfidence: 0.2 } }),

      // Phase 10: Evidence Recording
      toolNode('create-evidence-session', 'instrumentation_session_create', {
        input: {
          name: `signing-lineage-${targetParam}-${new Date().toISOString().slice(0, 10)}`,
          metadata: { url, targetParam, workflowId },
        },
      }),
      toolNode('record-artifact', 'instrumentation_artifact_record', {
        input: {
          type: 'signing_lineage',
          label: `Signing lineage for "${targetParam}" on ${url}`,
          metadata: { url, targetParam, traceDepth },
        },
      }),

      // Phase 11: Session Insight
      toolNode('emit-insight', 'append_session_insight', {
        input: {
          insight: JSON.stringify({
            status: 'signing_lineage_complete',
            workflowId,
            url,
            targetParam,
            traceDepth,
          }),
        },
      }),
    ]);
  },

  onStart(ctx) {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', { workflowId, mission: 'signing_lineage', stage: 'start' });
  },
  onFinish(ctx) {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', { workflowId, mission: 'signing_lineage', stage: 'finish' });
  },
  onError(ctx, error) {
    ctx.emitMetric('workflow_errors_total', 1, 'counter', { workflowId, mission: 'signing_lineage', stage: 'error', error: error.name });
  },
};

export default signingLineageWorkflow;
