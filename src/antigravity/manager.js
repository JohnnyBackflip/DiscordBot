const CDP = require('chrome-remote-interface');
const http = require('http');
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
   * Fetch CDP targets via HTTP and find the workbench target.
   */
  _fetchTargets(host, port) {
    return new Promise((resolve, reject) => {
      http.get(`http://${host}:${port}/json`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse CDP targets'));
          }
        });
      }).on('error', (err) => {
        reject(new Error(`Cannot reach CDP at ${host}:${port}: ${err.message}`));
      });
    });
  }

  /**
   * Connect to a registered Antigravity instance.
   */
  async connect(instanceName) {
    const instance = stmts.getInstance.get(instanceName);
    if (!instance) throw new Error(`Instance "${instanceName}" not found in database.`);

    try {
      // Find the correct workbench target via HTTP
      const targets = await this._fetchTargets(instance.host, instance.port);
      const workbench = targets.find(t =>
        t.type === 'page' &&
        t.url?.includes('workbench.html') &&
        !t.url?.includes('jetski')
      ) || targets.find(t => t.type === 'page');

      if (!workbench) {
        throw new Error('No Antigravity workbench target found. Is a workspace open?');
      }

      // Connect using callback pattern wrapped in promise
      const client = await new Promise((resolve, reject) => {
        CDP({
          host: instance.host,
          port: instance.port,
          target: workbench.id,
        }, (cdpClient) => {
          resolve(cdpClient);
        }).on('error', (err) => {
          reject(err);
        });
      });

      await client.Runtime.enable();

      this.connections.set(instanceName, {
        client,
        host: instance.host,
        port: instance.port,
      });

      console.log(`[CDP] Connected to "${instanceName}" at ${instance.host}:${instance.port} (${workbench.title})`);
      return true;
    } catch (err) {
      console.error(`[CDP] Failed to connect to "${instanceName}":`, err.message);
      throw new Error(`Could not connect to Antigravity instance "${instanceName}" at ${instance.host}:${instance.port}. ${err.message}`);
    }
  }

  /**
   * Disconnect from an instance.
   */
  async disconnect(instanceName) {
    const conn = this.connections.get(instanceName);
    if (conn) {
      try { await conn.client.close(); } catch (_) {}
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
   * Helper to evaluate JS in the Antigravity window and return the result as a string.
   */
  async _evaluate(client, expression) {
    const result = await client.Runtime.evaluate({
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'JS evaluation error');
    }

    return result.result.value;
  }

  /**
   * Send a message to an Antigravity instance and wait for the response.
   */
  async sendMessage(instanceName, message, model = null) {
    const conn = await this.getConnection(instanceName);
    const { client } = conn;

    try {
      // Inject the message into the Antigravity Agent chat input
      const escapedMessage = JSON.stringify(message);

      const injectResult = await this._evaluate(client, `
        (async () => {
          const inputBox = document.getElementById('antigravity.agentSidePanelInputBox');
          if (!inputBox) return 'ERROR:Agent panel input box not found. Is the Agent panel open? (Ctrl+Alt+B)';

          const textbox = inputBox.querySelector('[role="textbox"]');
          if (!textbox) return 'ERROR:Chat textbox not found inside agent panel.';

          // Focus and clear
          textbox.focus();
          textbox.innerHTML = '';

          // Set the message
          textbox.textContent = ${escapedMessage};

          // Trigger input events
          textbox.dispatchEvent(new Event('input', { bubbles: true }));
          textbox.dispatchEvent(new Event('change', { bubbles: true }));

          await new Promise(r => setTimeout(r, 300));

          // Try to find and click the send button
          const btns = inputBox.querySelectorAll('button');
          let sendBtn = null;
          for (const btn of btns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('send') || label.includes('submit')) {
              sendBtn = btn;
              break;
            }
          }

          // Fallback: look for a button with a send icon (typically the last button)
          if (!sendBtn && btns.length > 0) {
            sendBtn = btns[btns.length - 1];
          }

          if (sendBtn) {
            sendBtn.click();
            return 'OK:button';
          }

          // Fallback: Enter key
          textbox.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true
          }));
          return 'OK:enter';
        })()
      `);

      if (typeof injectResult === 'string' && injectResult.startsWith('ERROR:')) {
        throw new Error(injectResult.substring(6));
      }

      console.log(`[CDP] Message sent to "${instanceName}" via ${injectResult}`);

      // Wait for the response
      const response = await this._waitForResponse(client);
      return response;

    } catch (err) {
      if (err.message?.includes('not connected') || err.message?.includes('ECONNREFUSED')) {
        this.connections.delete(instanceName);
      }
      throw err;
    }
  }

  /**
   * Poll the DOM for a new AI response.
   */
  async _waitForResponse(client, timeoutMs = 120000, pollIntervalMs = 2000) {
    const startTime = Date.now();

    // Count existing messages
    const initialMessageCount = await this._evaluate(client, `
      (() => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return 0;
        return panel.querySelectorAll('[class*="prose"], [class*="markdown"], [class*="message"]').length;
      })()
    `) || 0;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));

      const result = await this._evaluate(client, `
        (() => {
          const panel = document.querySelector('.antigravity-agent-side-panel');
          if (!panel) return 'WAITING:panel not found';

          const msgs = panel.querySelectorAll('[class*="prose"], [class*="markdown"], [class*="message"]');
          if (msgs.length <= ${initialMessageCount}) return 'WAITING:no new message';

          const lastMsg = msgs[msgs.length - 1];
          const text = (lastMsg.innerText || lastMsg.textContent || '').trim();
          if (!text) return 'WAITING:empty message';

          // Check if still generating
          const isStreaming = !!panel.querySelector(
            '[class*="typing"], [class*="streaming"], [class*="loading"], ' +
            '[class*="spinner"], [class*="generating"], [class*="cursor-blink"]'
          );

          if (isStreaming) return 'WAITING:still streaming';
          return 'DONE:' + text;
        })()
      `);

      if (typeof result === 'string') {
        if (result.startsWith('DONE:')) {
          return result.substring(5);
        }
        console.log(`[CDP] Waiting... ${result}`);
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
