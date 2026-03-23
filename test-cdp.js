// Advanced test script
const http = require('http');
const CDP = require('chrome-remote-interface');
const manager = require('./src/antigravity/manager');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('Sending message via Manager...');
  
  // We can just use the manager.sendMessage function directly!
  // It handles all the connection, injection, extraction, and cleaning.
  
  const instanceName = 'lunar-slayer'; // Or we just don't pass name if manager connection finds it
  
  // Wait, manager expects instance name that is configured. We can just mock the config?
  // Let's just use the CDP directly, but copy the _cleanResponse method to test it.

  const data = await new Promise((res, rej) => {
    http.get('http://localhost:8765/json', r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
    }).on('error', rej);
  });

  const targets = JSON.parse(data);
  const wb = targets.find(t => t.type === 'page' && !t.title.includes('Launchpad'));
  console.log('Target:', wb.title);

  const client = await new Promise((res, rej) => {
    CDP({ host: 'localhost', port: 8765, target: wb.id }, c => res(c)).on('error', rej);
  });
  await client.Runtime.enable();

  const ev = async (expr) => {
    const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  const userMessage = "hi mach ein list_dir";

  const initLen = parseInt(await ev('(() => { const p = document.querySelector(".antigravity-agent-side-panel"); const sc = p && p.querySelector(".h-full.overflow-y-auto"); return sc ? (sc.innerText||"").length+"" : "0"; })()'));
  console.log('Initial text length:', initLen);

  const escaped = JSON.stringify(userMessage);
  await ev('(() => { const ib = document.getElementById("antigravity.agentSidePanelInputBox"); const tb = ib.querySelector("[role=textbox]"); tb.focus(); const s = window.getSelection(); const r = document.createRange(); r.selectNodeContents(tb); s.removeAllRanges(); s.addRange(r); document.execCommand("delete",false); document.execCommand("insertText",false,'+escaped+'); return "OK"; })()');
  
  await sleep(500);

  await ev('(() => { const ib = document.getElementById("antigravity.agentSidePanelInputBox"); const tb = ib.querySelector("[role=textbox]"); const e = new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true,cancelable:true}); !tb.dispatchEvent(e); return "OK"; })()');

  let stableCount = 0;
  let lastLen = '';
  let finalRawText = '';
  
  for (let i = 0; i < 45; i++) {
    await sleep(2000);

    const poll = await ev('(() => { const p = document.querySelector(".antigravity-agent-side-panel"); const sc = p && p.querySelector(".h-full.overflow-y-auto"); if(!sc) return "NO_SC"; const ft = sc.innerText||""; if(ft.length <= ' + initLen + ') return "WAIT:"+ft.length; const nt = ft.substring(' + initLen + ').trim(); const streaming = !!p.querySelector("[class*=typing],[class*=streaming],[class*=spinner],[class*=generating],[class*=animate-pulse],[class*=animate-spin]"); return (streaming?"STREAM:":"DONE:")+nt; })()');

    const prefix = poll.substring(0, 7);
    const content = poll.substring(poll.indexOf(':') + 1);

    if (prefix.startsWith('DONE') || prefix.startsWith('STREAM')) {
      const curLen = content.length + '';
      if (curLen === lastLen && content.length > 5) { // Ensure it's not empty string matching
        stableCount++;
        const needed = prefix.startsWith('STREAM') ? 3 : 2;
        if (stableCount >= needed) {
          finalRawText = content;
          console.log('\\n=== RAW RESPONSE SECURED ===');
          break;
        }
      } else {
        stableCount = 0;
        lastLen = curLen;
      }
    } else {
      stableCount = 0;
    }
  }

  await client.close();

  // Now test the cleanResponse method on the finalRawText exactly as manager does
  function _cleanResponse(text, userMessageStr = null) {
    let cleaned = text;
    cleaned = cleaned.replace(/^Copy\\s*$/gim, '');
    cleaned = cleaned.replace(/^(Considering|Prioritizing|Evaluating|Analyzing|Assessing|Thinking|Planning|Reviewing|Processing|Generating)([\\w\\s.]*)$/gim, '');
    cleaned = cleaned.replace(/^I'?m\\s+(now|currently)\\s+[\\s\\S]{0,300}?$/gim, '');
    cleaned = cleaned.replace(/^(The focus is|I am thinkin|It's becoming|Understanding the|I'm focusing|I'm exploring)[\\s\\S]{0,300}?$/gim, '');
    cleaned = cleaned.replace(/I'm now prioritizing the most useful tools available to complete the next steps\\. I am assessing which tools will provide the most efficient path forward\\. I'm focusing on their respective strengths to solve the particular requirements\\./gi, '');
    cleaned = cleaned.replace(/^Thinking\\.{0,3}\\s*$/gim, '');
    cleaned = cleaned.replace(/^Ran\\s+(background\\s+)?command\\s*$/gim, '');
    if (userMessageStr && typeof userMessageStr === 'string') {
      const escapedMsg = userMessageStr.replace(/[.*+?^$\\b{}()|[\\]\\\\]/g, '\\\\$&');
      const prefixRegex = new RegExp(`^[\\\\s\\\\S]{0,100}?${escapedMsg}\\\\s*`, 'i');
      cleaned = cleaned.replace(prefixRegex, '');
    }
    cleaned = cleaned.replace(/^Copy\\s*$/gim, '');
    cleaned = cleaned.replace(/\\n{3,}/g, '\\n\\n');
    cleaned = cleaned.trim();
    return cleaned || '*(Leere Antwort)*';
  }

  const cleaned = _cleanResponse(finalRawText, userMessage);
  
  console.log('\\n--- RAW ---');
  console.log(finalRawText);
  console.log('\\n--- CLEANED ---');
  console.log(cleaned);
  console.log('\\n--- DONE ---');

  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
