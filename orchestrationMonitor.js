/**
 * Orchestration Monitor Module
 * Handles retrieval and formatting of orchestration execution data for monitoring/detail views
 */

const dateTimeUtils = require('./utils/dateTimeUtils.js');
const definitionStore = require('./definitionStore.js');

// Note: logger, db, and serverConfig are injected as globals from server.js

/**
 * Get orchestration execution details with formatted data
 * @param {string} jobId - The orchestration job ID
 * @param {string} executionIndex - The index of the execution (0-based, or 'latest')
 * @returns {Promise<Object>} Execution details with job definition and node info
 */
async function getExecutionDetails(jobId, executionIndex = 'latest') {
  try {
    // Get execution history for this job
    const executions = await getExecutionHistory(jobId);
    if (!executions || executions.length === 0) {
      throw new Error(`No execution history found for job [${jobId}]`);
    }

    // Get the specified execution
    let execution;
    if (executionIndex === 'latest') {
      execution = executions[executions.length - 1];
    } else {
      const idx = parseInt(executionIndex);
      if (idx < 0 || idx >= executions.length) {
        throw new Error(`Invalid execution index [${executionIndex}]`);
      }
      execution = executions[idx];
    }

    // Get the orchestration job definition at the version that was executed
    // If execution doesn't have a version, it's from the old format - use current version
    const executionVersion = execution.orchestrationVersion || 'current';
    const jobDef = await getJobDefinitionVersion(jobId, executionVersion);
    
    if (!jobDef) {
      throw new Error(`Orchestration job [${jobId}] version ${executionVersion} not found`);
    }

    // Detect parallel nodes by looking for overlapping execution windows.
    const concurrentInfo = detectConcurrentNodes(jobDef.nodes || [], execution, jobDef.edges || []);

    // Format the response with graph info and node details
    const formattedNodes = formatNodeDetails(jobDef.nodes, execution, concurrentInfo);
    const formattedEdges = formatEdgeDetails(jobDef.edges, execution, execution.visitedNodes || [], concurrentInfo);

    return {
      jobId: jobDef.id,
      jobName: jobDef.name,
      description: jobDef.description || '',
      orchestrationVersion: jobDef.version || 1,
      execution: {
        executionId: execution.executionId,
        startTime: execution.startTime,
        endTime: execution.endTime,
        status: execution.status,
        finalStatus: execution.finalStatus || 'unknown',
        mode: getExecutionMode(execution),
        triggerContext: execution.triggerContext || null,
        triggerSummary: buildExecutionTriggerSummary(execution),
        duration: execution.endTime ? 
          new Date(execution.endTime) - new Date(execution.startTime) : null,
        nodeMetrics: execution.nodeMetrics || {}
      },
      nodes: formattedNodes,
      edges: formattedEdges,
      nodeScriptOutputs: execution.scriptOutputs || {},
      conditionEvaluations: execution.conditionEvaluations || {},
      errors: execution.errors || [],
      visitedNodes: execution.visitedNodes || [],
      concurrentNodeIds: Array.from(concurrentInfo.nodeIds),
      concurrentNodePairs: concurrentInfo.pairs,
      executionIndex: executionIndex,
      totalExecutions: executions.length
    };
  } catch (err) {
    logger.error(`Error getting execution details for job [${jobId}]: ${err.message}`);
    throw err;
  }
}

function getExecutionMode(execution) {
  const source = execution && execution.manual;

  if (source === true || source === 'manual') {
    return 'Manual';
  }
  if (source === 'webhook') {
    return 'Webhook';
  }
  if (source === 'schedule') {
    return 'Schedule';
  }
  if (source === 'rule') {
    return 'Rule';
  }

  const triggerType = execution && execution.triggerContext && execution.triggerContext.type;
  if (triggerType === 'webhook') {
    return 'Webhook';
  }
  if (triggerType === 'rule') {
    return 'Rule';
  }

  return 'Manual';
}

function buildExecutionTriggerSummary(execution) {
  const triggerContext = execution && execution.triggerContext;
  const mode = getExecutionMode(execution);
  const triggerType = triggerContext && triggerContext.type
    ? triggerContext.type
    : mode.toLowerCase();

  const summary = {
    type: triggerType,
    label: mode,
    source: null,
    detail: null
  };

  if (triggerType === 'webhook') {
    summary.source =
      (triggerContext && triggerContext.webhookName) ||
      (triggerContext && triggerContext.webhook && triggerContext.webhook.name) ||
      (triggerContext && triggerContext.webhookId) ||
      'Webhook';
    summary.detail = summary.source;
    return summary;
  }

  if (triggerType === 'rule') {
    const metricType = triggerContext && triggerContext.metric && triggerContext.metric.type;
    const metricValue = triggerContext && triggerContext.metric && triggerContext.metric.value;
    const metricUnit = triggerContext && triggerContext.metric && triggerContext.metric.unit;
    const operator = triggerContext && triggerContext.condition && triggerContext.condition.operator;
    const threshold = triggerContext && triggerContext.condition && triggerContext.condition.threshold;

    summary.source = metricType || 'Rule';
    if (metricType && metricValue !== undefined && operator && threshold !== undefined) {
      summary.detail = `${metricType} ${metricValue}${metricUnit || ''} (${operator} ${threshold})`;
    } else {
      summary.detail = metricType || 'Rule-based trigger';
    }
    return summary;
  }

  if (triggerType === 'schedule') {
    summary.source = 'Schedule';
    summary.detail = 'Clock schedule trigger';
    return summary;
  }

  summary.source = 'Manual';
  summary.detail = 'Started manually';
  return summary;
}

/**
 * Get only the node script outputs for a specific orchestration node
 * @param {string} jobId - The orchestration job ID
 * @param {string} nodeId - The node ID
 * @param {string} executionIndex - The index of the execution (0-based, or 'latest')
 * @returns {Promise<Object>} Node output details including log, exit code, etc.
 */
async function getNodeOutput(jobId, nodeId, executionIndex = 'latest') {
  try {
    const details = await getExecutionDetails(jobId, executionIndex);
    const nodeOutput = details.nodeScriptOutputs[nodeId];
    
    if (!nodeOutput) {
      return {
        nodeId,
        jobId,
        status: 'not_executed',
        log: '',
        exitCode: null
      };
    }

    return {
      nodeId,
      jobId,
      status: details.visitedNodes.includes(nodeId) ? 'executed' : 'not_executed',
      log: nodeOutput.stdout || '',
      stderr: nodeOutput.stderr || '',
      exitCode: nodeOutput.exitCode ?? null,
      executedAt: nodeOutput.executedAt || null
    };
  } catch (err) {
    logger.error(`Error getting node output for [${jobId}/${nodeId}]: ${err.message}`);
    throw err;
  }
}

/**
 * Format node details with execution state information
 * @private
 */
/**
 * Format edge details to mark which edges were traversed
 * @private
 */
function formatEdgeDetails(edges, execution, visitedNodes, concurrentInfo = { nodeIds: new Set() }) {
  if (!edges) return [];
  
  return edges.map(edge => ({
    id: edge.id,
    from: edge.from,
    fromPort: edge.fromPort,
    to: edge.to,
    label: edge.label || edge.fromPort,
    color: edge.color,
    // Mark edge as executed if both source and target nodes were visited
    executed: visitedNodes.includes(edge.from) && visitedNodes.includes(edge.to),
    concurrent: concurrentInfo.nodeIds.has(edge.from) || concurrentInfo.nodeIds.has(edge.to)
  }));
}

/**
 * Format execution details for node display
 * Includes position, execution status, and error info
 * @private
 */
function formatNodeDetails(nodes, execution, concurrentInfo = { nodeIds: new Set(), peers: {} }) {
  return nodes.map(node => ({
    id: node.id,
    type: node.type,
    label: node.label || node.id,
    icon: node.icon || 'play_arrow',
    x: node.x || 0,  // Preserve node position from job definition
    y: node.y || 0,  // Preserve node position from job definition
    ports: node.ports || [],  // Include port definitions
    data: node.data || {},
    executed: execution.visitedNodes && execution.visitedNodes.includes(node.id),
    concurrent: concurrentInfo.nodeIds.has(node.id),
    concurrentWith: concurrentInfo.peers[node.id] || [],
    hasError: execution.errors && execution.errors.some(e => e.node === node.id),
    errorMessage: execution.errors && execution.errors.find(e => e.node === node.id)?.message || null,
    exitCode: execution.scriptOutputs ? (execution.scriptOutputs[node.id]?.exitCode ?? null) : null
  }));
}

/**
 * Detect nodes that executed in parallel by checking overlapping node metric windows.
 * @private
 */
/**
 * Build a forward reachability map: for each node, which nodes can it reach?
 * @private
 */
function buildReachability(nodes, edges) {
  const adj = {};
  (nodes || []).forEach(n => { adj[n.id] = []; });
  (edges || []).forEach(e => {
    if (!adj[e.from]) adj[e.from] = [];
    adj[e.from].push(e.to);
  });

  const reachable = {};
  (nodes || []).forEach(n => {
    const visited = new Set();
    const queue = [n.id];
    while (queue.length > 0) {
      const curr = queue.shift();
      for (const next of (adj[curr] || [])) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    reachable[n.id] = visited;
  });
  return reachable;
}

function detectConcurrentNodes(nodes, execution, edges) {
  const nodeMetrics = execution?.nodeMetrics || {};
  const visitedNodes = new Set(execution?.visitedNodes || []);
  const nodeById = {};
  (nodes || []).forEach(n => {
    nodeById[n.id] = n;
  });

  const controlTypes = new Set(['start', 'end-success', 'end-failure']);
  const windows = [];

  Object.entries(nodeMetrics).forEach(([nodeId, metric]) => {
    if (!visitedNodes.has(nodeId)) {
      return;
    }

    const node = nodeById[nodeId];
    if (!node || controlTypes.has(node.type)) {
      return;
    }

    const startMs = Date.parse(metric?.startTime || '');
    const endMs = Date.parse(metric?.endTime || '');
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return;
    }

    windows.push({
      nodeId,
      startMs,
      endMs
    });
  });

  const nodeIds = new Set();
  const pairs = [];
  const peers = {};

  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i];
      const b = windows[j];
      const overlaps = a.startMs < b.endMs && b.startMs < a.endMs;
      if (!overlaps) {
        continue;
      }

      nodeIds.add(a.nodeId);
      nodeIds.add(b.nodeId);
      pairs.push([a.nodeId, b.nodeId]);

      if (!peers[a.nodeId]) {
        peers[a.nodeId] = [];
      }
      if (!peers[b.nodeId]) {
        peers[b.nodeId] = [];
      }

      if (!peers[a.nodeId].includes(b.nodeId)) {
        peers[a.nodeId].push(b.nodeId);
      }
      if (!peers[b.nodeId].includes(a.nodeId)) {
        peers[b.nodeId].push(a.nodeId);
      }
    }
  }

  // Filter peers to only direct siblings.
  // Exclude peers in ancestor/descendant relationship with the node itself,
  // and exclude peers that are downstream of other peers in the same list.
  const reachability = buildReachability(nodes, edges);
  for (const nodeId of Object.keys(peers)) {
    const peerList = peers[nodeId];
    peers[nodeId] = peerList.filter(peerId =>
      !(reachability[peerId]?.has(nodeId) || reachability[nodeId]?.has(peerId))
      && !peerList.some(otherId => otherId !== peerId && reachability[otherId]?.has(peerId))
    );

    // If all peers were filtered out, remove the node from concurrent set too.
    if (peers[nodeId].length === 0) {
      delete peers[nodeId];
    }
  }

  // Rebuild concurrent node IDs and pairs from filtered peers for consistency.
  nodeIds.clear();
  pairs.length = 0;
  const seenPairs = new Set();
  for (const [nodeId, peerList] of Object.entries(peers)) {
    nodeIds.add(nodeId);
    peerList.forEach(peerId => {
      nodeIds.add(peerId);
      const key = nodeId < peerId ? `${nodeId}::${peerId}` : `${peerId}::${nodeId}`;
      if (!seenPairs.has(key)) {
        seenPairs.add(key);
        pairs.push(nodeId < peerId ? [nodeId, peerId] : [peerId, nodeId]);
      }
    });
  }

  return {
    nodeIds,
    pairs,
    peers
  };
}

/**
 * Get orchestration job definition at a specific version
 * @private
 */
async function getJobDefinitionVersion(jobId, version = 'current') {
  try {
    const job = await definitionStore.getOrchestration(jobId);
    
    if (!job) {
      throw new Error(`Orchestration job [${jobId}] not found`);
    }
    
    // Handle versioned format
    if (job.versions && Array.isArray(job.versions)) {
      let versionData;
      
      if (version === 'current' || version === 'latest') {
        // Return current version
        versionData = job.versions[job.versions.length - 1];
      } else {
        // Get specific version number
        const versionNum = parseInt(version);
        versionData = job.versions.find(v => v.version === versionNum);
      }
      
      if (!versionData) {
        return null;
      }
      
      return {
        id: job.id,
        name: job.name,
        description: job.description,
        nodes: versionData.nodes || [],
        edges: versionData.edges || [],
        version: versionData.version,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      };
    }
    
    // Handle legacy format (non-versioned)
    return {
      id: job.id,
      name: job.name,
      description: job.description,
      nodes: job.nodes || [],
      edges: job.edges || [],
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  } catch (err) {
    if (err.message?.includes('NotFoundError')) {
      return null;
    }
    throw err;
  }
}

/**
 * Get orchestration job definition (current version)
 * @private
 */
async function getJobDefinition(jobId) {
  return getJobDefinitionVersion(jobId, 'current');
}

/**
 * Get execution history for a job
 * @private
 */
async function getExecutionHistory(jobId) {
  try {
    const history = await db.getData('ORCHESTRATION_EXECUTIONS');
    return history[jobId] || [];
  } catch (err) {
    if (err.message?.includes('NotFoundError')) {
      return [];
    }
    throw err;
  }
}

/**
 * List all orchestration jobs with their latest execution status
 * @returns {Promise<Array>} Array of jobs with status info
 */
async function listJobsWithStatus(timezone) {
  try {
    const jobs = await definitionStore.listOrchestrations();
    
    // Fetch execution history, treating missing data as empty object
    // This ensures jobs appear with 'never_run' status on first use
    let executions = {};
    try {
      executions = await db.getData('ORCHESTRATION_EXECUTIONS');
    } catch (err) {
      if (!err.message?.includes('NotFoundError')) {
        throw err;
      }
      // If ORCHESTRATION_EXECUTIONS does not exist yet, treat as no executions recorded.
      executions = {};
    }
    
    const jobList = [];
    for (const [jobId, jobDef] of Object.entries(jobs || {})) {
      const jobExecutions = executions?.[jobId] || [];
      const latestExecution = jobExecutions[jobExecutions.length - 1];

      jobList.push({
        id: jobDef.id,
        name: jobDef.name,
        description: jobDef.description || '',
        lastExecuted: latestExecution?.startTime || null,
        lastExecutionStatus: latestExecution?.finalStatus || 'never_run',
        executionCount: jobExecutions.length,
        lastExecutedFormatted: latestExecution?.startTime ? 
          dateTimeUtils.displayFormatDate(
            new Date(latestExecution.startTime), 
            false, 
            timezone, 
            'YYYY-MM-DDTHH:mm:ss.SSS', 
            false
          ) : 'Never'
      });
    }
    
    return jobList.sort((a, b) => {
      const getTime = (item) => {
        if (!item.lastExecuted) {
          return 0;
        }
        const time = Date.parse(item.lastExecuted);
        return Number.isNaN(time) ? 0 : time;
      };
      return getTime(b) - getTime(a);
    });
  } catch (err) {
    logger.error(`Error listing orchestration jobs: ${err.message}`);
    throw err;
  }
}

module.exports = {
  getExecutionDetails,
  getNodeOutput,
  listJobsWithStatus,
  getJobDefinitionVersion,
  getExecutionMode,
  buildExecutionTriggerSummary,
  formatNodeDetails,
  formatEdgeDetails
};
