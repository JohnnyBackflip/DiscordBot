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
   * @param {string} instanceName
   * @param {string} message
   * @param {string|null} model
   * @param {function} onProgress - Callback: (status, charCount, elapsedSec) => void
   */
  async sendMessage(instanceName, message, model = null, onProgress = null) {
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

          // Focus the textbox
          textbox.focus();

          // Clear existing content using Selection API (avoids Trusted Types)
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(textbox);
          selection.removeAllRanges();
          selection.addRange(range);
          document.execCommand('delete', false);

          // Insert text using execCommand - this triggers React state updates
          document.execCommand('insertText', false, ${escapedMessage});

          // Verify text was actually inserted
          await new Promise(r => setTimeout(r, 200));
          const currentText = textbox.textContent || textbox.innerText || '';
          if (currentText.trim().length === 0) {
            return 'ERROR:Text insertion failed - textbox is still empty after execCommand';
          }

          await new Promise(r => setTimeout(r, 300));

          // Submit via Enter key (most reliable for chat inputs)
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          });
          const wasHandled = !textbox.dispatchEvent(enterEvent);

          if (wasHandled) {
            return 'OK:enter (preventDefault called)';
          }

          // If Enter wasn't handled, try clicking a send button
          const btns = inputBox.querySelectorAll('button');
          let sendBtn = null;
          for (const btn of btns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            if (label.includes('send') || label.includes('submit') || title.includes('send')) {
              sendBtn = btn;
              break;
            }
          }
          if (!sendBtn && btns.length > 0) {
            sendBtn = btns[btns.length - 1];
          }
          if (sendBtn) {
            sendBtn.click();
            return 'OK:button';
          }

          return 'OK:enter (no handler)';
        })()
      `);

      if (typeof injectResult === 'string' && injectResult.startsWith('ERROR:')) {
        throw new Error(injectResult.substring(6));
      }

      console.log(`[CDP] Message sent to "${instanceName}" via ${injectResult}`);

      // Wait for the response (10 min timeout)
      const response = await this._waitForResponse(client, 600000, 2000, onProgress);
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
   * Snapshots the initial conversation text and returns only the NEW content (delta).
   * Filters out thinking/reasoning blocks.
   */
  async _waitForResponse(client, timeoutMs = 600000, pollIntervalMs = 2000, onProgress = null) {
    const startTime = Date.now();

    // Snapshot the initial FULL text of the conversation container
    const initialSnapshot = await this._evaluate(client, `
      (() => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return '';
        const scrollContainer = panel.querySelector('.h-full.overflow-y-auto');
        if (!scrollContainer) return '';
        return (scrollContainer.innerText || scrollContainer.textContent || '');
      })()
    `) || '';

    const initLen = (initialSnapshot + '').length;
    console.log('[CDP] Initial snapshot: ' + initLen + ' chars');

    let lastLogTime = 0;
    let stableCount = 0;
    let lastResponseText = '';

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));

      const result = await this._evaluate(client, `
        (() => {
          const panel = document.querySelector('.antigravity-agent-side-panel');
          if (!panel) return 'WAITING:panel not found';

          const scrollContainer = panel.querySelector('.h-full.overflow-y-auto');
          if (!scrollContainer) return 'WAITING:scroll container not found';

          const fullText = scrollContainer.innerText || scrollContainer.textContent || '';
          const currentLen = fullText.length;

          // No new content yet
          if (currentLen <= ${initLen}) {
            return 'WAITING:no new content (' + currentLen + ' chars)';
          }

          // Extract only the NEW text (delta from initial snapshot)
          const newText = fullText.substring(${initLen}).trim();
          if (!newText) return 'WAITING:empty delta';

          // Check if still generating (be conservative with selectors)
          const isStreaming = !!panel.querySelector(
            '[class*="typing"], [class*="streaming"], ' +
            '[class*="spinner"], [class*="generating"], ' +
            '[class*="animate-pulse"], [class*="animate-spin"]'
          );

          if (isStreaming) return 'STREAMING:' + newText.length + ' chars';
          return 'DONE:' + newText;
        })()
      `);

      if (typeof result === 'string') {
        if (result.startsWith('DONE:') || result.startsWith('STREAMING:')) {
          // For DONE, extract text directly; for STREAMING, check if text is stable
          let rawText;
          if (result.startsWith('DONE:')) {
            rawText = result.substring(5);
          } else {
            // Extract the char count from streaming, but we need the actual text
            // Re-use lastResponseText for streaming stability tracking
            rawText = null;
          }

          if (result.startsWith('STREAMING:')) {
            // Track streaming stability by char count
            const charCount = result.substring(10);
            if (charCount === lastResponseText) {
              stableCount++;
              // If streaming text hasn't changed for 3 polls, it's done
              if (stableCount >= 3) {
                // Fetch the actual text one more time
                const finalText = await this._evaluate(client, `
                  (() => {
                    const panel = document.querySelector('.antigravity-agent-side-panel');
                    const sc = panel?.querySelector('.h-full.overflow-y-auto');
                    if (!sc) return '';
                    const fullText = sc.innerText || sc.textContent || '';
                    return fullText.substring(${initLen}).trim();
                  })()
                `);
                return this._cleanResponse(finalText || '');
              }
            } else {
              stableCount = 0;
              lastResponseText = charCount;
            }
          } else {
            // DONE result
            if (rawText === lastResponseText) {
              stableCount++;
              if (stableCount >= 2) {
                return this._cleanResponse(rawText);
              }
            } else {
              stableCount = 0;
              lastResponseText = rawText;
            }
          }
        }

        // Report progress and rate-limit logs
        const now = Date.now();
        const elapsedSec = Math.round((now - startTime) / 1000);

        if (now - lastLogTime > 5000) {
          console.log('[CDP] ' + result.substring(0, 100));
          lastLogTime = now;

          // Notify progress callback
          if (onProgress) {
            try {
              if (result.startsWith('STREAMING:')) {
                const chars = parseInt(result.substring(10)) || 0;
                onProgress('streaming', chars, elapsedSec);
              } else if (result.startsWith('WAITING:')) {
                onProgress('waiting', 0, elapsedSec);
              } else if (result.startsWith('DONE:')) {
                onProgress('finishing', result.length - 5, elapsedSec);
              }
            } catch (_) {}
          }
        }
      }
    }

    throw new Error('Timeout waiting for Antigravity response (10 Minuten)');
  }

  /**
   * Clean up an AI response by removing thinking blocks and artifacts.
   */
  _cleanResponse(text) {
    let cleaned = text;

    // Remove "Thought for Xs" lines
    cleaned = cleaned.replace(/Thought for\s*<?[\d]+s?\s*>?\s*/gi, '');

    // Remove thinking block titles (common patterns)
    const thinkingPatterns = [
      /^(Considering|Prioritizing|Evaluating|Analyzing|Assessing|Thinking|Planning|Reviewing|Processing)[\w\s]*$/gim,
    ];
    for (const pattern of thinkingPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Remove "Thinking..." standalone lines
    cleaned = cleaned.replace(/^Thinking\.{0,3}\s*$/gim, '');

    // Remove duplicate blank lines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Trim
    cleaned = cleaned.trim();

    return cleaned || '*(Leere Antwort)*';
  }

  /**
   * Debug: dump the DOM structure of the agent panel (focused on messages).
   */
  async dumpPanelDOM(instanceName) {
    const conn = await this.getConnection(instanceName);
    const { client } = conn;

    return await this._evaluate(client, `
      (() => {
        const panel = document.querySelector('.antigravity-agent-side-panel');
        if (!panel) return 'NO PANEL FOUND';

        const sc = panel.querySelector('.h-full.overflow-y-auto');
        if (!sc) return 'NO SCROLL CONTAINER';

        const container = sc.querySelector('.mx-auto.w-full') || sc;
        const children = container.children;
        const lines = ['Container: ' + children.length + ' children, ' + container.textContent.length + ' chars'];

        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const cls = (child.className || '').toString().substring(0, 100);
          const txt = (child.textContent || '').substring(0, 80).replace(/\\n/g, ' ');
          lines.push('Child ' + i + ': .' + cls + ' | "' + txt + '..."');
        }

        return lines.join('\\n');
      })()
    `);
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
