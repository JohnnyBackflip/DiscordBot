const raw = "e/Lunar-Slayer\nThought for 1s\n\nPrioritizing Tool Usage\n\nI'm now prioritizing the most useful tools available to complete the next steps. I am assessing which tools will provide the most efficient path forward. I'm focusing on their respective strengths to solve the particular requirements.\n\nHier ist der Inhalt deines aktuellen Projektverzeichnisses:\n\nOrdner:\n.git\n\nCopy";

let text = raw;

console.log('1. Copy test');
text = text.replace(/^\s*Copy\s*$/gim, '');
console.log(text.includes('Copy') ? 'Failed' : 'Passed');

console.log('\n2. Prioritizing title test');
text = text.replace(/^(Considering|Prioritizing|Evaluating|Analyzing|Assessing|Thinking|Planning|Reviewing|Processing|Generating)[\s\S]*?(?=\n\n)/gim, '');
console.log(text.includes('Prioritizing Tool Usage') ? 'Failed' : 'Passed');

console.log('\n3. I am now... test');
text = text.replace(/^I'?m\s+(now|currently)\s+[\s\S]{0,300}?$/gim, '');
text = text.replace(/I'm now prioritizing the most useful tools available to complete the next steps\. I am assessing which tools will provide the most efficient path forward\. I'm focusing on their respective strengths to solve the particular requirements\./gi, '');
console.log(text.includes("I'm now prioritizing") ? 'Failed' : 'Passed');

console.log('\nFINAL:');
console.log(JSON.stringify(text));
