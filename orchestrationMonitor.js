/**
 * Orchestration Monitor Module
 * Handles retrieval and formatting of orchestration execution data for monitoring/detail views
 */

const dateTimeUtils = require('./utils/dateTimeUtils.js');

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

    // Format the response with graph info and node details
    const formattedNodes = formatNodeDetails(jobDef.nodes, execution);
    const formattedEdges = formatEdgeDetails(jobDef.edges, execution, execution.visitedNodes || []);

    return {
      jobId: jobDef.id,
      jobName: jobDef.name,
      description: jobDef.description || '',
      orchestrationVersion: jobDef.version || 1,
      execution: {
        startTime: execution.startTime,
        endTime: execution.endTime,
        status: execution.status,
        finalStatus: execution.finalStatus || 'unknown',
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
      executionIndex: executionIndex,
      totalExecutions: executions.length
    };
  } catch (err) {
    logger.error(`Error getting execution details for job [${jobId}]: ${err.message}`);
    throw err;
  }
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
function formatEdgeDetails(edges, execution, visitedNodes) {
  if (!edges) return [];
  
  return edges.map(edge => ({
    id: edge.id,
    from: edge.from,
    fromPort: edge.fromPort,
    to: edge.to,
    label: edge.label || edge.fromPort,
    color: edge.color,
    // Mark edge as executed if both source and target nodes were visited
    executed: visitedNodes.includes(edge.from) && visitedNodes.includes(edge.to)
  }));
}

/**
 * Format execution details for node display
 * Includes position, execution status, and error info
 * @private
 */
function formatNodeDetails(nodes, execution) {
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
    hasError: execution.errors && execution.errors.some(e => e.node === node.id),
    errorMessage: execution.errors && execution.errors.find(e => e.node === node.id)?.message || null,
    exitCode: execution.scriptOutputs ? (execution.scriptOutputs[node.id]?.exitCode ?? null) : null
  }));
}

/**
 * Get orchestration job definition at a specific version
 * @private
 */
async function getJobDefinitionVersion(jobId, version = 'current') {
  try {
    const jobs = await db.getData('ORCHESTRATION_JOBS');
    const job = jobs[jobId];
    
    if (!job) {
      return null;
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
    const jobs = await db.getData('ORCHESTRATION_JOBS');
    const executions = await db.getData('ORCHESTRATION_EXECUTIONS');
    
    const jobList = [];
    for (const [jobId, jobDef] of Object.entries(jobs || {})) {
      const jobExecutions = executions?.[jobId] || [];
      const latestExecution = jobExecutions[jobExecutions.length - 1];

      jobList.push({
        id: jobDef.id,
        name: jobDef.name,
        description: jobDef.description || '',
        lastExecuted: latestExecution?.startTime || null,
        lastStatus: latestExecution?.finalStatus || 'never_run',
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
    
    return jobList.sort((a, b) => b.lastExecuted - a.lastExecuted);
  } catch (err) {
    if (err.message?.includes('NotFoundError')) {
      return [];
    }
    logger.error(`Error listing orchestration jobs: ${err.message}`);
    throw err;
  }
}

module.exports = {
  getExecutionDetails,
  getNodeOutput,
  listJobsWithStatus,
  getJobDefinitionVersion,
  formatNodeDetails,
  formatEdgeDetails
};
