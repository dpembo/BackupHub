/**
 * Orchestration Execution Engine
 * Executes orchestration jobs by traversing the graph and executing scripts on agents
 */

const db = require('./db.js');
const fs = require('fs').promises;
const EventEmitter = require('events');
const wsBrowser = require('./communications/wsBrowserTransport.js');

// Global store for pending script executions
// Keyed by jobName (which includes orchestration jobId and node id)
const pendingExecutions = {};

// Track active orchestration execution IDs by jobId
// This allows history recording to associate nodes with their execution
const activeOrchestrationExecutions = {};  // jobId -> executionId

// Event emitter for script completion events
const scriptCompletionEmitter = new EventEmitter();

/**
 * Wait for a script to complete on an agent
 * @param {string} jobName - The job name (orchestration job ID + node ID)
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
async function executeJob(jobId, isManual = false, executionId = null, onNodeComplete = null) {
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
    manual: isManual  // Track whether this was a manual execution
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
    activeOrchestrationExecutions[jobId] = finalExecutionId;

    // Find start node
    const startNode = job.nodes.find(n => n.type === 'start');
    if (!startNode) {
      throw new Error('No start node found in orchestration');
    }

    // Build a map of nodes and edges for easy traversal
    const nodeMap = {};
    job.nodes.forEach(n => {
      nodeMap[n.id] = n;
    });

    const edgeMap = {};
    job.edges.forEach(e => {
      const key = `${e.from}#${e.fromPort}`;
      edgeMap[key] = e;
    });

    // Start execution from start node
    let currentNodeId = startNode.id;
    let maxIterations = 1000; // Prevent infinite loops
    let iterations = 0;

    // Traverse the graph
    while (iterations < maxIterations) {
      iterations++;
      const currentNode = nodeMap[currentNodeId];

      if (!currentNode) {
        throw new Error(`Node [${currentNodeId}] not found in orchestration`);
      }

      executionLog.currentNode = currentNodeId;
      executionLog.visitedNodes.push(currentNodeId);

      logger.info(`Executing node [${currentNodeId}] type: ${currentNode.type}`);

      const nodeStartTime = new Date().toISOString();

      // Emit nodeStarted event for all nodes (including start)
      console.log(`[executeJob] Start node - emitting orchestrationNodeStarted for ${currentNodeId}`);
      wsBrowser.emitOrchestrationEvent(jobId, executionLog.executionId, 'orchestrationNodeStarted', {
        nodeId: currentNodeId,
        nodeType: currentNode.type,
        nodeName: currentNode.data?.name || currentNodeId
      });

      // Handle different node types
      if (currentNode.type === 'start') {
        // Start node: just move to next
        const nextEdgeKey = `${currentNodeId}#out`;
        const nextEdge = edgeMap[nextEdgeKey];

        if (!nextEdge) {
          throw new Error(`Start node [${currentNodeId}] has no outgoing connection`);
        }

        const nodeEndTime = new Date().toISOString();
        executionLog.nodeMetrics[currentNodeId] = {
          startTime: nodeStartTime,
          endTime: nodeEndTime,
          duration: (new Date(nodeEndTime).getTime() - new Date(nodeStartTime).getTime()) / 1000
        };

        // Emit nodeCompleted event
        console.log(`[executeJob] Start node - emitting orchestrationNodeCompleted for ${currentNodeId}`);
        wsBrowser.emitOrchestrationEvent(jobId, executionLog.executionId, 'orchestrationNodeCompleted', {
          nodeId: currentNodeId,
          nodeType: currentNode.type,
          status: 'success'
        });

        // Update cache with latest visited nodes
        if (onNodeComplete) {
          onNodeComplete(executionLog);
        }

        currentNodeId = nextEdge.to;
      } else if (currentNode.type === 'execute') {
        // Execute node: send script to agent and wait for completion
        let scriptPath = currentNode.data.script;
        const parameters = currentNode.data.parameters || '';
        const agentId = currentNode.data.agent;

        if (!scriptPath) {
          throw new Error(`Execute node [${currentNodeId}] has no script configured`);
        }

        if (!agentId) {
          throw new Error(`Execute node [${currentNodeId}] has no agent configured`);
        }

        try {
          // Clear any old logs from the database for this job before execution
          // Construct the log key that will be used (must match agentMessageProcessor logic)
          const agents = require('./agents.js');
          const agent = agents.getAgent(agentId);
          if (agent) {
            const jobName = `Orchestration [${jobId}] Node [${currentNodeId}]`;
            const logKey = `${agent.name}_${jobName}_log`;
            try {
              await db.deleteData(logKey);
              logger.debug(`[ORCHESTRATION] Cleared old log for key [${logKey}]`);
            } catch (clearErr) {
              // Key might not exist - that's fine
              logger.debug(`[ORCHESTRATION] No existing log to clear for key [${logKey}]: ${clearErr.message}`);
            }
          }
          // Read script content from server
          const fullScriptPath = `./scripts/${scriptPath}`;
          logger.info(`Reading script content from [${fullScriptPath}]`);
          
          let scriptContent;
          try {
            scriptContent = await fs.readFile(fullScriptPath, 'utf8');
          } catch (readErr) {
            throw new Error(`Failed to read script [${fullScriptPath}]: ${readErr.message}`);
          }

          // Construct job name that matches what agent will report back
          const jobName = `Orchestration [${jobId}] Node [${currentNodeId}]`;
          
          logger.info(`Sending script [${scriptPath}] to agent [${agentId}]`);
          
          // Send script content (not path) to agent using agentComms
          // The agent will create a temp file with this content and execute it
          agentComms.sendCommand(
            agentId,
            'execute/orchestrationScript',
            scriptContent,  // Send actual script content, not path
            parameters,
            jobName,
            undefined,
            isManual
          );

          // Wait for agent response (with 5-minute timeout)
          logger.debug(`[ORCHESTRATION] About to wait for script completion on node [${currentNodeId}]`);
          const scriptStartTime = new Date().toISOString();
          const result = await waitForScriptCompletion(jobName, 300000);
          const scriptEndTime = new Date().toISOString();
          logger.debug(`[ORCHESTRATION] Script completion received: exitCode=${result.exitCode}`);

          // Update execution log with actual results
          executionLog.scriptOutputs[currentNodeId] = {
            script: scriptPath,
            parameters,
            agent: agentId,
            status: 'completed',
            exitCode: result.exitCode || 0,
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            startTime: scriptStartTime,
            endTime: scriptEndTime
          };

          logger.info(`Script execution completed on agent [${agentId}] with exit code [${result.exitCode}]`);

          const nodeEndTime = new Date().toISOString();
          executionLog.nodeMetrics[currentNodeId] = {
            startTime: nodeStartTime,
            endTime: nodeEndTime,
            duration: (new Date(nodeEndTime).getTime() - new Date(nodeStartTime).getTime()) / 1000
          };

          // Emit nodeCompleted event
          wsBrowser.emitOrchestrationEvent(jobId, executionLog.executionId, 'orchestrationNodeCompleted', {
            nodeId: currentNodeId,
            nodeType: currentNode.type,
            status: result.exitCode === 0 ? 'success' : 'failed',
            exitCode: result.exitCode || 0
          });

          // Update cache with latest visited nodes
          if (onNodeComplete) {
            onNodeComplete(executionLog);
          }

          // Move to next node, or complete if this execute node is terminal
          const nextEdgeKey = `${currentNodeId}#out`;
          const nextEdge = edgeMap[nextEdgeKey];

          if (!nextEdge) {
            executionLog.finalStatus = result.exitCode === 0 ? 'success' : 'failure';
            executionLog.status = 'completed';
            executionLog.endTime = nodeEndTime;
            logger.info(
              `Orchestration [${jobId}] completed at terminal execute node [${currentNodeId}] with status [${executionLog.finalStatus}]`
            );
            break;
          }

          currentNodeId = nextEdge.to;
        } catch (err) {
          executionLog.errors.push({
            node: currentNodeId,
            message: err.message
          });
          throw err;
        }
      } else if (currentNode.type === 'condition') {
        // Condition node: evaluate and route
        const conditionType = currentNode.data.conditionType || 'return_code';
        const operator = currentNode.data.operator || '==';
        const conditionValue = currentNode.data.conditionValue || '0';
        let result = false;

        try {
          if (conditionType === 'return_code') {
            // Get last executed script node
            const lastScriptNode = [...executionLog.visitedNodes]
              .reverse()
              .find(id => nodeMap[id].type === 'execute' && executionLog.scriptOutputs[id]);

            if (lastScriptNode && executionLog.scriptOutputs[lastScriptNode]) {
              const exitCode = executionLog.scriptOutputs[lastScriptNode].exitCode || 0;
              result = evaluateNumericCondition(exitCode, operator, parseInt(conditionValue));
            }
          } else if (conditionType === 'output_contains') {
            // Check if last script output contains value
            const lastScriptNode = [...executionLog.visitedNodes]
              .reverse()
              .find(id => nodeMap[id].type === 'execute' && executionLog.scriptOutputs[id]);

            if (lastScriptNode && executionLog.scriptOutputs[lastScriptNode]) {
              const output = executionLog.scriptOutputs[lastScriptNode].stdout || '';
              const contains = output.includes(conditionValue);
              
              // Handle equality operators for output_contains
              if (operator === '!=' || operator === '!=') {
                result = !contains;
              } else {
                result = contains;
              }
            }
          } else if (conditionType === 'regex_match') {
            // Check if last script output matches regex
            const lastScriptNode = [...executionLog.visitedNodes]
              .reverse()
              .find(id => nodeMap[id].type === 'execute' && executionLog.scriptOutputs[id]);

            if (lastScriptNode && executionLog.scriptOutputs[lastScriptNode]) {
              try {
                const output = executionLog.scriptOutputs[lastScriptNode].stdout || '';
                const regex = new RegExp(conditionValue);
                const matches = output.match(regex);
                // For regex, we consider it a match if pattern is found
                result = matches !== null;
                
                // For regex, handle != and other operators
                if (operator.includes('!=') || operator === '!=') {
                  result = !result;
                } else if (operator !== '==' && operator !== '!') {
                  // If numeric operator specified, count matches
                  const matchCount = matches ? matches.length : 0;
                  result = evaluateNumericCondition(matchCount, operator, parseInt(conditionValue));
                }
              } catch (regexErr) {
                throw new Error(`Invalid regex pattern: ${conditionValue} - ${regexErr.message}`);
              }
            }
          } else if (conditionType === 'execution_time') {
            // Check last script execution time (in seconds)
            const lastScriptNode = [...executionLog.visitedNodes]
              .reverse()
              .find(id => nodeMap[id].type === 'execute' && executionLog.nodeMetrics[id]);

            if (lastScriptNode && executionLog.nodeMetrics[lastScriptNode]) {
              const nodeMetric = executionLog.nodeMetrics[lastScriptNode];
              // duration is already in seconds
              result = evaluateNumericCondition(nodeMetric.duration, operator, parseFloat(conditionValue));
            }
          }

          executionLog.conditionEvaluations[currentNodeId] = {
            type: conditionType,
            operator: operator,
            value: conditionValue,
            result
          };

          logger.info(`Condition [${currentNodeId}] evaluated: ${result} (${conditionType} ${operator} ${conditionValue})`);

          // Route based on result
          const portName = result ? 'true' : 'false';
          const nextEdgeKey = `${currentNodeId}#${portName}`;
          const nextEdge = edgeMap[nextEdgeKey];

          if (!nextEdge) {
            throw new Error(
              `Condition node [${currentNodeId}] has no ${portName} branch connection`
            );
          }

          const nodeEndTime = new Date().toISOString();
          executionLog.nodeMetrics[currentNodeId] = {
            startTime: nodeStartTime,
            endTime: nodeEndTime,
            duration: (new Date(nodeEndTime).getTime() - new Date(nodeStartTime).getTime()) / 1000
          };

          // Emit nodeCompleted event for condition node
          wsBrowser.emitOrchestrationEvent(jobId, executionLog.executionId, 'orchestrationNodeCompleted', {
            nodeId: currentNodeId,
            nodeType: currentNode.type,
            status: 'success'  // Condition nodes are always successful
          });

          // Update cache with latest visited nodes
          if (onNodeComplete) {
            onNodeComplete(executionLog);
          }

          currentNodeId = nextEdge.to;
        } catch (err) {
          executionLog.errors.push({
            node: currentNodeId,
            message: err.message
          });
          throw err;
        }
      } else if (currentNode.type === 'end-success') {
        // End success node
        const nodeEndTime = new Date().toISOString();
        executionLog.nodeMetrics[currentNodeId] = {
          startTime: nodeStartTime,
          endTime: nodeEndTime,
          duration: (new Date(nodeEndTime).getTime() - new Date(nodeStartTime).getTime()) / 1000
        };
        
        // Emit nodeCompleted event
        wsBrowser.emitOrchestrationEvent(jobId, executionLog.executionId, 'orchestrationNodeCompleted', {
          nodeId: currentNodeId,
          nodeType: currentNode.type,
          status: 'success'
        });
        
        // Update cache with latest visited nodes
        if (onNodeComplete) {
          onNodeComplete(executionLog);
        }
        
        executionLog.finalStatus = 'success';
        executionLog.status = 'completed';
        logger.info(`Orchestration [${jobId}] completed successfully at node [${currentNodeId}]`);
        break;
      } else if (currentNode.type === 'end-failure') {
        // End failure node
        const nodeEndTime = new Date().toISOString();
        executionLog.nodeMetrics[currentNodeId] = {
          startTime: nodeStartTime,
          endTime: nodeEndTime,
          duration: (new Date(nodeEndTime).getTime() - new Date(nodeStartTime).getTime()) / 1000
        };
        
        // Emit nodeCompleted event  
        wsBrowser.emitOrchestrationEvent(jobId, executionLog.executionId, 'orchestrationNodeCompleted', {
          nodeId: currentNodeId,
          nodeType: currentNode.type,
          status: 'failure'
        });
        
        // Update cache with latest visited nodes
        if (onNodeComplete) {
          onNodeComplete(executionLog);
        }
        
        executionLog.finalStatus = 'failure';
        executionLog.status = 'completed';
        logger.info(`Orchestration [${jobId}] completed with failure at node [${currentNodeId}]`);
        break;
      } else {
        throw new Error(`Unknown node type: ${currentNode.type}`);
      }
    }

    if (iterations >= maxIterations) {
      throw new Error('Execution exceeded maximum iterations (infinite loop detected)');
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
    return executionLog;
  } finally {
    // Clean up execution tracking - but delay for 30 seconds to allow pending messages to be processed
    // Some agent messages may still be in the queue after orchestration completes
    setTimeout(() => {
      delete activeOrchestrationExecutions[jobId];
      logger.debug(`Cleared execution tracking for orchestration [${jobId}]`);
    }, 30000);
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
    
    // Log the execution for reference
    logger.info(`Saved orchestration execution [${jobId}] with status [${executionLog.finalStatus}]`);
  } catch (err) {
    logger.error(`Failed to save execution result: ${err.message}`);
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
    if (!executions) return -1;
    
    const index = executions.findIndex(exec => exec.executionId === executionId);
    return index;
  } catch (err) {
    logger.error(`Failed to find execution index: ${err.message}`);
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
  getExecutionIndexById
};
