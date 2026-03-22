const CDP = require('chrome-remote-interface');
const { stmts } = require('../database/db');

/**
 * Manages connections to multiple Antigravity instances via CDP.
 */
class AntigravityManager {
  constructor() {
    /** @type {Map<string, {client: any, host: string, port: number, targetId: string}>} */
    this.connections = new Map();
  }

  /**
   * Find the correct workbench target from available CDP targets.
   */
  async _findWorkbenchTarget(host, port) {
    const targets = await CDP.List({ host, port });
    // Look for the main workbench page (not the Launchpad or workers)
    const workbench = targets.find(t =>
      t.type === 'page' &&
      t.url?.includes('workbench.html') &&
      !t.url?.includes('workbench-jetski')
    );
    if (workbench) return workbench.id;

    // Fallback: first page target that isn't a worker
    const firstPage = targets.find(t => t.type === 'page');
    if (firstPage) return firstPage.id;

    throw new Error('No suitable Antigravity workbench target found. Is a workspace open?');
  }

  /**
   * Connect to a registered Antigravity instance.
   */
  async connect(instanceName) {
    const instance = stmts.getInstance.get(instanceName);
    if (!instance) throw new Error(`Instance "${instanceName}" not found in database.`);

    try {
      // Find the correct target (workbench, not launchpad)
      const targetId = await this._findWorkbenchTarget(instance.host, instance.port);

      const client = await CDP({ host: instance.host, port: instance.port, target: targetId });
      await client.Runtime.enable();
      await client.DOM.enable();

      this.connections.set(instanceName, {
        client,
        host: instance.host,
        port: instance.port,
        targetId,
      });

      console.log(`[CDP] Connected to instance "${instanceName}" at ${instance.host}:${instance.port} (target: ${targetId})`);
      return true;
    } catch (err) {
      console.error(`[CDP] Failed to connect to "${instanceName}":`, err.message);
      throw new Error(`Could not connect to Antigravity instance "${instanceName}" at ${instance.host}:${instance.port}. Is it running with --remote-debugging-port=${instance.port}?`);
    }
  }

  /**
   * Disconnect from an instance.
   */
  async disconnect(instanceName) {
    const conn = this.connections.get(instanceName);
    if (conn) {
      try {
        await conn.client.close();
      } catch (_) { /* ignore */ }
      this.connections.delete(instanceName);
      console.log(`[CDP] Disconnected from "${instanceName}"`);
    }
  }

  /**
   * Disconnect from all instances.
   */
  async disconnectAll() {
    for (const name of this.connections.keys()) {
      await this.disconnect(name);
    }
  }

  /**
   * Check if an instance is connected.
   */
  isConnected(instanceName) {
    return this.connections.has(instanceName);
  }

  /**
   * Get connection for an instance (connects if not already connected).
   */
  async getConnection(instanceName) {
    if (!this.isConnected(instanceName)) {
      await this.connect(instanceName);
    }
    return this.connections.get(instanceName);
  }

  /**
   * Send a message to an Antigravity instance and wait for the response.
   * Uses CDP Runtime.evaluate to interact with the Antigravity Agent chat UI.
   */
  async sendMessage(instanceName, message, model = null) {
    const conn = await this.getConnection(instanceName);
    const { client } = conn;

    try {
      // Inject the message into the Antigravity Agent chat input
      // The chat input is a contenteditable div[role="textbox"] inside #antigravity\\.agentSidePanelInputBox
      const injectResult = await client.Runtime.evaluate({
        expression: `
          (async () => {
            // Find the chat input: contenteditable div with role="textbox" inside the agent panel
            const inputBox = document.getElementById('antigravity.agentSidePanelInputBox');
            if (!inputBox) return JSON.stringify({ error: 'Agent panel input box not found. Is the Agent panel open? (Ctrl+Alt+B)' });

            const textbox = inputBox.querySelector('[role="textbox"]');
            if (!textbox) return JSON.stringify({ error: 'Chat textbox not found inside agent panel.' });

            // Focus the textbox
            textbox.focus();

            // Clear existing content
            textbox.innerHTML = '';

            // Set the message text
            textbox.textContent = ${JSON.stringify(message)};

            // Dispatch input event to trigger React/state updates
            textbox.dispatchEvent(new Event('input', { bubbles: true }));
            textbox.dispatchEvent(new Event('change', { bubbles: true }));

            // Small delay to let the UI process
            await new Promise(r => setTimeout(r, 300));

            // Find the send button inside the agent panel input area
            const sendBtn = inputBox.querySelector('button[aria-label*="Send" i], button[aria-label*="send" i]')
              || inputBox.querySelector('button:last-of-type')
              || inputBox.parentElement?.querySelector('button[aria-label*="Send" i], button[aria-label*="send" i]');

            if (sendBtn) {
              sendBtn.click();
              return JSON.stringify({ success: true, method: 'button' });
            }

            // Fallback: simulate Enter key on the textbox
            textbox.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true
            }));
            textbox.dispatchEvent(new KeyboardEvent('keyup', {
              key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
            }));
            return JSON.stringify({ success: true, method: 'enter' });
          })()
        `,
        awaitPromise: true,
        returnByValue: true,
      });

      const injectData = JSON.parse(injectResult.result.value || '{}');
      if (injectData.error) {
        throw new Error(injectData.error);
      }

      // Wait for and capture the response
      const response = await this._waitForResponse(client);
      return response;

    } catch (err) {
      // If connection was lost, remove from pool
      if (err.message?.includes('not connected') || err.message?.includes('ECONNREFUSED')) {
        this.connections.delete(instanceName);
      }
      throw err;
    }
  }

  /**
   * Poll the DOM for a new AI response in the Antigravity agent panel.
   */
  async _waitForResponse(client, timeoutMs = 120000, pollIntervalMs = 2000) {
    const startTime = Date.now();

    // Get the count of existing response messages first
    const initialCount = await client.Runtime.evaluate({
      expression: `
        (() => {
          const panel = document.querySelector('.antigravity-agent-side-panel');
          if (!panel) return 0;
          // Count all assistant/response message blocks
          const msgs = panel.querySelectorAll(
            '[class*="assistant"], [class*="response"], [class*="message-block"], ' +
            '[data-role="assistant"], [class*="agent-message"]'
          );
          return msgs.length;
        })()
      `,
      returnByValue: true,
    });

    const initialMessageCount = initialCount.result.value || 0;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));

      const result = await client.Runtime.evaluate({
        expression: `
          (() => {
            const panel = document.querySelector('.antigravity-agent-side-panel');
            if (!panel) return JSON.stringify({ done: false, reason: 'panel not found' });

            // Find all message blocks in the conversation
            const msgs = panel.querySelectorAll(
              '[class*="assistant"], [class*="response"], [class*="message-block"], ' +
              '[data-role="assistant"], [class*="agent-message"]'
            );

            if (msgs.length <= ${initialMessageCount}) {
              // Try alternative: just grab all prose/markdown rendered content
              const proseBlocks = panel.querySelectorAll('[class*="prose"], [class*="markdown"], [class*="rendered"]');
              if (proseBlocks.length <= ${initialMessageCount}) {
                return JSON.stringify({ done: false, reason: 'no new messages yet' });
              }
              const lastBlock = proseBlocks[proseBlocks.length - 1];
              const text = lastBlock.innerText || lastBlock.textContent || '';

              // Check if still streaming
              const isStreaming = !!panel.querySelector(
                '[class*="typing"], [class*="streaming"], [class*="loading"], ' +
                '[class*="cursor"], [class*="spinner"], [class*="generating"]'
              );

              return JSON.stringify({ done: !isStreaming && text.length > 0, text: text.trim() });
            }

            const lastMsg = msgs[msgs.length - 1];
            const text = lastMsg.innerText || lastMsg.textContent || '';

            // Check if still streaming
            const isStreaming = !!panel.querySelector(
              '[class*="typing"], [class*="streaming"], [class*="loading"], ' +
              '[class*="cursor"], [class*="spinner"], [class*="generating"]'
            );

            return JSON.stringify({ done: !isStreaming && text.length > 0, text: text.trim() });
          })()
        `,
        returnByValue: true,
      });

      const data = JSON.parse(result.result.value || '{}');
      if (data.done && data.text) {
        return data.text;
      }
    }

    throw new Error('Timeout waiting for Antigravity response (120s)');
  }

  /**
   * Get connection status for all registered instances.
   */
  getStatus() {
    const instances = stmts.listInstances.all();
    return instances.map(inst => ({
      name: inst.name,
      host: inst.host,
      port: inst.port,
      connected: this.isConnected(inst.name),
      active: !!inst.active,
      description: inst.description,
    }));
  }
}

module.exports = new AntigravityManager();
