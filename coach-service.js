// Scripted local demo only. A production AI adapter must call a server endpoint,
// where credentials, validation, retention controls, and rate limits can live.
function resolveApiBase() {
  if (typeof window !== 'undefined' && typeof window.DAYLIGHT_API_BASE === 'string' && window.DAYLIGHT_API_BASE.trim()) {
    const base = window.DAYLIGHT_API_BASE.trim().replace(/\/+$/, '');
    if (base) return base;
  }
  return '/api';
}

function createDaylightCoachService({ delayMs = 380, fetchImpl = (...args) => fetch(...args), apiBase = resolveApiBase() } = {}) {
  let mode = 'preview';
  let liveConsent = false;
  let liveAvailable = false;
  async function checkStatus() {
    try {
      const response = await fetchImpl(`${apiBase}/health`, { headers: { accept: 'application/json' } });
      const result = await response.json();
      liveAvailable = response.ok && result.mode === 'live';
      mode = liveAvailable ? 'live-available' : 'preview';
    } catch { liveAvailable = false; mode = 'preview'; }
    return { mode };
  }
  function categorize(text) {
    const s = String(text).toLowerCase();
    if (/overwhelm|too much|everything|behind|stressed|a lot|too many/.test(s)) return 'overwhelmed';
    if (/distract|focus|phone|noise|keep checking|can't concentrate|cannot concentrate/.test(s)) return 'distracted';
    if (/interrupt|come back|coming back|resume|lost my place|where i left|return/.test(s)) return 'returning';
    if (/which|prioriti|first|due soon|choose what|pick what/.test(s)) return 'prioritizing';
    if (/start|procrast|putting it off|can't begin|cannot begin|stuck|avoid|beginning/.test(s)) return 'starting';
    return '';
  }

  const strategies = {
    starting: [
      { strategy:'tiny-start', text:'Make the entry point smaller: open one assignment and read only the directions. You can decide whether to continue after that.', action:'Open one assignment and read the directions.', detail:'Reducing a broad task to a clear first move is one organizational strategy described in school guidance. It is an option to try, not a rule that works for everyone.', resourceId:'chadd-organize-teens' },
      { strategy:'setup-first', text:'If opening the work feels like too much, set up just one thing you need—your document, notebook, or pencil. Then choose whether to keep going.', action:'Set up one thing you need for your schoolwork.', detail:'A small preparation step can make materials easier to find. Skip it if getting materials ready is not the obstacle for you.', resourceId:'cdc-classroom' }
    ],
    overwhelmed: [
      { strategy:'choose-one', text:'You don’t have to solve the whole pile right now. Pick one assignment that feels either time-sensitive or easiest to approach.', action:'Choose one assignment to look at first.', detail:'A short list of options can feel more manageable than trying to rank everything. You can change your choice later.', resourceId:'chadd-homework' },
      { strategy:'externalize', text:'Try getting the assignments out of your head and onto one short list. Stop after writing the names; planning can come later.', action:'Write down the names of the assignments on your mind.', detail:'Using an external list is an organizational aid. Keep it brief so making the list does not become another large task.', resourceId:'chadd-organize-teens' }
    ],
    distracted: [
      { strategy:'one-change', text:'Notice one thing pulling your attention and change just that part of the setup—move the phone farther away, quiet one tab, or choose a calmer spot if available.', action:'Move one distraction farther away before you begin.', detail:'Classroom guidance recommends minimizing distractions while also recognizing that what helps varies by student and environment.', resourceId:'cdc-classroom' },
      { strategy:'short-checkpoint', text:'Try choosing a small stopping point before you begin, such as finishing one question. Then pause and decide what you need next.', action:'Choose one small stopping point for this work session.', detail:'Short, clear expectations and breaks are among the supports described in classroom guidance. You can choose a stopping point that suits you.', resourceId:'cdc-classroom' }
    ],
    returning: [
      { strategy:'bookmark', text:'You don’t have to reconstruct the whole session. Write one line about where you stopped, then use that as your re-entry point.', action:'Write one line about where you stopped.', detail:'A brief written cue can hold your place outside working memory. If that adds friction, reopen the assignment and look for the last thing you completed instead.', resourceId:'chadd-homework' },
      { strategy:'fresh-start', text:'It’s okay to restart with a fresh, tiny step. Open the assignment and find the last part you recognize; no need to catch up all at once.', action:'Open the assignment and find the last part you recognize.', detail:'A predictable, concrete re-entry cue can make a return easier to navigate. The point is to find your place, not to make up for lost time.', resourceId:'cdc-classroom' }
    ],
    prioritizing: [
      { strategy:'two-options', text:'Let’s make the choice smaller. Compare just two assignments: one due sooner and one that feels easier to start. Which fits today better?', action:'Choose between the next due assignment and the easiest one to begin.', detail:'Some ADHD guidance recommends limiting choices and making directions specific. Here, comparing two options is just a starting point you can adjust.', resourceId:'chadd-homework' },
      { strategy:'quick-sort', text:'Try marking each item “today” or “later” without estimating every minute. Then choose one item from “today” to look at.', action:'Sort your assignments into “today” and “later.”', detail:'A simple sort can externalize a decision. It is fine to ask a teacher or trusted adult if deadlines or priorities are unclear.', resourceId:'chadd-organize-teens' }
    ]
  };

  function previewReply(text, context = {}) {
    return new Promise(resolve => setTimeout(() => {
      context.attempted ||= [];
      if (context.awaitingClarification) {
        context.challenge = categorize(text) || 'starting';
        context.awaitingClarification = false;
      } else if (!context.challenge) context.challenge = categorize(text);

      if (!context.challenge) {
        context.awaitingClarification = true;
        resolve({ text:'I’m not sure which part to focus on yet. What feels hardest right now?', choices:[
          {label:'Getting started',text:'Getting started is the hard part'},
          {label:'Choosing what to do',text:'I need help choosing what to do first'},
          {label:'Staying focused',text:'I keep getting distracted'}
        ]});
        return;
      }
      const options = strategies[context.challenge] || strategies.starting;
      const chosen = options.find(o=>!context.attempted.includes(o.strategy)&&o.strategy!==context.preferred) || options.find(o=>!context.attempted.includes(o.strategy)) || options[0];
      context.attempted.push(chosen.strategy);
      resolve({ text:context.preferred?`Thanks for that feedback. I’ll keep in mind that ${context.preferred.replaceAll('-',' ')} felt useful. Here’s another option to compare:`:'Thanks for explaining. Here’s one strategy you could try; adapt it if it doesn’t fit:', proposal:chosen });
    }, delayMs));
  }

  async function reply(text, context = {}) {
    if (mode === 'live-enabled' && liveConsent) {
      const response = await fetchImpl(`${apiBase}/coach`, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ message: String(text).slice(0, 500), context: {
          challenge: context.challenge || '', attempted: (context.attempted || []).slice(0, 5), preferred: context.preferred || ''
        } })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The live coach is temporarily unavailable.');
      return result;
    }
    return previewReply(text, context);
  }

  async function breakdown(file) {
    if (!liveAvailable) throw new Error('Live AI is not available right now. You can add the task manually instead.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    const response = await fetchImpl(`${apiBase}/assignment-breakdown`, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ filename: file.name, fileData: btoa(binary) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'We couldn’t read that assignment. Try again.');
    return result;
  }

  function enableLive() { if (liveAvailable) { liveConsent = true; mode = 'live-enabled'; } }
  function usePreview() { liveConsent = false; mode = 'preview'; }
  return { reply, breakdown, checkStatus, enableLive, usePreview, get mode() { return mode; }, get liveAvailable() { return liveAvailable; } };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createCoachService:createDaylightCoachService };
if (typeof window !== 'undefined') window.DAYLIGHT_COACH_SERVICE = createDaylightCoachService();
