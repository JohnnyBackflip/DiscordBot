const CDP = require('chrome-remote-interface');
const { stmts } = require('../database/db');

/**
 * Manages connections to multiple Antigravity instances via CDP.
 */
class AntigravityManager {
  constructor() {
    /** @type {Map<string, {client: any, host: string, port: number}>} */
    this.connections = new Map();
  }

  /**
   * Connect to a registered Antigravity instance.
   */
  async connect(instanceName) {
    const instance = stmts.getInstance.get(instanceName);
    if (!instance) throw new Error(`Instance "${instanceName}" not found in database.`);

    try {
      const client = await CDP({ host: instance.host, port: instance.port });
      await client.Runtime.enable();
      await client.DOM.enable();

      this.connections.set(instanceName, {
        client,
        host: instance.host,
        port: instance.port,
      });

      console.log(`[CDP] Connected to instance "${instanceName}" at ${instance.host}:${instance.port}`);
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
   * Uses CDP Runtime.evaluate to interact with the Antigravity chat UI.
   */
  async sendMessage(instanceName, message, model = null) {
    const conn = await this.getConnection(instanceName);
    const { client } = conn;

    try {
      // Inject the message into the Antigravity chat input
      const injectResult = await client.Runtime.evaluate({
        expression: `
          (async () => {
            // Find the chat input textarea/contenteditable
            const chatInput = document.querySelector(
              'textarea[class*="chat"], ' +
              '[contenteditable="true"][class*="chat"], ' +
              'textarea[placeholder*="message"], ' +
              'textarea[placeholder*="Message"], ' +
              '.chat-input textarea, ' +
              '[data-testid="chat-input"]'
            );
            if (!chatInput) return JSON.stringify({ error: 'Chat input not found' });

            // Set the message
            const nativeInputSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype, 'value'
            )?.set || Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, 'value'
            )?.set;

            if (nativeInputSetter) {
              nativeInputSetter.call(chatInput, ${JSON.stringify(message)});
            } else {
              chatInput.value = ${JSON.stringify(message)};
            }

            chatInput.dispatchEvent(new Event('input', { bubbles: true }));

            // Small delay to let the UI process
            await new Promise(r => setTimeout(r, 200));

            // Find and click the send button
            const sendBtn = document.querySelector(
              'button[class*="send"], ' +
              'button[aria-label*="Send"], ' +
              'button[aria-label*="send"], ' +
              'button[data-testid="send-button"], ' +
              '.chat-send-button'
            );

            if (sendBtn) {
              sendBtn.click();
              return JSON.stringify({ success: true, method: 'button' });
            }

            // Fallback: simulate Enter key
            chatInput.dispatchEvent(new KeyboardEvent('keydown', {
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
   * Poll the DOM for a new AI response.
   */
  async _waitForResponse(client, timeoutMs = 120000, pollIntervalMs = 1000) {
    const startTime = Date.now();

    // Get the count of existing messages first
    const initialCount = await client.Runtime.evaluate({
      expression: `
        document.querySelectorAll(
          '[class*="message"][class*="assistant"], ' +
          '[class*="response"], ' +
          '[data-role="assistant"], ' +
          '.assistant-message'
        ).length
      `,
      returnByValue: true,
    });

    const initialMessageCount = initialCount.result.value || 0;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));

      const result = await client.Runtime.evaluate({
        expression: `
          (() => {
            const msgs = document.querySelectorAll(
              '[class*="message"][class*="assistant"], ' +
              '[class*="response"], ' +
              '[data-role="assistant"], ' +
              '.assistant-message'
            );
            if (msgs.length <= ${initialMessageCount}) return JSON.stringify({ done: false });

            const lastMsg = msgs[msgs.length - 1];
            const text = lastMsg.innerText || lastMsg.textContent || '';

            // Check if still streaming (look for typing indicators)
            const isStreaming = !!document.querySelector(
              '[class*="typing"], [class*="streaming"], [class*="loading"], .cursor-blink'
            );

            return JSON.stringify({ done: !isStreaming, text: text.trim() });
          })()
        `,
        returnByValue: true,
      });

      const data = JSON.parse(result.result.value || '{}');
      if (data.done && data.text) {
        return data.text;
      }
    }

    throw new Error('Timeout waiting for Antigravity response');
  }

  /**
   * List available models from an Antigravity instance (via DOM).
   */
  async listModels(instanceName) {
    const conn = await this.getConnection(instanceName);
    const { client } = conn;

    const result = await client.Runtime.evaluate({
      expression: `
        (() => {
          const modelSelectors = document.querySelectorAll(
            'select[class*="model"] option, ' +
            '[class*="model-select"] [role="option"], ' +
            '[data-testid="model-selector"] option'
          );
          const models = [];
          modelSelectors.forEach(el => {
            const val = el.value || el.getAttribute('data-value') || el.textContent;
            if (val) models.push(val.trim());
          });
          return JSON.stringify(models);
        })()
      `,
      returnByValue: true,
    });

    return JSON.parse(result.result.value || '[]');
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
