const test = require('node:test');
const assert = require('node:assert/strict');
const { resources, filterResources } = require('../resources.js');
const { createCoachService } = require('../coach-service.js');

test('resource search covers titles, keywords, and publisher metadata', () => {
  assert.deepEqual(filterResources(resources, {query:'classroom'}).map(r=>r.id), ['cdc-classroom']);
  assert.deepEqual(filterResources(resources, {query:'peer support'}).map(r=>r.id), ['chadd-peer-support']);
  assert.ok(filterResources(resources, {query:'CHADD'}).length >= 3);
});

test('resource filters combine category, format, time, and saved state', () => {
  const results=filterResources(resources,{category:'Professional guidance',format:'Clinical guidance',time:'long',savedOnly:true,savedIds:['aap-guideline']});
  assert.deepEqual(results.map(r=>r.id),['aap-guideline']);
  assert.deepEqual(filterResources(resources,{savedOnly:true,savedIds:[]}),[]);
});

test('curated resource metadata has source and purpose information', () => {
  assert.ok(resources.length >= 5);
  for (const resource of resources) {
    assert.match(resource.url,/^https:\/\//);
    assert.ok(resource.title && resource.description && resource.publisher && resource.purpose);
  }
  assert.ok(resources.some(r=>r.kind==='Professional guidance'));
  assert.ok(resources.some(r=>r.kind==='Educational information'));
  assert.ok(resources.some(r=>r.kind==='Peer support'));
});

test('ambiguous coach input gets one follow-up before a practical suggestion', async () => {
  const coach=createCoachService({delayMs:0});
  const context={challenge:'',attempted:[],preferred:''};
  const followup=await coach.reply('School has been weird lately',context);
  assert.ok(followup.choices?.length);
  assert.equal(context.awaitingClarification,true);
  const response=await coach.reply('Getting started is the hard part',context);
  assert.equal(context.challenge,'starting');
  assert.ok(response.proposal.action);
  assert.ok(response.proposal.resourceId);
});

test('coach adapts with a different strategy after the student asks to try another', async () => {
  const coach=createCoachService({delayMs:0});
  const context={challenge:'starting',attempted:[],preferred:''};
  const first=await coach.reply('Getting started is hard',context);
  context.attempted.push(first.proposal.strategy);
  const second=await coach.reply('Could I try a different idea?',context);
  assert.notEqual(second.proposal.strategy,first.proposal.strategy);
});

test('coach uses feedback as conversation context without claiming clinical authority', async () => {
  const coach=createCoachService({delayMs:0});
  const context={challenge:'distracted',attempted:[],preferred:''};
  const first=await coach.reply('I keep getting distracted',context);
  context.preferred=first.proposal.strategy;
  const second=await coach.reply('That helped',context);
  assert.notEqual(second.proposal.strategy,first.proposal.strategy);
  assert.match(second.text,/feedback|felt useful/i);
  assert.doesNotMatch(second.text,/diagnos|therapist|clinician/i);
});

test('coach service can target a separately hosted API base', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { DAYLIGHT_API_BASE: 'https://daylight-api.vercel.app/api/' };
  try {
    let requested;
    const coach = createCoachService({ delayMs: 0, fetchImpl: async url => {
      requested = url;
      return { ok: true, json: async () => ({ mode: 'preview' }) };
    } });
    await coach.checkStatus();
    assert.equal(requested, 'https://daylight-api.vercel.app/api/health');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('live coach stays local until the session explicitly opts in', async () => {
  let liveRequests = 0;
  const coach=createCoachService({delayMs:0,fetchImpl:async url=>{
    if(url==='/api/health')return {ok:true,json:async()=>({mode:'live'})};
    liveRequests++;
    return {ok:true,json:async()=>({text:'Try opening the document.',proposal:{action:'Open the document.',strategy:'tiny-start',detail:'One step.',resourceId:''}})};
  }});
  const context={challenge:'starting',attempted:[],preferred:''};
  await coach.checkStatus();
  assert.equal(coach.mode,'live-available');
  await coach.reply('I need help getting started',context);
  assert.equal(liveRequests,0);
  coach.enableLive();
  assert.equal(coach.mode,'live-enabled');
  await coach.reply('I need help getting started',context);
  assert.equal(liveRequests,1);
  coach.usePreview();
  assert.equal(coach.mode,'preview');
  assert.equal(coach.liveAvailable,true);
});

test('a PDF request passes cancellation through and sends only file contents', async () => {
  const signal = new AbortController().signal;
  let request;
  const coach = createCoachService({ fetchImpl: async (url, options) => {
    if (url.endsWith('/health')) return { ok: true, json: async () => ({ mode: 'live' }) };
    request = options;
    return { ok: true, json: async () => ({ title: 'Assignment', steps: ['Read the prompt'] }) };
  } });
  await coach.checkStatus();
  const bytes = new TextEncoder().encode('%PDF-1.4');
  await coach.breakdown({ name: 'student-name.pdf', arrayBuffer: async () => bytes.buffer }, signal);
  assert.equal(request.signal, signal);
  assert.deepEqual(JSON.parse(request.body), { fileData: Buffer.from(bytes).toString('base64') });
});
