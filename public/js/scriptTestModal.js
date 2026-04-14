(function() {
  function isLiveStatus(status) {
    return status === 'pending' || status === 'running' || status === 'terminating';
  }

  function getStatusDisplay(status, returnCode) {
    switch (status) {
      case 'pending':
        return { text: 'Starting', color: '#ef6c00' };
      case 'running':
        return { text: 'Running', color: '#ef6c00' };
      case 'terminating':
        return { text: 'Terminating', color: '#ef6c00' };
      case 'completed':
        return { text: 'Completed', color: '#2e7d32' };
      case 'failed':
        return { text: `Failed (${returnCode ?? 'unknown'})`, color: '#c62828' };
      case 'terminated':
        return { text: 'Terminated', color: '#6d4c41' };
      case 'discarded':
        return { text: 'Discarded', color: '#546e7a' };
      default:
        return { text: 'Ready', color: '#455a64' };
    }
  }

  function wasScrolledNearBottom(textarea) {
    return textarea.scrollTop + textarea.clientHeight >= textarea.scrollHeight - 10;
  }

  function normalizeParameterDocumentation(documentation) {
    let params = typeof documentation === 'string' ? documentation.trim() : '';

    if (!params) {
      return 'No documented parameters';
    }

    if (params.toLowerCase().indexOf('<br') === 0) {
      const pos = params.indexOf('>');
      if (pos !== -1) {
        params = params.substring(pos + 1).trim();
      }
    }

    return params || 'No documented parameters';
  }

  // Sanitize HTML to prevent XSS attacks
  // Only allows safe tags: <br>, <p>, <strong>, <em>, <code>, <ul>, <ol>, <li>
  function sanitizeHTML(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    const allowedTags = new Set(['BR', 'P', 'STRONG', 'EM', 'CODE', 'UL', 'OL', 'LI']);
    const container = document.createElement('div');
    container.innerHTML = html;

    // Find all elements and process them
    const allElements = container.querySelectorAll('*');
    
    // Process in reverse order to safely handle removals
    for (let i = allElements.length - 1; i >= 0; i--) {
      const element = allElements[i];
      const tagName = element.tagName;
      
      if (!allowedTags.has(tagName)) {
        // Remove non-whitelisted element but keep its content
        const parent = element.parentNode;
        while (element.firstChild) {
          parent.insertBefore(element.firstChild, element);
        }
        parent.removeChild(element);
      } else {
        // For whitelisted elements, remove all attributes (prevents event handlers)
        const attributesToRemove = Array.from(element.attributes).map(attr => attr.name);
        attributesToRemove.forEach(name => element.removeAttribute(name));
      }
    }

    return container.innerHTML;
  }

  const controller = {
    config: { agents: [] },
    modalInstance: null,
    currentRequest: null,
    currentExecution: null,
    boundListeners: [],

    init: function() {
      const modalElement = document.getElementById('scriptTestModal');
      if (!modalElement) {
        return;
      }

      try {
        const encodedAgents = modalElement.dataset.agentsBase64 || '';
        this.config = {
          agents: encodedAgents ? JSON.parse(atob(encodedAgents)) : [],
        };
      } catch (error) {
        this.config = { agents: [] };
      }

      this.modalInstance = M.Modal.init(modalElement, {
        dismissible: false,
      });

      document.getElementById('scriptTestRunButton').addEventListener('click', () => {
        this.startRequestedExecution();
      });
      document.getElementById('scriptTestTerminateButton').addEventListener('click', () => {
        this.terminateCurrentExecution();
      });
      document.getElementById('scriptTestCloseButton').addEventListener('click', () => {
        this.closeModal();
      });

      this.populateAgents();
      this.resetModalState();
    },

    populateAgents: function() {
      const select = document.getElementById('scriptTestAgentSelect');
      if (!select) {
        return;
      }

      const previousValue = select.value;
      select.innerHTML = '<option value="" disabled selected>Select a target agent...</option>';

      (this.config.agents || []).forEach((agent) => {
        const option = document.createElement('option');
        option.value = agent.name;
        const isAvailable = agent.status && agent.status !== 'offline';
        const statusIcon = isAvailable ? '✅' : '❌';
        option.textContent = `${statusIcon} ${agent.name}`;
        if (!isAvailable) {
          option.disabled = true;
        }
        if (previousValue && previousValue === agent.name) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      M.FormSelect.init(select);
    },

    open: function(request) {
      this.currentRequest = Object.assign({}, request || {});
      this.currentExecution = null;
      this.unsubscribeFromExecution();
      this.populateAgents();
      this.resetModalState();

      this.applyRequestMetadata();
      document.getElementById('scriptTestParamsInput').value = this.currentRequest.commandParams || '';
      document.getElementById('scriptTestStatusText').textContent = 'Loading';
      document.getElementById('scriptTestStatusText').style.color = '#455a64';
      M.updateTextFields();

      this.modalInstance.open();
      this.loadExistingState();
    },

    resetModalState: function() {
      this.resetExecutionState();
      document.getElementById('scriptTestDescriptionLabel').textContent = '';
      document.getElementById('scriptTestFileLabel').textContent = '-';
      document.getElementById('scriptTestSourceLabel').textContent = '-';
      document.getElementById('scriptTestParamsHelp').innerHTML = 'No documented parameters';
    },

    resetExecutionState: function() {
      const statusIcon = document.getElementById('scriptTestStatusIcon');
      document.getElementById('scriptTestExecutionId').textContent = '-';
      document.getElementById('scriptTestStatusText').textContent = 'Ready';
      document.getElementById('scriptTestStatusText').style.color = '#455a64';
      statusIcon.style.display = 'none';
      statusIcon.style.color = '';
      statusIcon.className = 'material-icons';
      statusIcon.textContent = 'pending';
      document.getElementById('scriptTestRetentionNotice').textContent = '';
      document.getElementById('scriptTestLogArea').value = '';
      document.getElementById('scriptTestRunButton').disabled = false;
      document.getElementById('scriptTestTerminateButton').disabled = true;
    },

    applyRequestMetadata: function() {
      const descriptionLabel = this.currentRequest ? (this.currentRequest.scriptDescription || '') : '';
      const parametersHelp = this.currentRequest ? (this.currentRequest.scriptParameters || '') : '';
      const fileLabel = this.currentRequest && this.currentRequest.scriptName
        ? this.currentRequest.scriptName
        : 'Unsaved editor buffer';
      const sourceLabel = this.currentRequest && this.currentRequest.sourceType === 'saved'
        ? 'Saved file'
        : 'Current editor contents';

      document.getElementById('scriptTestDescriptionLabel').textContent = descriptionLabel;
      document.getElementById('scriptTestFileLabel').textContent = fileLabel;
      document.getElementById('scriptTestSourceLabel').textContent = sourceLabel;
      // Sanitize HTML to prevent XSS injection from script metadata
      const sanitizedParams = sanitizeHTML(normalizeParameterDocumentation(parametersHelp));
      document.getElementById('scriptTestParamsHelp').innerHTML = sanitizedParams;
    },

    buildStartPayload: function() {
      const agentName = document.getElementById('scriptTestAgentSelect').value;
      return {
        agentName: agentName,
        scriptName: this.currentRequest ? (this.currentRequest.scriptName || null) : null,
        scriptDescription: this.currentRequest ? (this.currentRequest.scriptDescription || '') : '',
        sourceType: this.currentRequest ? (this.currentRequest.sourceType || 'editor') : 'editor',
        scriptContent: this.currentRequest ? (this.currentRequest.scriptContent || '') : '',
        commandParams: document.getElementById('scriptTestParamsInput').value || '',
      };
    },

    apiRequest: async function(url, options) {
      const response = await fetch(url, Object.assign({
        headers: {
          'Content-Type': 'application/json',
        },
      }, options || {}));

      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      return { response, payload };
    },

    startRequestedExecution: async function() {
      const payload = this.buildStartPayload();
      if (!payload.agentName) {
        M.toast({ html: 'Please select an agent', displayLength: 3000 });
        return;
      }

      const { response, payload: data } = await this.apiRequest('/rest/script-test/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (response.ok && data && data.execution) {
        this.loadExecution(data.execution, true, false);
        return;
      }

      if (response.status === 409 && data && data.execution) {
        this.loadExecution(data.execution, isLiveStatus(data.execution.status), !isLiveStatus(data.execution.status));
        return;
      }

      M.toast({ html: (data && data.error) || 'Unable to start script test', displayLength: 4000 });
    },

    loadExistingState: async function() {
      const payload = {
        scriptName: this.currentRequest ? (this.currentRequest.scriptName || null) : null,
        sourceType: this.currentRequest ? (this.currentRequest.sourceType || 'editor') : 'editor',
        scriptContent: this.currentRequest ? (this.currentRequest.scriptContent || '') : '',
      };

      const { response, payload: data } = await this.apiRequest('/rest/script-test/state', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.resetExecutionState();
        this.applyRequestMetadata();
        return;
      }

      if (data && data.state && data.state.execution) {
        const existingExecution = data.state.execution;
        this.loadExecution(
          existingExecution,
          isLiveStatus(existingExecution.status),
          !isLiveStatus(existingExecution.status)
        );
        return;
      }

      this.resetExecutionState();
      this.applyRequestMetadata();
    },

    loadExecution: function(execution, subscribeToStream, acknowledgeIfRetained) {
      this.currentExecution = Object.assign({}, execution);
      document.getElementById('scriptTestDescriptionLabel').textContent = execution.scriptDescription || '';
      document.getElementById('scriptTestFileLabel').textContent = execution.scriptName || 'Unsaved editor buffer';
      document.getElementById('scriptTestSourceLabel').textContent = execution.sourceType === 'saved'
        ? 'Saved file'
        : 'Current editor contents';
      document.getElementById('scriptTestParamsHelp').innerHTML = normalizeParameterDocumentation(
        execution.scriptParameters || (this.currentRequest ? this.currentRequest.scriptParameters || '' : '')
      );
      document.getElementById('scriptTestExecutionId').textContent = execution.executionId || '-';

      const select = document.getElementById('scriptTestAgentSelect');
      if (execution.agentName) {
        select.value = execution.agentName;
        M.FormSelect.init(select);
      }

      document.getElementById('scriptTestParamsInput').value = execution.commandParams || (this.currentRequest ? this.currentRequest.commandParams || '' : '');
      document.getElementById('scriptTestLogArea').value = execution.log || '';
      this.applyExecutionState(execution);

      if (subscribeToStream && execution.executionId && isLiveStatus(execution.status)) {
        this.subscribeToExecution(execution.executionId);
        this.refreshExecutionState(execution.executionId);
      } else {
        this.unsubscribeFromExecution();
      }

      if (acknowledgeIfRetained && execution.executionId && !isLiveStatus(execution.status) && !execution.acknowledgedAt) {
        this.acknowledgeExecution(execution.executionId);
      }

      M.updateTextFields();
    },

    applyExecutionState: function(execution) {
      const statusDisplay = getStatusDisplay(execution.status, execution.returnCode);
      const retentionNotice = execution.retainedUntil
        ? `Retained until ${execution.retainedUntil.replace('T', ' ').split('.')[0]}`
        : '';
      const statusIcon = document.getElementById('scriptTestStatusIcon');

      document.getElementById('scriptTestStatusText').textContent = statusDisplay.text;
      document.getElementById('scriptTestStatusText').style.color = statusDisplay.color;
      if (execution.status === 'running') {
        statusIcon.style.display = 'inline-block';
        statusIcon.style.color = '';
        statusIcon.className = 'blinking orange-text material-icons';
        statusIcon.textContent = 'pending';
        statusIcon.title = 'Running';
      } else if (execution.status === 'completed') {
        statusIcon.style.display = 'inline-block';
        statusIcon.style.color = statusDisplay.color;
        statusIcon.className = 'material-icons';
        statusIcon.textContent = 'check_circle';
        statusIcon.title = 'Success';
      } else if (execution.status === 'failed') {
        statusIcon.style.display = 'inline-block';
        statusIcon.style.color = '';
        statusIcon.className = 'red-text material-icons';
        statusIcon.textContent = 'flag_circle';
        statusIcon.title = `Failure${execution.returnCode !== null && execution.returnCode !== undefined ? ` (Return Code: ${execution.returnCode})` : ''}`;
      } else if (execution.status === 'terminated') {
        statusIcon.style.display = 'inline-block';
        statusIcon.style.color = '';
        statusIcon.className = 'red-text material-icons';
        statusIcon.textContent = 'close';
        statusIcon.title = 'Terminated';
      } else {
        statusIcon.style.display = 'none';
        statusIcon.style.color = '';
        statusIcon.className = 'material-icons';
        statusIcon.textContent = 'pending';
        statusIcon.title = '';
      }
      document.getElementById('scriptTestRetentionNotice').textContent = retentionNotice;
      document.getElementById('scriptTestRunButton').disabled = !!execution.executionId && isLiveStatus(execution.status);
      document.getElementById('scriptTestTerminateButton').disabled = !(execution.executionId && isLiveStatus(execution.status));
    },

    refreshExecutionState: async function(executionId) {
      if (!executionId) {
        return;
      }

      const { response, payload } = await this.apiRequest(`/rest/script-test/${encodeURIComponent(executionId)}`, {
        method: 'GET',
      });

      if (!response.ok || !payload || !payload.execution) {
        return;
      }

      if (!this.currentExecution || this.currentExecution.executionId !== executionId) {
        return;
      }

      this.currentExecution = Object.assign({}, this.currentExecution, payload.execution);
      document.getElementById('scriptTestLogArea').value = this.currentExecution.log || document.getElementById('scriptTestLogArea').value;
      this.applyExecutionState(this.currentExecution);
    },

    subscribeToExecution: function(executionId) {
      this.unsubscribeFromExecution();
      if (!window.socket || !executionId) {
        return;
      }

      // Join the room for this execution to receive scoped events
      const room = `scriptTest:${executionId}`;
      window.socket.emit('join-room', { room });

      const onLog = (data) => {
        if (!this.currentExecution || this.currentExecution.executionId !== executionId) {
          return;
        }
        const textarea = document.getElementById('scriptTestLogArea');
        const pinToBottom = wasScrolledNearBottom(textarea);
        
        // Append chunk instead of replacing full log to reduce memory/network overhead
        if (data.chunk) {
          textarea.value += data.chunk;
        }
        
        // Show warning if log was truncated on server
        if (data.isTruncated && !textarea.dataset.truncationWarningShown) {
          textarea.value += '\n\n[Log truncated - oldest entries removed to free memory]\n\n';
          textarea.dataset.truncationWarningShown = 'true';
        }
        
        if (pinToBottom) {
          textarea.scrollTop = textarea.scrollHeight;
        }
      };

      const onStatus = (data) => {
        if (!this.currentExecution || this.currentExecution.executionId !== executionId) {
          return;
        }
        this.currentExecution = Object.assign({}, this.currentExecution, data);
        this.applyExecutionState(this.currentExecution);
      };

      const onEnded = (data) => {
        if (!this.currentExecution || this.currentExecution.executionId !== executionId) {
          return;
        }
        this.currentExecution = Object.assign({}, this.currentExecution, data);
        document.getElementById('scriptTestLogArea').value = this.currentExecution.log || document.getElementById('scriptTestLogArea').value;
        this.applyExecutionState(this.currentExecution);
        this.unsubscribeFromExecution();
      };

      window.socket.on(`scriptTestLog:${executionId}`, onLog);
      window.socket.on(`scriptTestStatus:${executionId}`, onStatus);
      window.socket.on(`scriptTestEnded:${executionId}`, onEnded);
      this.boundListeners = [
        { event: `scriptTestLog:${executionId}`, handler: onLog },
        { event: `scriptTestStatus:${executionId}`, handler: onStatus },
        { event: `scriptTestEnded:${executionId}`, handler: onEnded },
      ];
    },

    unsubscribeFromExecution: function() {
      if (!window.socket) {
        this.boundListeners = [];
        return;
      }

      // Leave the room for the current execution
      if (this.currentExecution && this.currentExecution.executionId) {
        const room = `scriptTest:${this.currentExecution.executionId}`;
        window.socket.emit('leave-room', { room });
      }

      this.boundListeners.forEach((listener) => {
        window.socket.off(listener.event, listener.handler);
      });
      this.boundListeners = [];
    },

    acknowledgeExecution: async function(executionId) {
      await this.apiRequest(`/rest/script-test/${encodeURIComponent(executionId)}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },

    discardExecution: async function(executionId) {
      const { response, payload } = await this.apiRequest(`/rest/script-test/${encodeURIComponent(executionId)}/discard`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        M.toast({ html: (payload && payload.error) || 'Unable to discard retained result', displayLength: 4000 });
      }
    },

    terminateCurrentExecution: async function(skipConfirmation) {
      if (!this.currentExecution || !this.currentExecution.executionId) {
        return;
      }

      if (!skipConfirmation) {
        const shouldTerminate = window.confirm('Terminate the current test execution?');
        if (!shouldTerminate) {
          return;
        }
      }

      const { response, payload } = await this.apiRequest(`/rest/script-test/${encodeURIComponent(this.currentExecution.executionId)}/terminate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        M.toast({ html: (payload && payload.error) || 'Unable to terminate test execution', displayLength: 4000 });
        return;
      }

      if (payload && payload.execution) {
        this.currentExecution = payload.execution;
        this.applyExecutionState(this.currentExecution);
      }
    },

    closeModal: function() {
      if (this.currentExecution && isLiveStatus(this.currentExecution.status)) {
        const terminate = window.confirm('This test is still running. Press OK to terminate it now, or Cancel to keep it running and close the dialog.');
        if (terminate) {
          this.terminateCurrentExecution(true);
        }
      }

      this.unsubscribeFromExecution();
      this.modalInstance.close();
    },
  };

  document.addEventListener('DOMContentLoaded', function() {
    controller.init();
  });

  window.BackupHubScriptTest = controller;
})();