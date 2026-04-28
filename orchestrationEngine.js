/**
 * Orchestration Execution Engine
 * Executes orchestration jobs by traversing the graph and executing scripts on agents
 */

const db = require('./db.js');
const fs = require('fs').promises;
const EventEmitter = require('events');
const wsBrowser = require('./communications/wsBrowserTransport.js');
const triggerContext = require('./triggerContext.js');

// Global store for pending script executions
// Keyed by jobName (which includes orchestration jobId, executionId, and node id)
const pendingExecutions = {};

// Track active orchestration execution IDs by jobId
// Structure: { [jobId]: { executionIds: Set<string>, latestExecutionId: string } }
// This allows multiple concurrent executions of the same job without cross-talk
const activeOrchestrationExecutions = {};  // jobId -> { executionIds: Set, latestExecutionId: string }

// Serialize saveExecutionResult writes per jobId to prevent concurrent read-modify-write races
const saveExecutionQueues = {};  // jobId -> Promise chain

// Event emitter for script completion events
const scriptCompletionEmitter = new EventEmitter();

/**
 * Wait for a script to complete on an agent
 * @param {string} jobName - The job name (orchestration job ID + execution ID + node ID)
 * @param {number} timeout - Timeout in milliseconds (default 5 minutes)
 * @returns {Promise<Object>} Execution result with exitCode, stdout, stderr
 */
function waitForScriptCompletion(jobName, timeout = 300000) {
  return new Promise((resolve, reject) => {
    // Store the resolver for later use
    pendingExecutions[jobName] = { resolve, reject, startTime: Date.now() };
    logger.debug(`[ORCHESTRATION] Setting up wait for script [${jobName}] with timeout ${timeout}ms`);

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      logger.error(`[ORCHESTRATION] Timeout waiting for script [${jobName}]`);
      delete pendingExecutions[jobName];
      scriptCompletionEmitter.removeListener(`complete:${jobName}`, onCompletion);
      reject(new Error(`Script execution timeout for job [${jobName}] after ${timeout}ms`));
    }, timeout);

    // Set up event listener for completion
    const onCompletion = (result) => {
      logger.debug(`[ORCHESTRATION] Script completion signal received for [${jobName}] with exitCode ${result.exitCode}`);
      clearTimeout(timeoutHandle);
      delete pendingExecutions[jobName];
      scriptCompletionEmitter.removeListener(`complete:${jobName}`, onCompletion);
      resolve(result);
    };

    logger.debug(`[ORCHESTRATION] Registering listener for event [complete:${jobName}]`);
    scriptCompletionEmitter.once(`complete:${jobName}`, onCompletion);
  });
}

/**
 * Signal that a script has completed (called from agentMessageProcessor)
 * @param {string} jobName - The job name that completed
 * @param {Object} result - Result object with returnCode, stdout, stderr, etc
 */
function signalScriptCompletion(jobName, result) {
  logger.debug(`[ORCHESTRATION] Attempting to signal completion for [${jobName}]`);
  if (pendingExecutions[jobName]) {
    logger.debug(`[ORCHESTRATION] Emitting complete event for [${jobName}] with exitCode ${result.exitCode}`);
    scriptCompletionEmitter.emit(`complete:${jobName}`, result);
  } else {
    logger.warn(`[ORCHESTRATION] No pending execution found for [${jobName}]. Ignored signal.`);
  }
}

/**
 * Evaluate a numeric condition with various operators
 * @param {number} actual - The actual value to test
 * @param {string} operator - The operator: '==', '!=', '>', '!>', '>=', '!>=', '<', '!<', '<=', '!<='
 * @param {number} expected - The expected/threshold value
 * @returns {boolean} Result of the comparison
 */
function evaluateNumericCondition(actual, operator, expected) {
  const actualNum = parseFloat(actual);
  const expectedNum = parseFloat(expected);
  
  // Check if operator is negated (starts with !)
  let isNegated = false;
  let baseOperator = operator;
  
  if (operator.startsWith('!') && operator !== '!=') {
    isNegated = true;
    baseOperator = operator.substring(1); // Remove the ! prefix
  }
  
  let result = false;

  switch (baseOperator) {
    case '==':
      result = actualNum === expectedNum;
      break;
    case '!=':
      result = actualNum !== expectedNum;
      break;
    case '=': // Alternative for equals
      result = actualNum === expectedNum;
      break;
    case '>':
      result = actualNum > expectedNum;
      break;
    case '>=':
      result = actualNum >= expectedNum;
      break;
    case '<':
      result = actualNum < expectedNum;
      break;
    case '<=':
      result = actualNum <= expectedNum;
      break;
    default:
      logger.warn(`Unknown operator: ${operator}, defaulting to ==`);
      result = actualNum === expectedNum;
  }
  
  // Apply negation if operator was prefixed with !
  if (isNegated) {
    result = !result;
  }
  
  return result;
}


/**
 * Execute an orchestration job
 * @param {string} jobId - The orchestration job ID
 * @param {boolean} isManual - Whether this is a manual execution
 * @param {string} executionId - Optional execution ID to use (generated if not provided)
 * @returns {Promise<Object>} Execution result with logs
 */
async function executeJob(jobId, isManual = false, executionId = null, onNodeComplete = null, triggerContextParam = null, rerunFrom = null) {
  const crypto = require('crypto');
  // Use provided executionId or generate a new one
  const finalExecutionId = executionId || crypto.randomBytes(8).toString('hex');
  const startTime = new Date();
  const executionLog = {
    jobId,
    executionId: finalExecutionId,  // Use the provided or generated ID
    orchestrationVersion: null,  // Will be filled from job
    startTime,
    endTime: null,
    status: 'running',
    currentNode: null,
    visitedNodes: [],
    scriptOutputs: {},
    conditionEvaluations: {},
    nodeMetrics: {},  // NEW: Unified timing for all node types
    errors: [],
    finalStatus: null,
    manual: isManual,  // Track whether this was a manual execution
    triggerContext: triggerContextParam || null,  // Store trigger context for template substitution and logging
    rerunFrom: rerunFrom || null  // NEW: Track if this is a rerun of a failed execution
  };

  try {
    // Fetch the job definition
    const jobs = await db.getData('ORCHESTRATION_JOBS');
    const jobData = jobs[jobId];

    if (!jobData) {
      throw new Error(`Orchestration job [${jobId}] not found`);
    }

    // Get current version of the job
    const currentVersionData = jobData.versions[jobData.versions.length - 1];
    executionLog.orchestrationVersion = jobData.currentVersion || 1;
    
    const job = {
      ...jobData,
      nodes: currentVersionData.nodes || [],
      edges: currentVersionData.edges || []
    };

    logger.info(`Starting execution of orchestration job [${jobId}] at version ${executionLog.orchestrationVersion}`);

    // Register this execution so history records can associate nodes with it
    // Support multiple concurrent executions per job
    if (!activeOrchestrationExecutions[jobId]) {
      activeOrchestrationExecutions[jobId] = { executionIds: new Set(), latestExecutionId: null };
    }
    activeOrchestrationExecutions[jobId].executionIds.add(finalExecutionId);
    activeOrchestrationExecutions[jobId].latestExecutionId = finalExecutionId;

    // Find start node
    const startNode = job.nodes.find(n => n.type === 'start');
    if (!startNode) {
      throw new Error('No start node found in orchestration');
    }

    // Build maps for node and edge traversal.
    const nodeMap = {};
    job.nodes.forEach(n => {
      nodeMap[n.id] = n;
    });

    const edgeMap = {};
    const incomingEdgeMap = {};
    job.edges.forEach(e => {
      const key = `${e.from}#${e.fromPort}`;
      if (!edgeMap[key]) {
        edgeMap[key] = [];
      }
      edgeMap[key].push(e);

      if (!incomingEdgeMap[e.to]) {
        incomingEdgeMap[e.to] = [];
      }
      incomingEdgeMap[e.to].push(e);
    });

    // Join coordination state for split-join nodes in join mode.
    const joinState = {};

    const getOutgoingEdges = (nodeId, portName = 'out') => edgeMap[`${nodeId}#${portName}`] || [];

    const markNodeStarted = (node) => {
      executionLog.currentNode = node.id;
      executionLog.visitedNodes.push(node.id);
      logger.info(`Executing node [${node.id}] type: ${node.type}`);
      wsBrowser.emitOrchestrationEvent(jobId, executionLog.executionId, 'orchestrationNodeStarted', {
        nodeId: node.id,
        nodeType: node.type,
        nodeName: node.data?.name || node.id
      });
      return new Date().toISOString();
    };

    const markNodeCompleted = (node, nodeStartTime, status, extra = {}) => {
      const nodeEndTime = new Date().toISOString();
      executionLog.nodeMetrics[node.id] = {
        startTime: nodeStartTime,
        endTime: nodeEndTime,
        duration: (new Date(nodeEndTime).getTime() - new Date(nodeStartTime).getTime()) / 1000
      };

      wsBrowser.emitOrchestrationEvent(jobId, executionLog.executionId, 'orchestrationNodeCompleted', {
        nodeId: node.id,
        nodeType: node.type,
        status,
        ...extra
      });

      if (onNodeComplete) {
        onNodeComplete(executionLog);
      }
    };

    const mergeBranchResults = (results, errorPolicy = 'waitForAll') => {
      const normalized = (results || []).filter(Boolean);
      if (normalized.length === 0) {
        return 'success';
      }

      if (normalized.includes('error')) {
        return 'error';
      }

      if (normalized.includes('failure')) {
        return 'failure';
      }

      if (errorPolicy === 'failFast' && normalized.some(r => r !== 'success')) {
        return 'failure';
      }

      return 'success';
    };

    let maxIterations = 1000; // Prevent infinite loops
    let iterations = 0;

    async function executePath(nodeId, pathContext = {}, incomingEdge = null) {
      iterations++;
      if (iterations >= maxIterations) {
        throw new Error('Execution exceeded maximum iterations (infinite loop detected)');
      }

      const currentNode = nodeMap[nodeId];
      if (!currentNode) {
        throw new Error(`Node [${nodeId}] not found in orchestration`);
      }

      if (currentNode.type === 'split-join') {
        const mode = (currentNode.data?.mode || 'split').toLowerCase();
        if (mode === 'join') {
          const incomingEdges = incomingEdgeMap[currentNode.id] || [];
          if (!joinState[currentNode.id]) {
            joinState[currentNode.id] = {
              arrivedEdgeIds: new Set(),
              released: false
            };
          }

          const state = joinState[currentNode.id];
          if (incomingEdge && incomingEdge.id) {
            state.arrivedEdgeIds.add(incomingEdge.id);
          }

          const joinStrategy = (currentNode.data?.joinStrategy || 'waitAll').toLowerCase();
          let continueFromJoin = false;

          if (!state.released) {
            if (joinStrategy === 'waitany') {
              state.released = true;
              continueFromJoin = true;
            } else {
              const requiredCount = Math.max(incomingEdges.length, 1);
              if (state.arrivedEdgeIds.size >= requiredCount) {
                state.released = true;
                continueFromJoin = true;
              }
            }
          }

          // This branch reached the join but is not the releasing branch.
          if (!continueFromJoin) {
            return null;
          }
        }
      }

      const nodeStartTime = markNodeStarted(currentNode);

      if (currentNode.type === 'start') {
        const outgoing = getOutgoingEdges(currentNode.id, 'out');
        if (outgoing.length === 0) {
          throw new Error(`Start node [${currentNode.id}] has no outgoing connection`);
        }
        if (outgoing.length > 1) {
          throw new Error(`Start node [${currentNode.id}] has multiple outgoing connections. Use a split-join node for fan-out.`);
        }

        markNodeCompleted(currentNode, nodeStartTime, 'success');
        return executePath(outgoing[0].to, pathContext, outgoing[0]);
      }

      if (currentNode.type === 'execute') {
        let scriptPath = currentNode.data.script;
        let parameters = currentNode.data.parameters || '';
        const agentId = currentNode.data.agent;

        // Apply template substitution with context or default test context
        if (parameters.includes('#{')) {
          let contextForSubstitution = executionLog.triggerContext;

          // If no trigger context (manual execution), create default test context
          if (!contextForSubstitution) {
            contextForSubstitution = {
              type: 'manual',
              timestamp: new Date().toISOString(),
              executionId: executionLog.executionId,
              webhook: {
                payload: { data: 'test' }
              },
              metric: { value: 0 },
              condition: { threshold: 0 }
            };
            logger.debug('[ORCHESTRATION] No trigger context - using default test context for template substitution');
          }

          parameters = triggerContext.substituteTemplate(parameters, contextForSubstitution);
          logger.debug(`[ORCHESTRATION] Applied template substitution to parameters. Result: [${parameters}]`);
        }

        if (!scriptPath) {
          throw new Error(`Execute node [${currentNode.id}] has no script configured`);
        }

        if (!agentId) {
          throw new Error(`Execute node [${currentNode.id}] has no agent configured`);
        }

        try {
          const agents = require('./agents.js');
          const agent = agents.getAgent(agentId);

          let result;
          const offlineCheckTime = new Date().toISOString();

          if (!agent) {
            logger.error(`[ORCHESTRATION] Agent [${agentId}] not found - treating as offline`);
            result = {
              exitCode: 1,
              stdout: '',
              stderr: `Agent [${agentId}] not found in system`,
              startTime: offlineCheckTime,
              endTime: offlineCheckTime
            };
          } else if (agent.status === 'offline') {
            logger.warn(`[ORCHESTRATION] Agent [${agentId}] is offline (status: ${agent.status}) - skipping execution and continuing orchestration`);
            result = {
              exitCode: 1,
              stdout: '',
              stderr: `Agent [${agentId}] is currently offline (status: ${agent.status}). Execution skipped.`,
              startTime: offlineCheckTime,
              endTime: offlineCheckTime
            };
          } else {
            const jobName = `Orchestration [${jobId}] Execution [${executionLog.executionId}] Node [${currentNode.id}]`;
            const logKey = `${agent.name}_${jobName}_log`;
            try {
              await db.deleteData(logKey);
              logger.debug(`[ORCHESTRATION] Cleared old log for key [${logKey}]`);
            } catch (clearErr) {
              logger.debug(`[ORCHESTRATION] No existing log to clear for key [${logKey}]: ${clearErr.message}`);
            }

            const fullScriptPath = `./scripts/${scriptPath}`;
            logger.info(`Reading script content from [${fullScriptPath}]`);

            let scriptContent;
            try {
              scriptContent = await fs.readFile(fullScriptPath, 'utf8');
            } catch (readErr) {
              const scriptReadMessage = (readErr && readErr.code === 'ENOENT')
                ? `Script cannot be found: [${fullScriptPath}]`
                : `Failed to read script [${fullScriptPath}]: ${readErr.message}`;

              const failureTime = new Date().toISOString();
              executionLog.scriptOutputs[currentNode.id] = {
                script: scriptPath,
                parameters,
                agent: agentId,
                status: 'failed',
                exitCode: 1,
                stdout: scriptReadMessage,
                stderr: scriptReadMessage,
                startTime: failureTime,
                endTime: failureTime
              };

              logger.error(`[ORCHESTRATION] ${scriptReadMessage}`);
              throw new Error(scriptReadMessage);
            }

            let contextEnvVars = {};
            if (executionLog.triggerContext) {
              contextEnvVars = triggerContext.contextToEnvVars(executionLog.triggerContext);
              logger.debug(`[ORCHESTRATION] Prepared ${Object.keys(contextEnvVars).length} trigger context environment variables`);
            }

            logger.info(`Sending script [${scriptPath}] to agent [${agentId}]`);

            const sendCommandArgs = [
              agentId,
              'execute/orchestrationScript',
              scriptContent,
              parameters,
              jobName,
              undefined,
              isManual,
              executionLog.executionId
            ];

            if (executionLog.triggerContext) {
              sendCommandArgs.push(executionLog.triggerContext, contextEnvVars);
            }

            agentComms.sendCommand(...sendCommandArgs);

            logger.debug(`[ORCHESTRATION] About to wait for script completion on node [${currentNode.id}]`);
            const actualStartTime = new Date().toISOString();
            result = await waitForScriptCompletion(jobName, 300000);
            const actualEndTime = new Date().toISOString();
            logger.debug(`[ORCHESTRATION] Script completion received: exitCode=${result.exitCode}`);

            result.startTime = actualStartTime;
            result.endTime = actualEndTime;
          }

          executionLog.scriptOutputs[currentNode.id] = {
            script: scriptPath,
            parameters,
            agent: agentId,
            status: 'completed',
            exitCode: result.exitCode || 0,
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            startTime: result.startTime,
            endTime: result.endTime
          };

          if (result.stderr && (result.stderr.includes('offline') || result.stderr.includes('not found'))) {
            logger.error(`Execute step failed for node [${currentNode.id}]: ${result.stderr}`);
          } else {
            logger.info(`Script execution completed on agent [${agentId}] with exit code [${result.exitCode}]`);
          }

          const status = result.exitCode === 0 ? 'success' : 'failed';
          markNodeCompleted(currentNode, nodeStartTime, status, { exitCode: result.exitCode || 0 });

          const outgoing = getOutgoingEdges(currentNode.id, 'out');
          if (outgoing.length === 0) {
            return result.exitCode === 0 ? 'success' : 'failure';
          }
          if (outgoing.length > 1) {
            throw new Error(`Execute node [${currentNode.id}] has multiple outgoing connections. Use split-join node in split mode.`);
          }

          return executePath(outgoing[0].to, { ...pathContext, lastScriptNodeId: currentNode.id }, outgoing[0]);
        } catch (err) {
          wsBrowser.emitOrchestrationEvent(jobId, executionLog.executionId, 'orchestrationNodeCompleted', {
            nodeId: currentNode.id,
            nodeType: currentNode.type,
            status: 'failed',
            exitCode: executionLog.scriptOutputs[currentNode.id]?.exitCode || 1
          });

          executionLog.errors.push({
            node: currentNode.id,
            message: err.message
          });
          throw err;
        }
      }

      if (currentNode.type === 'condition') {
        const conditionType = currentNode.data.conditionType || 'return_code';
        const operator = currentNode.data.operator || '==';
        const conditionValue = currentNode.data.conditionValue || '0';
        let result = false;

        try {
          const lastScriptNode = pathContext.lastScriptNodeId;

          if (conditionType === 'return_code') {
            if (lastScriptNode && executionLog.scriptOutputs[lastScriptNode]) {
              const exitCode = executionLog.scriptOutputs[lastScriptNode].exitCode || 0;
              result = evaluateNumericCondition(exitCode, operator, parseInt(conditionValue));
            }
          } else if (conditionType === 'output_contains') {
            if (lastScriptNode && executionLog.scriptOutputs[lastScriptNode]) {
              const output = executionLog.scriptOutputs[lastScriptNode].stdout || '';
              const contains = output.includes(conditionValue);
              result = (operator === '!=' || operator === '!=') ? !contains : contains;
            }
          } else if (conditionType === 'regex_match') {
            if (lastScriptNode && executionLog.scriptOutputs[lastScriptNode]) {
              try {
                const output = executionLog.scriptOutputs[lastScriptNode].stdout || '';
                const regex = new RegExp(conditionValue);
                const matches = output.match(regex);
                result = matches !== null;
                if (operator.includes('!=') || operator === '!=') {
                  result = !result;
                } else if (operator !== '==' && operator !== '!') {
                  const matchCount = matches ? matches.length : 0;
                  result = evaluateNumericCondition(matchCount, operator, parseInt(conditionValue));
                }
              } catch (regexErr) {
                throw new Error(`Invalid regex pattern: ${conditionValue} - ${regexErr.message}`);
              }
            }
          } else if (conditionType === 'execution_time') {
            if (lastScriptNode && executionLog.nodeMetrics[lastScriptNode]) {
              const nodeMetric = executionLog.nodeMetrics[lastScriptNode];
              result = evaluateNumericCondition(nodeMetric.duration, operator, parseFloat(conditionValue));
            }
          }

          executionLog.conditionEvaluations[currentNode.id] = {
            type: conditionType,
            operator,
            value: conditionValue,
            result
          };

          logger.info(`Condition [${currentNode.id}] evaluated: ${result} (${conditionType} ${operator} ${conditionValue})`);

          const portName = result ? 'true' : 'false';
          const outgoing = getOutgoingEdges(currentNode.id, portName);
          if (outgoing.length === 0) {
            throw new Error(`Condition node [${currentNode.id}] has no ${portName} branch connection`);
          }
          if (outgoing.length > 1) {
            throw new Error(`Condition node [${currentNode.id}] has multiple ${portName} branch connections`);
          }

          markNodeCompleted(currentNode, nodeStartTime, 'success');
          return executePath(outgoing[0].to, pathContext, outgoing[0]);
        } catch (err) {
          executionLog.errors.push({
            node: currentNode.id,
            message: err.message
          });
          throw err;
        }
      }

      if (currentNode.type === 'split-join') {
        const mode = (currentNode.data?.mode || 'split').toLowerCase();

        if (mode === 'split') {
          const outgoing = getOutgoingEdges(currentNode.id, 'out');
          if (outgoing.length === 0) {
            throw new Error(`Split node [${currentNode.id}] has no outgoing paths`);
          }

          markNodeCompleted(currentNode, nodeStartTime, 'success');

          const branchPromises = outgoing.map(edge => executePath(edge.to, { ...pathContext }, edge));
          const branchResults = await Promise.all(branchPromises);
          return mergeBranchResults(branchResults, currentNode.data?.errorPolicy || 'waitForAll');
        }

        if (mode === 'join') {
          markNodeCompleted(currentNode, nodeStartTime, 'success');

          const outgoing = getOutgoingEdges(currentNode.id, 'out');
          if (outgoing.length === 0) {
            return 'success';
          }
          if (outgoing.length > 1) {
            throw new Error(`Join node [${currentNode.id}] has multiple outgoing connections`);
          }

          return executePath(outgoing[0].to, pathContext, outgoing[0]);
        }

        throw new Error(`Split-join node [${currentNode.id}] has invalid mode [${mode}]`);
      }

      if (currentNode.type === 'end-success') {
        markNodeCompleted(currentNode, nodeStartTime, 'success');
        logger.info(`Orchestration [${jobId}] completed successfully at node [${currentNode.id}]`);
        return 'success';
      }

      if (currentNode.type === 'end-failure') {
        markNodeCompleted(currentNode, nodeStartTime, 'failure');
        logger.info(`Orchestration [${jobId}] completed with failure at node [${currentNode.id}]`);
        return 'failure';
      }

      throw new Error(`Unknown node type: ${currentNode.type}`);
    }

    const executionOutcome = await executePath(startNode.id, {}, null);
    if (executionLog.finalStatus === null && executionOutcome) {
      executionLog.finalStatus = executionOutcome;
    }

    // If finalStatus hasn't been set (no explicit end node was reached),
    // determine it based on the last executed node
    if (executionLog.finalStatus === null) {
      // Find the last execute node that was executed
      const lastExecuteNode = [...executionLog.visitedNodes]
        .reverse()
        .find(id => nodeMap[id].type === 'execute' && executionLog.scriptOutputs[id]);

      if (lastExecuteNode && executionLog.scriptOutputs[lastExecuteNode]) {
        const exitCode = executionLog.scriptOutputs[lastExecuteNode].exitCode || 0;
        if (exitCode === 0) {
          executionLog.finalStatus = 'success';
          logger.info(`Orchestration [${jobId}] completed: final execute node succeeded (exit code 0)`);
        } else {
          executionLog.finalStatus = 'failure';
          logger.info(`Orchestration [${jobId}] completed: final execute node failed (exit code ${exitCode})`);
        }
      } else {
        // No execute nodes found, treat as success
        executionLog.finalStatus = 'success';
        logger.info(`Orchestration [${jobId}] completed: no execute nodes executed, defaulting to success`);
      }
    }

    executionLog.endTime = new Date().toISOString();
    executionLog.status = 'completed';
    if (onNodeComplete) {
      onNodeComplete(executionLog);
    }
    return executionLog;
  } catch (err) {
    executionLog.status = 'failed';
    executionLog.finalStatus = 'error';
    executionLog.errors.push({
      message: err.message,
      stack: err.stack
    });
    executionLog.endTime = new Date().toISOString();

    if (onNodeComplete) {
      onNodeComplete(executionLog);
    }

    logger.error(`Orchestration [${jobId}] execution failed: ${err.message}`);
    // Note: returning executionLog here ensures the promise resolves (not rejects)
    // This allows server.js to properly save and clean up the failed execution
    return executionLog;
  } finally {
    // Clean up execution tracking - but delay for 30 seconds to allow pending messages to be processed
    // Some agent messages may still be in the queue after orchestration completes
    const cleanupTimeout = setTimeout(() => {
      if (activeOrchestrationExecutions[jobId]) {
        activeOrchestrationExecutions[jobId].executionIds.delete(finalExecutionId);
        // If no more active executions for this job, clean up the entry
        if (activeOrchestrationExecutions[jobId].executionIds.size === 0) {
          delete activeOrchestrationExecutions[jobId];
          logger.debug(`Cleared execution tracking for orchestration [${jobId}] (no more active executions)`);
        } else {
          // Update latestExecutionId to the remaining execution if we just removed it
          if (activeOrchestrationExecutions[jobId].latestExecutionId === finalExecutionId) {
            const remaining = Array.from(activeOrchestrationExecutions[jobId].executionIds);
            activeOrchestrationExecutions[jobId].latestExecutionId = remaining[remaining.length - 1];
          }
          logger.debug(`Cleared execution [${finalExecutionId}] for orchestration [${jobId}] (${activeOrchestrationExecutions[jobId].executionIds.size} still active)`);
        }
      }
    }, 30000);
    
    // Allow process to exit even if this timeout is pending (useful for tests)
    if (cleanupTimeout.unref) {
      cleanupTimeout.unref();
    }
  }
}

/**
 * Get execution history for a job
 * @param {string} jobId - The orchestration job ID
 * @returns {Promise<Array>} Array of execution logs
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
 * Save execution result to history
 * @param {Object} executionLog - The execution log to save
 */
async function saveExecutionResult(executionLog) {
  const jobId = executionLog.jobId;

  // Serialize writes per jobId to prevent concurrent read-modify-write races
  const previous = saveExecutionQueues[jobId] || Promise.resolve();
  const next = previous.then(() => _doSaveExecutionResult(executionLog));
  saveExecutionQueues[jobId] = next.catch(() => {});  // Keep chain alive even on error
  return next;
}

async function _doSaveExecutionResult(executionLog) {
  try {
    let executions = {};
    try {
      executions = await db.getData('ORCHESTRATION_EXECUTIONS');
    } catch (err) {
      // Initialize if doesn't exist
      if (!err.message?.includes('NotFoundError')) throw err;
      executions = {};
    }

    const jobId = executionLog.jobId;
    if (!executions[jobId]) {
      executions[jobId] = [];
    }

    executions[jobId].push(executionLog);

    // Keep last 100 executions per job
    if (executions[jobId].length > 100) {
      executions[jobId] = executions[jobId].slice(-100);
    }

    await db.putData('ORCHESTRATION_EXECUTIONS', executions);

    // If execution failed before agent callbacks (e.g. missing script file),
    // synthesize node history entries so History/Monitor can show the failure log.
    await saveMissingScriptNodeHistory(executionLog);
    
    // Log the execution for reference
    logger.info(`Saved orchestration execution [${jobId}] with status [${executionLog.finalStatus}]`);

    // Send notification if orchestration failed
    if ((executionLog.finalStatus === 'failure' || executionLog.finalStatus === 'error')) {
      try {
        const serverConfig = global.serverConfig || require('./configuration.js').getConfig();
        if (serverConfig && serverConfig.server && serverConfig.server.jobFailEnabled === 'true') {
          const notifier = require('./notify.js');
          const orchestrationMonitor = require('./orchestrationMonitor.js');
          
          // Get orchestration job name
          let jobName = jobId;
          try {
            const job = await orchestrationMonitor.getJobDefinitionVersion(jobId, 'current');
            if (job && job.name) {
              jobName = job.name;
            }
          } catch (err) {
            logger.debug(`Could not fetch job name for notification: ${err.message}`);
          }

          // Build root cause description from error info
          let rootCause = 'Orchestration workflow failed';
          
          // Check if there are captured errors
          if (executionLog.errors && executionLog.errors.length > 0) {
            const firstError = executionLog.errors[0];
            rootCause = `Node [${firstError.node}] failed: ${firstError.message}`;
          } else {
            // Look for the last execute node that failed
            const lastExecuteNode = [...executionLog.visitedNodes]
              .reverse()
              .find(id => executionLog.scriptOutputs && executionLog.scriptOutputs[id]);
            
            if (lastExecuteNode && executionLog.scriptOutputs[lastExecuteNode]) {
              const nodeOutput = executionLog.scriptOutputs[lastExecuteNode];
              if (nodeOutput.exitCode !== 0) {
                rootCause = `Node [${lastExecuteNode}] failed with exit code ${nodeOutput.exitCode}`;
              }
            }
          }

          const notificationTitle = `${jobName} - Orchestration Failed`;
          const notificationDescription = `${rootCause}\n\nExecution ID: ${executionLog.executionId}\nView details in Orchestration Monitor`;
          const notificationLink = `/orchestration/monitor.html?jobId=${encodeURIComponent(jobId)}&executionId=${encodeURIComponent(executionLog.executionId)}`;

          notifier.sendNotification(notificationTitle, notificationDescription, 'WARNING', notificationLink);
          logger.info(`Sent orchestration failure notification for [${jobId}]`);
        }
      } catch (notifyErr) {
        logger.warn(`Failed to send orchestration failure notification: ${notifyErr.message}`);
      }
    }
  } catch (err) {
    logger.error(`Failed to save execution result: ${err.message}`);
  }
}

/**
 * Save synthetic history entries for missing-script failures that happen before
 * agent eta/log callbacks. This keeps History and Monitor views consistent.
 * @param {Object} executionLog
 */
async function saveMissingScriptNodeHistory(executionLog) {
  try {
    if (!executionLog || !executionLog.jobId || !executionLog.executionId || !executionLog.scriptOutputs) {
      return;
    }

    const history = require('./history.js');
    const scriptOutputs = executionLog.scriptOutputs || {};
    const historyItems = (typeof history.getItems === 'function') ? (history.getItems() || []) : [];

    for (const [nodeId, output] of Object.entries(scriptOutputs)) {
      const stdout = output?.stdout || '';
      const stderr = output?.stderr || '';
      const missingScriptMessage = stdout.includes('Script cannot be found') || stderr.includes('Script cannot be found');

      if (!missingScriptMessage) {
        continue;
      }

      const nodeJobName = `Orchestration [${executionLog.jobId}] Execution [${executionLog.executionId}] Node [${nodeId}]`;
      const exists = historyItems.some(item => item && item.jobName === nodeJobName);
      if (exists) {
        continue;
      }

      const startTime = output.startTime || executionLog.startTime || new Date().toISOString();
      const endTime = output.endTime || executionLog.endTime || startTime;
      const runTimeSecs = Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000));
      const returnCode = Number.isInteger(output.exitCode) ? output.exitCode : 1;
      const logMessage = [stdout, stderr].filter(Boolean).join('\n\n') || 'Script cannot be found';

      const histItem = history.createHistoryItem(
        nodeJobName,
        startTime,
        returnCode,
        runTimeSecs,
        logMessage,
        executionLog.manual || false,
        executionLog.executionId,
        executionLog.rerunFrom || null
      );

      history.add(histItem);
      logger.info(`[ORCHESTRATION] Added synthetic history entry for missing script on node [${nodeId}]`);
    }
  } catch (err) {
    logger.warn(`[ORCHESTRATION] Failed to save synthetic missing-script history: ${err.message}`);
  }
}

/**
 * Find the index of an execution by its executionId
 * @param {string} jobId - The orchestration job ID
 * @param {string} executionId - The execution ID to find
 * @returns {Promise<number>} Array index of the execution, or -1 if not found
 */
async function getExecutionIndexById(jobId, executionId) {
  try {
    const executions = await getExecutionHistory(jobId);
    if (!executions) {
      logger.warn(`[MONITOR] No execution history found for job [${jobId}]`);
      return -1;
    }
    
    logger.debug(`[MONITOR] Searching for executionId [${executionId}] in ${executions.length} executions:`);
    executions.forEach((exec, idx) => {
      logger.debug(`  [${idx}] executionId=${exec.executionId}, startTime=${exec.startTime}`);
    });
    
    const index = executions.findIndex(exec => exec.executionId === executionId);
    logger.info(`[MONITOR] Search result: executionId [${executionId}] found at index [${index}]`);
    return index;
  } catch (err) {
    logger.error(`Failed to find execution index for [${jobId}:${executionId}]: ${err.message}`);
    return -1;
  }
}

module.exports = {
  executeJob,
  getExecutionHistory,
  saveExecutionResult,
  signalScriptCompletion,
  waitForScriptCompletion,
  activeOrchestrationExecutions,
  getExecutionIndexById,
  evaluateNumericCondition  // Export for testing
};
