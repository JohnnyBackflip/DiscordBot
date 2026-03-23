const raw = \`Thought for 2s

I'm now prioritizing the most useful tools for this task. The focus is on selecting the correct tool for the job to improve efficiency. I am thinking through the best ways to integrate different tools as required. My current approach involves a step-by-step assessment of which tool is most appropriate given a specific action is needed.

Refining Tool Selection

I'm now refining my tool selection process based on the recently received rules. I'm focusing on avoiding cat, grep, ls, and sed when there are better options. I will proactively list and consider all potentially useful tools before making a tool call and ensure this will be a more efficient workflow. I am working on complying with the critical instruction to think and list tools first. I am trying to improve my workflow so I do not need to call the task boundary tool. I will work in conjunction to meet with those requirements as well.

Hallo! Hier bin ich, wie kann ich dir helfen?\`;

function cleanResponse(text) {
  let cleaned = text;

  // Thought titles common to this persona
  const titles = [
    'Considering', 'Prioritizing', 'Evaluating', 'Analyzing', 'Assessing', 
    'Thinking', 'Planning', 'Reviewing', 'Processing', 'Generating', 'Refining',
    'Addressing Task Boundary Issue' // from previous test
  ].join('|');
  
  cleaned = cleaned.replace(new RegExp(\`^((?:\${titles})[\\\\w\\\\s.]*?)(?=\\\\n\\\\n|$)\`, 'gim'), '');

  // Aggressive removal of intro-paragraphs
  const intros = [
    "I'?m\\\\s+(?:now|currently)",
    "The focus is",
    "I am thinking",
    "My current approach",
    "I'?m focusing",
    "I will(?: proactively)? list",
    "I am working on",
    "I am trying to",
    "I will work in conjunction",
    "Understanding the",
    "I'm exploring",
    "I am assessing",
    "I am evaluating"
  ].join('|');

  // We want to match whole paragraphs where the first sentence starts with an intro,
  // OR where ANY sentence inside the paragraph starts with one of the intros to be safe?
  // Actually, usually the paragraph STARTS with one of them.
  cleaned = cleaned.replace(new RegExp(\`^((?:\${intros})[\\\\s\\\\S]*?)(?=\\\\n\\\\n|$)\`, 'gim'), '');

  cleaned = cleaned.replace(/\\n{3,}/g, '\\n\\n').trim();
  return cleaned;
}

console.log('\\n=== CLEANED ===\\n');
console.log(cleanResponse(raw));
console.log('\\n===============\\n');
