(() => {
  const STORE = 'daylight.student.v1';
  const day = 86400000;
  const dateAt = n => new Date(Date.now() + n * day).toISOString().slice(0, 10);
  const initial = {
    tasks: [
      { id:'chem-lab', title:'Chemistry lab report', subject:'Chemistry', due:dateAt(0), steps:['Open the lab document','Review the results','Write the first paragraph','Check the conclusion'], done:[false,false,false,false], today:true },
      { id:'history-source', title:'Find two sources for history project', subject:'World History', due:dateAt(2), steps:['Open the class project prompt','Find one useful source'], done:[false,false], today:true },
      { id:'english-reading', title:'Read chapter 6', subject:'English', due:dateAt(1), steps:['Find my place in the book','Read for ten minutes'], done:[true,false], today:true },
      { id:'algebra', title:'Finish algebra practice set', subject:'Algebra', due:dateAt(4), steps:['Open the practice set','Try the first three problems','Check my answers'], done:[false,false,false], today:false },
      { id:'biology-notes', title:'Organize biology notes', subject:'Biology', due:dateAt(5), steps:['Gather my notes','Review chapter 4','Add key terms'], done:[true,false,false], today:false }
    ],
    settings:{duration:15,breaks:true,reducedMotion:false,softContrast:false,darkMode:false,celebrations:true},
    focusMinutes:35, returns:2, events:[{at:dateAt(-3),type:'step'},{at:dateAt(-1),type:'step'}]
  };
  let state;
  try { state = JSON.parse(localStorage.getItem(STORE)) || initial; } catch { state = initial; }
  if (!state.tasks || !Array.isArray(state.tasks)) state = initial;
  state.settings = {...initial.settings,...(state.settings||{})};
  if (!Array.isArray(state.events)) state.events = [];
  if (!Array.isArray(state.savedResources)) state.savedResources = [];
  let currentTaskId = null, currentStep = 0, currentFilter = 'all', timerSeconds = (state.settings.duration ?? 15) * 60, timerInterval = null, timerRunning = false, toastTimer, taskSaving = false, stateRevision = 0;
  const resources = Array.isArray(window.DAYLIGHT_RESOURCES) ? window.DAYLIGHT_RESOURCES : [];
  const filterResources = window.DAYLIGHT_FILTER_RESOURCES || ((items)=>items);
  let resourceSearch = '', resourceCategory = 'all', resourceFormat = 'all', resourceTime = 'all', savedOnly = false, resourceSearchTimer;
  let coachMessages = [], coachContext = {challenge:'',attempted:[],preferred:''}, coachBusy = false, coachLastPrompt = '', coachRequestId = 0, pendingCoachPrompt = '', pendingAssignmentFile = null, assignmentBusy = false;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const save = () => { stateRevision++; try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} window.DAYLIGHT_AUTH?.queueSync?.(state); };
  const doneCount = t => t.done.filter(Boolean).length;
  const completedSteps = () => state.tasks.reduce((sum,t)=>sum+doneCount(t),0);
  const allSteps = () => state.tasks.reduce((sum,t)=>sum+t.steps.length,0);
  const dueLabel = value => {
    if (!value) return 'No due date';
    const now = new Date(); now.setHours(0,0,0,0);
    const due = new Date(value+'T00:00:00'); const diff = Math.round((due-now)/day);
    if (diff < 0) return 'Past due · reschedule any time';
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    return 'Due '+due.toLocaleDateString(undefined,{month:'short',day:'numeric'});
  };
  const subjectClass = s => /math|algebra/i.test(s)?'math':/english|writing/i.test(s)?'english':/history/i.test(s)?'history':'';
  const subjectIcon = s => /math|algebra/i.test(s)?'∑':/english|writing/i.test(s)?'Aa':/history/i.test(s)?'◷':/biology/i.test(s)?'❋':'✎';
  function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500)}
  function showView(name){
    if(name!=='focus'&&$('#view-focus').classList.contains('active')){rememberCurrentPlace();stopTimer()}
    if(name!=='coach' && $('#view-coach').classList.contains('active')) clearCoachConversation(false);
    $$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+name));
    $$('.nav-item[data-view],.mobile-nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    if(name==='today') renderHome();
    if(name==='tasks') renderTasks();
    if(name==='resources') renderResources();
    if(name==='coach') renderCoach();
    window.scrollTo({top:0,behavior:state.settings.reducedMotion?'auto':'smooth'});
  }
  function activeTask(){return state.tasks.find(t=>t.id===currentTaskId)}
  function firstOpenTask(){return state.tasks.find(t=>t.done.some(x=>!x))||null}
  function firstOpenStep(t){return t?.done.findIndex(x=>!x) ?? -1}
  function rememberCurrentPlace(){const t=activeTask();if(!t)return;const next=t.done[currentStep]?firstOpenStep(t):currentStep;if(next>=0)t.resumeStep=next;else{delete t.resumeStep;t.resumeNote='';}t.resumeNote=next>=0?$('#resume-note').value.trim():'';save()}
  function renderHome(){
    const open=state.tasks.filter(t=>t.done.some(x=>!x));
    const priorities=state.tasks.filter(t=>t.today&&!t.done.every(Boolean)).slice(0,3);
    const n=priorities.length;
    $('#today-count').textContent=n;
    const finishedToday=state.tasks.filter(t=>t.today&&t.done.every(Boolean)).length;
    const pct=n?Math.round(finishedToday/(n+finishedToday)*100):100;
    $('#day-progress-fill').style.width=pct+'%';$('#day-progress-label').textContent=`${finishedToday} of ${n+finishedToday} priorities`;$('#day-progress-pct').textContent=pct+'%';
    const next=priorities[0]||open[0];
    if(next){const ix=firstOpenStep(next);$('#next-task-title').textContent=ix>=0?next.steps[ix]:next.title;$('#next-task-detail').innerHTML=`${esc(next.subject||'Schoolwork')} <span class="sep">·</span> ${ix>=0?'Step '+(ix+1)+' of '+next.steps.length:'Ready when you are'}`;$('#start-next').dataset.task=next.id;}else{$('#next-task-title').textContent='You’ve done enough for now';$('#next-task-detail').textContent='Take a breath. You can add a task whenever.';$('#start-next').dataset.task='';}
    $('#priority-list').innerHTML= priorities.length? priorities.map(t=>`<div class="priority-row ${t.done.every(Boolean)?'is-done':''}"><button class="check-button" data-toggle-task="${t.id}" aria-label="${t.done.every(Boolean)?'Mark':'Complete'} ${esc(t.title)}">✓</button><div class="priority-copy"><div class="priority-title">${esc(t.title)}</div><div class="priority-sub">${esc(t.subject||'Schoolwork')} · ${doneCount(t)} of ${t.steps.length} steps</div></div><span class="priority-due ${t.due&&t.due<=dateAt(1)?'soon':''}">${esc(dueLabel(t.due))}</span><button class="priority-open" data-focus-task="${t.id}" aria-label="Start ${esc(t.title)}">›</button></div>`).join('') : `<div class="empty-state" style="margin:24px auto"><h2>Room to breathe.</h2><p>There are no priorities left for today.</p></div>`;
    $('#nav-task-count').textContent=open.length;
    const res=state.tasks.find(t=>Number.isInteger(t.resumeStep)&&!t.done[t.resumeStep])||firstOpenTask();
    $('#resume-card').classList.toggle('hidden',!res);
    if(res){const ix=Number.isInteger(res.resumeStep)&&!res.done[res.resumeStep]?res.resumeStep:firstOpenStep(res);$('#resume-title').textContent=res.title;$('#resume-button').dataset.task=res.id;$('#resume-button').setAttribute('aria-label','Resume '+res.title);$('#resume-card p').textContent=res.resumeNote?.trim()||(ix>=0?'Pick up: '+res.steps[ix]:'Ready for another look');}
    $('#completed-total').textContent=state.events.length;$('#focus-total').innerHTML=`${state.focusMinutes} <small>min</small>`;$('#return-total').textContent=state.returns;
  }
  function renderTasks(){
    const list=$('#task-list');let tasks=[...state.tasks];
    if(currentFilter==='upcoming')tasks=tasks.filter(t=>!t.done.every(Boolean));
    if(currentFilter==='done')tasks=tasks.filter(t=>t.done.every(Boolean));
    const sort=$('#sort-tasks').value;
    if(sort==='name')tasks.sort((a,b)=>a.title.localeCompare(b.title));else tasks.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
    $('#filter-all-count').textContent=state.tasks.length;
    $('#task-empty').classList.toggle('hidden',tasks.length!==0);list.classList.toggle('hidden',tasks.length===0);
    list.innerHTML=tasks.map(t=>`<article class="task-card"><div class="task-card-top"><div class="task-color ${subjectClass(t.subject)}">${subjectIcon(t.subject)}</div><div class="task-card-heading"><h3>${esc(t.title)}</h3><p>${esc(t.subject||'Schoolwork')} · ${doneCount(t)} of ${t.steps.length} steps</p></div><span class="task-due ${t.due&&t.due<=dateAt(1)&&!t.done.every(Boolean)?'soon':''}">${esc(dueLabel(t.due))}</span></div><ul class="task-steps">${t.steps.map((s,i)=>`<li class="task-step ${t.done[i]?'done':''}"><button class="mini-check ${t.done[i]?'checked':''}" data-step-task="${t.id}" data-step-index="${i}" aria-label="${t.done[i]?'Reopen':'Complete'} step: ${esc(s)}">✓</button><span>${esc(s)}</span></li>`).join('')}</ul><div class="task-card-footer"><span class="task-progress-copy">${t.done.every(Boolean)?'Finished · nicely done':'Step '+(doneCount(t)+1)+' of '+t.steps.length}</span><div class="task-progress-track" aria-label="Task progress"><span style="width:${Math.round(doneCount(t)/t.steps.length*100)}%"></span></div><div class="task-actions"><button class="small-action" data-focus-task="${t.id}">${t.done.every(Boolean)?'Review':'Start a step'}</button><button class="small-action" data-reschedule="${t.id}">${t.due?'Move date':'Add date'}</button></div></div></article>`).join('');
  }
  function initResourceFilters(){
    const categories=[...new Set(resources.map(r=>r.category))].sort();
    const formats=[...new Set(resources.map(r=>r.format))].sort();
    $('#resource-category').innerHTML='<option value="all">All categories</option>'+categories.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    $('#resource-format').innerHTML='<option value="all">All formats</option>'+formats.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  }
  function renderResources(){
    const filtered=filterResources(resources,{query:resourceSearch,category:resourceCategory,format:resourceFormat,time:resourceTime,savedIds:state.savedResources,savedOnly});
    $('#resource-grid').innerHTML=filtered.map(r=>{const saved=state.savedResources.includes(r.id);return `<article class="resource-card"><div class="resource-card-top"><span class="resource-kind">${esc(r.kind)}</span><button class="save-resource ${saved?'saved':''}" data-save-resource="${esc(r.id)}" aria-label="${saved?'Remove saved resource':'Save resource'}: ${esc(r.title)}" aria-pressed="${saved}">${saved?'♥':'♡'}</button></div><span class="resource-category">${esc(r.category)}</span><h2>${esc(r.title)}</h2><p class="resource-description">${esc(r.description)}</p><div class="resource-meta"><span>${esc(r.publisher)}</span><span>${esc(r.format)} · ~${r.minutes} min</span></div><button class="resource-open" data-open-resource="${esc(r.id)}">View details <span>→</span></button></article>`}).join('');
    $('#resource-result-count').textContent=`${filtered.length} ${filtered.length===1?'resource':'resources'}${savedOnly?' saved':''}`;
    $('#saved-count').textContent=state.savedResources.length;
    $('#resource-empty').classList.toggle('hidden',filtered.length!==0);$('#resource-grid').classList.toggle('hidden',filtered.length===0);
  }
  function openResource(id){
    const r=resources.find(item=>item.id===id);if(!r)return;
    const saved=state.savedResources.includes(r.id);
    $('#resource-detail').innerHTML=`<span class="resource-kind">${esc(r.kind)}</span><p class="eyebrow resource-detail-category">${esc(r.category)}</p><h2>${esc(r.title)}</h2><p class="resource-detail-description">${esc(r.description)}</p><div class="detail-meta"><div><small>PUBLISHER</small><b>${esc(r.publisher)}</b></div><div><small>FORMAT · READING TIME</small><b>${esc(r.format)} · about ${r.minutes} minutes</b></div><div><small>TYPE</small><b>${esc(r.kind)}</b></div></div><div class="resource-purpose"><b>What this is for</b><p>${esc(r.purpose)}</p></div><p class="resource-disclaimer">This is general information. It isn’t individualized medical advice or a substitute for support from a qualified professional.</p><div class="resource-detail-actions"><button type="button" class="button-secondary" data-save-resource="${esc(r.id)}" aria-pressed="${saved}">${saved?'♥ Saved':'♡ Save for later'}</button><a class="button-primary" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Visit source <span>↗</span></a></div>`;
    $('#resource-dialog').showModal();
  }
  function toggleSavedResource(id){
    const exists=state.savedResources.includes(id);
    state.savedResources=exists?state.savedResources.filter(x=>x!==id):[...state.savedResources,id];save();renderResources();
    const saved=!exists;$$(`[data-save-resource="${id}"]`).forEach(button=>{button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',`${saved?'Remove saved resource':'Save resource'}: ${resources.find(r=>r.id===id)?.title||'resource'}`);button.textContent=button.classList.contains('button-secondary')?(saved?'♥ Saved':'♡ Save for later'):(saved?'♥':'♡');button.classList.toggle('saved',saved)});
    notify(exists?'Removed from saved resources.':'Saved for later.');
  }
  function renderCoach(){
    const intro=$('#coach-intro'),log=$('#coach-messages');
    intro.classList.toggle('hidden',coachMessages.length>0);log.classList.toggle('hidden',coachMessages.length===0);
    log.innerHTML=coachMessages.map((m,i)=>{
      if(m.role==='user')return `<div class="chat-row user-row"><div class="chat-bubble user-bubble">${esc(m.text)}</div></div>`;
      const choices=m.choices?.length?`<div class="coach-choices">${m.choices.map(c=>`<button data-coach-prompt="${esc(c.text)}">${esc(c.label)}</button>`).join('')}</div>`:'';
      const proposal=m.proposal?`<div class="coach-proposal"><span class="tiny-label">ONE POSSIBLE NEXT MOVE</span><p>${esc(m.proposal.action)}</p><div class="proposal-actions"><button class="button-primary" data-coach-add-task="${i}">Edit and add to tasks <span>→</span></button><button class="small-action" data-coach-feedback="helped" data-message-index="${i}">That feels doable</button><button class="small-action" data-coach-feedback="different" data-message-index="${i}">Try another idea</button></div>${m.proposal.resourceId?`<button class="coach-resource-link" data-open-resource="${esc(m.proposal.resourceId)}">Related reading: ${esc(resources.find(r=>r.id===m.proposal.resourceId)?.title||'View resource')} ↗</button>`:''}</div><details class="coach-more"><summary>A little more detail</summary><p>${esc(m.proposal.detail)}</p></details>`:'';
      return `<div class="chat-row assistant-row"><div class="coach-avatar small-avatar" aria-hidden="true">◌</div><div class="assistant-stack"><div class="chat-bubble assistant-bubble">${esc(m.text)}</div>${choices}${proposal}</div></div>`;
    }).join('')+(coachBusy?'<div class="chat-row assistant-row"><div class="coach-avatar small-avatar" aria-hidden="true">◌</div><div class="chat-bubble assistant-bubble typing" role="status">Thinking through one next step…</div></div>':'');
    $('#coach-send').disabled=coachBusy;$('#coach-input').disabled=coachBusy;
    if(coachMessages.length)log.scrollTop=log.scrollHeight;
  }
  // Mock service is intentionally separate from the local task breakdown function above.
  const coachService=window.DAYLIGHT_COACH_SERVICE||{reply:async()=>{throw new Error('Coach service is not configured')}};
  function renderCoachMode(){
    const liveAvailable=coachService.mode==='live-available';
    const liveEnabled=coachService.mode==='live-enabled';
    $('#coach-mode-title').textContent=liveEnabled?'Live AI coach':liveAvailable?'Live AI available':'Local coach preview';
    $('#coach-mode-copy').textContent=liveEnabled?'Your message and brief coach choices are sent to OpenAI for replies. Daylight does not save this chat; avoid identifying details.':coachService.liveAvailable?'Scripted suggestions are local. You can optionally enable live AI for this session; messages will be sent to OpenAI.':'Scripted suggestions only. Messages stay in this tab and clear when you leave or choose “Clear conversation.”';
    $('#enable-live-coach').classList.toggle('hidden',!coachService.liveAvailable||liveEnabled);
    $('#use-local-coach').classList.toggle('hidden',!liveEnabled);
    $('#choose-assignment-pdf').disabled=!coachService.liveAvailable||assignmentBusy;
    if(!coachService.liveAvailable)setAssignmentStatus('PDF breakdown needs a configured live AI service. You can still add a task manually.');
  }
  async function initializeCoachMode(){if(coachService.checkStatus)await coachService.checkStatus();renderCoachMode()}
  async function requestCoachReply(text){
    const requestId=++coachRequestId;coachBusy=true;$('#coach-error').classList.add('hidden');renderCoach();
    let timeoutId;
    try{const timeout=new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error('Coach request timed out')),12000)});const result=await Promise.race([coachService.reply(text,coachContext),timeout]);if(requestId!==coachRequestId)return;coachMessages.push({role:'assistant',...result});coachBusy=false;renderCoach();}
    catch{if(requestId!==coachRequestId)return;coachBusy=false;$('#coach-error').classList.remove('hidden');renderCoach();}
    finally{clearTimeout(timeoutId)}
  }
  async function submitCoachMessage(clean){
    coachLastPrompt=clean;coachMessages.push({role:'user',text:clean});$('#coach-input').value='';
    await requestCoachReply(clean);
  }
  async function sendCoachMessage(text){
    const clean=text.trim().slice(0,500);if(!clean||coachBusy)return;
    if(coachService.mode==='live-available'){
      pendingCoachPrompt=clean;$('#ai-consent-dialog').showModal();return;
    }
    await submitCoachMessage(clean);
  }
  function coachFeedback(kind,index){
    const message=coachMessages[index],proposal=message?.proposal;if(!proposal)return;
    if(kind==='helped'){coachContext.preferred=proposal.strategy;coachMessages.push({role:'assistant',text:'Thanks for telling me. I’ll use that as a clue for this conversation. You can add the suggested move to Tasks, or keep exploring.'});}
    else{coachContext.attempted.push(proposal.strategy);coachMessages.push({role:'user',text:'That one does not feel like a fit. Could I try another approach?'});}
    renderCoach();if(kind==='different')requestCoachReply('Please offer a different strategy for the same challenge.');
  }
  function clearCoachConversation(showNotice=true){coachRequestId++;coachMessages=[];coachContext={challenge:'',attempted:[],preferred:''};coachBusy=false;coachLastPrompt='';$('#coach-input').value='';$('#coach-error').classList.add('hidden');renderCoach();if(showNotice)notify('Conversation cleared from this tab.');}
  function transferCoachAction(index){
    const action=coachMessages[index]?.proposal?.action;if(!action)return;
    openTaskForm(null,{title:action,subject:'Study coach',steps:[action]});
  }
  function setAssignmentStatus(message,isError=false){const status=$('#assignment-upload-status');status.textContent=message;status.classList.toggle('is-error',isError)}
  function chooseAssignmentFile(file){
    if(!file)return;
    if(!/\.pdf$/i.test(file.name)||file.type&&file.type!=='application/pdf'){setAssignmentStatus('Choose a PDF file to continue.',true);return}
    if(file.size>8*1024*1024){setAssignmentStatus('This PDF is over 8 MB. Choose a smaller file.',true);return}
    if(!file.size){setAssignmentStatus('That PDF is empty. Choose another file.',true);return}
    if(!coachService.liveAvailable){setAssignmentStatus('Live AI is not configured for this app yet. You can still add a task manually.',true);return}
    pendingAssignmentFile=file;
    $('#assignment-consent-file').textContent=`${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;
    $('#assignment-consent-dialog').showModal();
  }
  function renderAssignmentReview(result){
    $('#assignment-task-title').value=result.title||'Assignment task';$('#assignment-task-subject').value=result.subject||'';$('#assignment-task-due').value='';
    const steps=result.steps?.length?result.steps:['Review the assignment directions and add your own first step.'];
    $('#assignment-review-steps').innerHTML=steps.map((step,i)=>`<div class="assignment-review-step"><span>${i+1}</span><input class="text-input" maxlength="100" aria-label="Step ${i+1}" value="${esc(step)}" /><button type="button" class="remove-step" aria-label="Remove step ${i+1}">×</button></div>`).join('');
    $('#assignment-review-error').classList.add('hidden');$('#assignment-review-dialog').showModal();setTimeout(()=>$('#assignment-task-title').focus(),50);
  }
  async function submitAssignmentFile(){
    if(!pendingAssignmentFile||assignmentBusy)return;
    const file=pendingAssignmentFile;assignmentBusy=true;const button=$('#assignment-consent-send');button.disabled=true;button.textContent='Reading the PDF…';setAssignmentStatus('Reading the assignment…');
    try{const result=await coachService.breakdown(file);pendingAssignmentFile=null;$('#assignment-consent-dialog').close();if(!result.steps?.length){setAssignmentStatus('The PDF did not contain a clear assignment prompt. Try a clearer copy or add the task manually.',true);return}setAssignmentStatus('Suggestions are ready to review.');renderAssignmentReview(result)}
    catch(error){setAssignmentStatus(error.message||'We couldn’t read that PDF. Try again.',true)}
    finally{assignmentBusy=false;button.disabled=false;button.textContent='Send PDF for ideas'}
  }
  function saveAssignmentBreakdown(event){
    event.preventDefault();const title=$('#assignment-task-title').value.trim(),steps=$$('#assignment-review-steps input').map(input=>input.value.trim()).filter(Boolean),error=$('#assignment-review-error');
    if(!title){error.textContent='Add a task name before saving.';error.classList.remove('hidden');$('#assignment-task-title').focus();return}
    if(!steps.length){error.textContent='Add at least one step so you have a place to begin.';error.classList.remove('hidden');$('#assignment-review-steps input')?.focus();return}
    state.tasks.unshift({id:'task-'+Date.now(),title:title.slice(0,100),subject:$('#assignment-task-subject').value.trim().slice(0,40),due:$('#assignment-task-due').value,steps:steps.slice(0,12),done:steps.slice(0,12).map(()=>false),today:true});
    $('#assignment-review-dialog').close();$('#assignment-pdf').value='';setAssignmentStatus('Task saved. You can change the steps any time.');refresh();showView('tasks');notify('Assignment task saved. Review the steps whenever you like.');
  }
  function renderWeek(){const counts=Array(7).fill(0);const today=new Date();today.setHours(0,0,0,0);const mondayOffset=(today.getDay()+6)%7;const monday=new Date(today.getTime()-mondayOffset*day);for(const event of state.events){const stamp=new Date(event.at);stamp.setHours(0,0,0,0);const i=Math.floor((stamp-monday)/day);if(i>=0&&i<7)counts[i]++}const max=Math.max(2,...counts);const names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];$('#week-bars').innerHTML=names.map((n,i)=>`<div class="week-day ${i===mondayOffset?'today':''}"><div class="bar-track"><div class="bar-fill" style="height:${Math.max(8,counts[i]/max*100)}%"></div></div><span>${n}</span></div>`).join('')}
  function refresh(){renderHome();renderTasks();renderWeek();save()}
  function openTaskForm(task=null,prefill=null){const d=$('#task-dialog'),draft=task||prefill;$('#task-form').dataset.edit=task?.id||'';$('#dialog-title').textContent=task?'Edit task':prefill?'Shape this into a task':'Add a task';$('#task-name').value=draft?.title||'';$('#task-subject').value=draft?.subject||'';$('#task-due').value=draft?.due||'';renderStepInputs(draft?.steps||[]);d.showModal();setTimeout(()=>$('#task-name').focus(),50)}
  const NAV_VIEWS=['today','tasks','coach','resources','progress'];
  function navOrder(){const saved=Array.isArray(state.settings.navOrder)?state.settings.navOrder.filter(v=>NAV_VIEWS.includes(v)):[];return saved.concat(NAV_VIEWS.filter(v=>!saved.includes(v)))}
  function applyNavOrder(){
    const order=navOrder();
    $$('.nav-list,.mobile-nav').forEach(list=>{
      [...list.querySelectorAll('[data-view]')]
        .sort((a,b)=>{const i=order.indexOf(a.dataset.view),j=order.indexOf(b.dataset.view);return (i<0?99:i)-(j<0?99:j)})
        .forEach(el=>list.append(el));
    });
  }
  function enableNavReorder(){
    const list=$('.nav-list');if(!list)return;
    let dragEl=null,startY=0,moved=false,before='',suppressUntil=0;
    const orderNow=()=>[...list.querySelectorAll('[data-view]')].map(b=>b.dataset.view);
    const place=y=>{
      const next=[...list.querySelectorAll('.nav-item[data-view]')].filter(x=>x!==dragEl)
        .find(x=>{const r=x.getBoundingClientRect();return y<r.top+r.height/2});
      if(next)list.insertBefore(dragEl,next);else list.append(dragEl);
    };
    const endDrag=()=>{
      if(!dragEl)return;
      const after=orderNow().join();
      dragEl.classList.remove('dragging');list.classList.remove('reordering');
      const changed=moved&&after!==before;
      dragEl=null;moved=false;
      if(!changed)return;
      suppressUntil=Date.now()+300;
      state.settings.navOrder=after.split(',');save();applyNavOrder();notify('Tab order saved.');
    };
    list.addEventListener('click',e=>{if(Date.now()<suppressUntil){e.stopImmediatePropagation();e.preventDefault()}},true);
    list.addEventListener('pointerdown',e=>{
      const item=e.target.closest('.nav-item[data-view]');if(!item||(e.button??0)>0)return;
      dragEl=item;startY=e.clientY;moved=false;before=orderNow().join();
      try{item.setPointerCapture(e.pointerId)}catch{}
    });
    document.addEventListener('pointermove',e=>{
      if(!dragEl)return;
      if(!moved&&Math.abs(e.clientY-startY)<6)return;
      if(!moved){moved=true;dragEl.classList.add('dragging');list.classList.add('reordering')}
      place(e.clientY);
    });
    document.addEventListener('pointerup',endDrag);
    document.addEventListener('pointercancel',endDrag);
    list.addEventListener('keydown',e=>{
      if(!e.altKey||(e.key!=='ArrowUp'&&e.key!=='ArrowDown'))return;
      const item=e.target.closest('.nav-item[data-view]');if(!item)return;
      const items=[...list.querySelectorAll('[data-view]')],i=items.indexOf(item),j=e.key==='ArrowUp'?i-1:i+1;
      if(j<0||j>=items.length)return;
      e.preventDefault();
      if(e.key==='ArrowUp')list.insertBefore(item,items[j]);else list.insertBefore(items[j],item);
      state.settings.navOrder=orderNow();save();applyNavOrder();item.focus();
      notify('Tab moved. Alt + arrow keys reorder the rest.');
    });
  }

  function renderStepInputs(steps){const values=steps.length?steps:[''];$('#step-inputs').innerHTML=values.map((s,i)=>`<div class="step-field"><span class="step-bullet">${i+1}</span><input class="text-input" aria-label="Step ${i+1}" value="${esc(s)}" placeholder="A small, concrete step" maxlength="100"><button type="button" class="remove-step" aria-label="Remove step ${i+1}">×</button></div>`).join('');}
  function suggestSteps(){const title=$('#task-name').value.trim();const low=title.toLowerCase();let steps=['Open the assignment or materials','Look over what needs to be done','Work on one small part','Check what you’ve finished'];if(/lab|report|essay|paper|project/.test(low))steps=['Open the assignment document','Review your notes or results','Write one rough paragraph','Read it over once'];else if(/read|chapter|book/.test(low))steps=['Find your place','Read for ten minutes','Write down one thing you noticed'];else if(/problem|math|practice|worksheet/.test(low))steps=['Open the problem set','Try the first two questions','Check one answer'];renderStepInputs(steps);notify('Step ideas added. Change anything that doesn’t fit.');}
  function beginFocus(id,returning=false){const t=state.tasks.find(x=>x.id===id)||firstOpenTask();if(!t){notify('Add a task to begin.');return}currentTaskId=t.id;const saved=Number.isInteger(t.resumeStep)&&t.resumeStep>=0&&t.resumeStep<t.done.length&&!t.done[t.resumeStep]?t.resumeStep:-1;currentStep=saved>=0?saved:firstOpenStep(t);if(currentStep<0)currentStep=0;if(!t.done[currentStep])t.resumeStep=currentStep;if(returning)state.returns++;const label=t.steps[currentStep]||t.title;$('#focus-title').textContent=label;$('#focus-task-name').textContent=`${t.subject||'Schoolwork'} · ${t.title}`;$('#focus-step-text').textContent=label;$('#step-done').setAttribute('aria-label','Mark step complete: '+label);$('#resume-note').value=t.resumeNote||'';$('#resume-note-status').textContent='Your current step is remembered automatically.';timerSeconds=(state.settings.duration ?? 15)*60;timerRunning=false;clearInterval(timerInterval);$('#timer-toggle').innerHTML='▶ <span>Start timer</span>';$('#timer-caption').textContent=state.settings.duration?'OPTIONAL FOCUS TIMER':'NO TIMER';$$('.timer-preset').forEach(b=>b.classList.toggle('active',Number(b.dataset.minutes)===state.settings.duration));updateTimer();showView('focus');save()}
  function updateTimer(){const m=Math.floor(timerSeconds/60),s=timerSeconds%60;$('#timer-display').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');$('#timer-face').classList.toggle('running',timerRunning)}
  function toggleTimer(){if(timerRunning){clearInterval(timerInterval);timerRunning=false;$('#timer-toggle').innerHTML='▶ <span>Resume timer</span>';$('#focus-encouragement').textContent='Paused. Take the time you need.';updateTimer();return}if(timerSeconds===0){$('#focus-encouragement').textContent='No timer needed. Start whenever you’re ready.';return}timerRunning=true;$('#timer-toggle').innerHTML='Ⅱ <span>Pause</span>';$('#focus-encouragement').textContent='You can pause or stop whenever you need.';timerInterval=setInterval(()=>{if(timerSeconds>0){timerSeconds--;updateTimer()}if(timerSeconds===0){clearInterval(timerInterval);timerRunning=false;$('#timer-toggle').innerHTML='▶ <span>Start another</span>';$('#focus-encouragement').textContent='Your timer is up. Keep going, take a break, or stop here.';notify('Focus time is up. Nice work showing up.')}},1000);updateTimer()}
  function stopTimer(){clearInterval(timerInterval);timerRunning=false;updateTimer()}
  function finishStep(){const t=activeTask();if(!t)return;stopTimer();const i=currentStep;if(i<t.done.length&&!t.done[i]){t.done[i]=true;state.events.push({at:new Date().toISOString(),type:'step'})}const next=firstOpenStep(t);if(next>=0)t.resumeStep=next;else{delete t.resumeStep;}t.resumeNote='';$('#resume-note').value='';$('#resume-note-status').textContent='Your current step is remembered automatically.';const elapsed=state.settings.duration?Math.floor((state.settings.duration*60-timerSeconds)/60):0;state.focusMinutes+=Math.max(0,elapsed);refresh();$('#done-title').textContent=t.done.every(Boolean)?'You finished this task.': 'You made a little progress.';$('#done-message').textContent=t.done.every(Boolean)?`${t.title} is done. Take a moment to notice that.`:'You showed up for this step. That matters.';$('#done-next').textContent=t.done.every(Boolean)?'Choose another small step →':'One more small step →';$('#done-dialog').showModal()}
  function toggleStep(id,index){const t=state.tasks.find(x=>x.id===id);if(!t)return;t.done[index]=!t.done[index];if(t.done[index])state.events.push({at:new Date().toISOString(),type:'step'});if(t.done[t.resumeStep]){const next=firstOpenStep(t);if(next>=0)t.resumeStep=next;else{delete t.resumeStep;t.resumeNote='';}}else if(!t.done[index]&&!Number.isInteger(t.resumeStep)){t.resumeStep=index;}refresh();notify(t.done[index]?'Step complete. That counts.':'Step reopened. You can take it from here.');}
  function reschedule(id){const t=state.tasks.find(x=>x.id===id);if(!t)return;const answer=prompt(`Choose a new due date for “${t.title}” (YYYY-MM-DD). Leave blank to clear the date.`,t.due||'');if(answer===null)return;if(answer&&!/^\d{4}-\d{2}-\d{2}$/.test(answer)){notify('Use a date like 2026-10-20.');return}t.due=answer||'';refresh();notify('Date updated. You can change it again any time.');}
  function bind(){
    enableNavReorder();
    $$('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
    $$('[data-go="tasks"]').forEach(b=>b.addEventListener('click',()=>showView('tasks')));
    $('#add-task').addEventListener('click',()=>openTaskForm());$('#quick-add').addEventListener('click',()=>openTaskForm());$('#capture-button').addEventListener('click',()=>openTaskForm());$('#empty-add').addEventListener('click',()=>openTaskForm());
    $('#cancel-task').addEventListener('click',()=>$('#task-dialog').close());$('#task-form').addEventListener('submit',e=>{e.preventDefault();if(taskSaving)return;const form=e.currentTarget,title=$('#task-name').value.trim(),error=$('#task-form-error');error.classList.add('hidden');error.textContent='';if(!title){error.textContent='Add a task name so you know what to start.';error.classList.remove('hidden');$('#task-name').setAttribute('aria-invalid','true');$('#task-name').focus();return}$('#task-name').removeAttribute('aria-invalid');taskSaving=true;form.setAttribute('aria-busy','true');const submit=form.querySelector('[type="submit"]');submit.disabled=true;try{const steps=$$('#step-inputs input').map(x=>x.value.trim()).filter(Boolean);const editId=form.dataset.edit;const subject=$('#task-subject').value.trim();const due=$('#task-due').value;if(editId){const t=state.tasks.find(x=>x.id===editId);if(t){t.title=title;t.subject=subject;t.due=due;t.steps=steps.length?steps:[title];t.done=t.steps.map((_,i)=>t.done[i]||false)}}else{state.tasks.unshift({id:'task-'+Date.now(),title,subject,due,steps:steps.length?steps:[`Open ${title}`],done:(steps.length?steps:[title]).map(()=>false),today:true})}$('#task-dialog').close();refresh();notify(editId?'Task updated.':'Task saved. One small step is ready.')}finally{taskSaving=false;form.removeAttribute('aria-busy');submit.disabled=false}});
    $('#add-step').addEventListener('click',()=>{const current=$$('#step-inputs input').map(x=>x.value);renderStepInputs([...current,'']);$('#step-inputs input:last-of-type')?.focus()});$('#suggest-steps').addEventListener('click',suggestSteps);$('#step-inputs').addEventListener('click',e=>{if(e.target.classList.contains('remove-step')){const row=e.target.closest('.step-field');if($$('.step-field').length>1)row.remove();else row.querySelector('input').value='';$$('.step-field').forEach((r,i)=>r.querySelector('.step-bullet').textContent=i+1)}});
    $('#task-list').addEventListener('click',e=>{const step=e.target.closest('[data-step-task]');if(step){toggleStep(step.dataset.stepTask,Number(step.dataset.stepIndex));return}const focus=e.target.closest('[data-focus-task]');if(focus){beginFocus(focus.dataset.focusTask);return}const move=e.target.closest('[data-reschedule]');if(move)reschedule(move.dataset.reschedule)});
    $('#priority-list').addEventListener('click',e=>{const check=e.target.closest('[data-toggle-task]');if(check){const t=state.tasks.find(x=>x.id===check.dataset.toggleTask);if(t){const i=firstOpenStep(t);if(i>=0)toggleStep(t.id,i);else notify('This task is already finished.')}return}const b=e.target.closest('[data-focus-task]');if(b)beginFocus(b.dataset.focusTask)});
    $$('.filter-tab').forEach(b=>b.addEventListener('click',()=>{$$('.filter-tab').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');currentFilter=b.dataset.filter;renderTasks()}));$('#sort-tasks').addEventListener('change',renderTasks);
    $('#start-next').addEventListener('click',()=>{if($('#start-next').dataset.task)beginFocus($('#start-next').dataset.task);else openTaskForm()});$('#resume-button').addEventListener('click',()=>beginFocus($('#resume-button').dataset.task,true));$('#focus-back').addEventListener('click',()=>{stopTimer();showView('today')});$('#step-done').addEventListener('click',finishStep);$('#timer-toggle').addEventListener('click',toggleTimer);
    $('#resume-note').addEventListener('input',()=>{const t=activeTask();if(!t)return;t.resumeStep=currentStep;t.resumeNote=$('#resume-note').value.trim();save();$('#resume-note-status').textContent='Note saved for your next visit.'});
    $$('.timer-preset').forEach(b=>b.addEventListener('click',()=>{if(timerRunning)toggleTimer();const min=Number(b.dataset.minutes);state.settings.duration=min;timerSeconds=min*60;$$('.timer-preset').forEach(x=>x.classList.toggle('active',x===b));$('#timer-caption').textContent=min?'OPTIONAL FOCUS TIMER':'NO TIMER';$('#timer-toggle').innerHTML='▶ <span>Start timer</span>';$('#focus-encouragement').textContent=min?'You can pause or stop whenever you need.':'Use as much or as little time as you like.';updateTimer();save()}));
    $('#focus-break').addEventListener('click',()=>{stopTimer();if(state.settings.breaks)notify('Break time. Come back whenever you’re ready.');else notify('Timer paused. Take the break you need.');$('#focus-encouragement').textContent='Take a breather. You can return when you’re ready.'});$('#focus-finish').addEventListener('click',finishStep);
    $('#done-next').addEventListener('click',()=>{const t=activeTask();$('#done-dialog').close();if(t&&!t.done.every(Boolean))beginFocus(t.id,true);else{const next=firstOpenTask();if(next)beginFocus(next.id,true);else openTaskForm()}});$('#done-today').addEventListener('click',()=>{$('#done-dialog').close();showView('today')});
    $('#reset-day').addEventListener('click',()=>$('#reset-dialog').showModal());$('#reset-close').addEventListener('click',()=>$('#reset-dialog').close());$('#reset-start').addEventListener('click',()=>{$('#reset-dialog').close();const task=firstOpenTask();if(task)beginFocus(task.id,true);else openTaskForm()});
    $('#default-duration').addEventListener('change',e=>{state.settings.duration=Number(e.target.value);save();notify('Focus preference saved.')});
    [['break-reminders','breaks'],['reduce-motion','reducedMotion'],['soft-contrast','softContrast'],['dark-mode','darkMode'],['celebrations','celebrations']].forEach(([id,key])=>$('#'+id).addEventListener('change',e=>{state.settings[key]=e.target.checked;applySettings();save();notify('Preference saved.')}));
    $('#resource-search').addEventListener('input',e=>{resourceSearch=e.target.value;clearTimeout(resourceSearchTimer);resourceSearchTimer=setTimeout(renderResources,120)});
    $('#resource-category').addEventListener('change',e=>{resourceCategory=e.target.value;renderResources()});
    $('#resource-format').addEventListener('change',e=>{resourceFormat=e.target.value;renderResources()});
    $('#resource-time').addEventListener('change',e=>{resourceTime=e.target.value;renderResources()});
    $('#saved-only').addEventListener('click',e=>{savedOnly=!savedOnly;e.currentTarget.setAttribute('aria-pressed',String(savedOnly));e.currentTarget.classList.toggle('active',savedOnly);renderResources()});
    $('#clear-resource-search').addEventListener('click',()=>{resourceSearch='';resourceCategory='all';resourceFormat='all';resourceTime='all';savedOnly=false;clearTimeout(resourceSearchTimer);$('#resource-search').value='';$('#resource-category').value='all';$('#resource-format').value='all';$('#resource-time').value='all';$('#saved-only').setAttribute('aria-pressed','false');$('#saved-only').classList.remove('active');renderResources()});
    $('#coach-form').addEventListener('submit',e=>{e.preventDefault();sendCoachMessage($('#coach-input').value)});
    $('#choose-assignment-pdf').addEventListener('click',()=>$('#assignment-pdf').click());
    $('#assignment-pdf').addEventListener('change',e=>chooseAssignmentFile(e.target.files?.[0]));
    $('#assignment-consent-send').addEventListener('click',submitAssignmentFile);
    $('#assignment-consent-cancel').addEventListener('click',()=>{$('#assignment-consent-dialog').close();pendingAssignmentFile=null;$('#assignment-pdf').value=''});
    $('#assignment-consent-close').addEventListener('click',()=>{$('#assignment-consent-dialog').close();pendingAssignmentFile=null;$('#assignment-pdf').value=''});
    $('#assignment-consent-dialog').addEventListener('cancel',()=>{pendingAssignmentFile=null;$('#assignment-pdf').value=''});
    $('#assignment-review-form').addEventListener('submit',saveAssignmentBreakdown);
    $('#assignment-review-close').addEventListener('click',()=>$('#assignment-review-dialog').close());
    $('#assignment-review-cancel').addEventListener('click',()=>$('#assignment-review-dialog').close());
    $('#assignment-review-add-step').addEventListener('click',()=>{const container=$('#assignment-review-steps'),count=container.querySelectorAll('.assignment-review-step').length;if(count>=12){notify('Keep the breakdown to 12 steps or fewer.');return}const item=document.createElement('div');item.className='assignment-review-step';item.innerHTML=`<span>${count+1}</span><input class="text-input" maxlength="100" aria-label="Step ${count+1}" /><button type="button" class="remove-step" aria-label="Remove step ${count+1}">×</button>`;container.append(item);item.querySelector('input').focus()});
    $('#assignment-review-steps').addEventListener('click',e=>{if(!e.target.classList.contains('remove-step'))return;const row=e.target.closest('.assignment-review-step');if(row)row.remove();[...$('#assignment-review-steps').querySelectorAll('.assignment-review-step')].forEach((item,i)=>{item.querySelector('span').textContent=i+1;item.querySelector('input').setAttribute('aria-label',`Step ${i+1}`);item.querySelector('button').setAttribute('aria-label',`Remove step ${i+1}`)})});
    $('#enable-live-coach').addEventListener('click',()=>{pendingCoachPrompt='';$('#ai-consent-dialog').showModal()});
    $('#ai-consent-accept').addEventListener('click',()=>{coachService.enableLive?.();$('#ai-consent-dialog').close();renderCoachMode();const pending=pendingCoachPrompt;pendingCoachPrompt='';if(pending)submitCoachMessage(pending)});
    $('#ai-consent-preview').addEventListener('click',()=>{coachService.usePreview?.();$('#ai-consent-dialog').close();renderCoachMode();const pending=pendingCoachPrompt;pendingCoachPrompt='';if(pending)submitCoachMessage(pending)});
    $('#use-local-coach').addEventListener('click',()=>{coachService.usePreview?.();renderCoachMode();notify('Local coach preview is on for this session.')});
    $('#ai-consent-close').addEventListener('click',()=>{$('#ai-consent-dialog').close();pendingCoachPrompt=''});
    $('#ai-consent-dialog').addEventListener('close',()=>{pendingCoachPrompt=''});
    $('#clear-chat').addEventListener('click',()=>clearCoachConversation());
    $('#retry-coach').addEventListener('click',()=>{if(coachLastPrompt)requestCoachReply(coachLastPrompt);else notify('There is no message to retry yet.')});
    $('#coach-resources-link').addEventListener('click',()=>showView('resources'));
    const openAccount=(create=false)=>{authCreateMode=create;updateAuthMode();$('#auth-dialog').showModal();updateAccount(window.DAYLIGHT_AUTH?.currentUser);if(create)setTimeout(()=>$('#auth-name').focus(),50)};$('#profile-menu').addEventListener('click',()=>openAccount());$('#account-settings').addEventListener('click',()=>openAccount());$('#account-prompt').addEventListener('click',()=>openAccount());
    $('#auth-signout').addEventListener('click',async()=>{try{await window.DAYLIGHT_AUTH?.signOut();$('#auth-dialog').close();notify('Signed out. This browser keeps your local space.')}catch(error){$('#auth-error').textContent=window.DAYLIGHT_AUTH?.errorMessage?.(error)||'Could not sign out. Try again.';$('#auth-error').classList.remove('hidden')}});
    let authCreateMode=false;const updateAuthMode=()=>{$('.auth-name-field').classList.toggle('hidden',!authCreateMode);$('.auth-account-fields').classList.remove('hidden');$('#auth-name').required=authCreateMode;$('#auth-email').required=true;$('#auth-password').required=true;$('#auth-title').textContent=authCreateMode?'Create your Daylight account':'Sign in to sync your space';$('#auth-copy').textContent='Keep tasks and preferences available wherever you use Daylight.';$('#auth-submit').textContent=authCreateMode?'Create account':'Sign in';$('#auth-mode-toggle').textContent=authCreateMode?'Already have an account? Sign in':'Need an account? Create one';$('#auth-password').setAttribute('autocomplete',authCreateMode?'new-password':'current-password');};$('#auth-mode-toggle').addEventListener('click',()=>{authCreateMode=!authCreateMode;updateAuthMode();if(authCreateMode)$('#auth-name').focus()});$('#auth-close').addEventListener('click',()=>$('#auth-dialog').close());
    $('#auth-form').addEventListener('submit',async e=>{e.preventDefault();const name=$('#auth-name').value.trim(),email=$('#auth-email').value.trim(),password=$('#auth-password').value,error=$('#auth-error'),submit=$('#auth-submit');error.classList.add('hidden');if(authCreateMode&&!name){error.textContent='Enter your name to create your Daylight account.';error.classList.remove('hidden');$('#auth-name').focus();return}submit.disabled=true;try{const action=authCreateMode?window.DAYLIGHT_AUTH?.signUp:window.DAYLIGHT_AUTH?.signIn;if(!action)throw new Error('Firebase is still loading');if(authCreateMode)await action(name,email,password);else await action(email,password);$('#auth-dialog').close();notify(authCreateMode?'Account created. Your space will sync here.':'Signed in. Your space will sync here.')}catch(err){error.textContent=window.DAYLIGHT_AUTH?.errorMessage?.(err)||err.message;error.classList.remove('hidden')}finally{submit.disabled=false}});
    window.addEventListener('daylight-auth-state',handleAuthState);
    window.addEventListener('daylight-sync-status',event=>updateSyncStatus(event.detail.status));
    document.addEventListener('click',e=>{
      const saveButton=e.target.closest('[data-save-resource]');if(saveButton){toggleSavedResource(saveButton.dataset.saveResource);return}
      const resourceButton=e.target.closest('[data-open-resource]');if(resourceButton){openResource(resourceButton.dataset.openResource);return}
      const promptButton=e.target.closest('[data-coach-prompt]');if(promptButton){sendCoachMessage(promptButton.dataset.coachPrompt);return}
      const feedback=e.target.closest('[data-coach-feedback]');if(feedback){coachFeedback(feedback.dataset.coachFeedback,Number(feedback.dataset.messageIndex));return}
      const addAction=e.target.closest('[data-coach-add-task]');if(addAction)transferCoachAction(Number(addAction.dataset.coachAddTask));
    });
    document.addEventListener('keydown',e=>{if(e.key==='/'&&$('#view-resources').classList.contains('active')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('#resource-search').focus()}});
  }
  function applySettings(){document.body.classList.toggle('reduce-motion',state.settings.reducedMotion);document.body.classList.toggle('soft-contrast',state.settings.softContrast);document.body.classList.toggle('dark-mode',state.settings.darkMode);$('#default-duration').value=String(state.settings.duration);$('#break-reminders').checked=state.settings.breaks;$('#reduce-motion').checked=state.settings.reducedMotion;$('#soft-contrast').checked=state.settings.softContrast;$('#dark-mode').checked=state.settings.darkMode;$('#celebrations').checked=state.settings.celebrations;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',state.settings.darkMode?'#171d1b':'#f7f7f3')}
  function updateAccount(user){const signedIn=Boolean(user),displayName=signedIn?(user.displayName||user.email?.split('@')[0]||'Student'):'',name=displayName||'Student';$('#profile-name').textContent=name;$('#today-name').textContent=displayName||'student';$('#account-prompt-label').textContent=displayName||'Sign in';$('#account-prompt').setAttribute('aria-label',signedIn?`Account: ${displayName}`:'Sign in to sync your tasks');$('#profile-status').textContent=signedIn?'Signed in · Cloud sync':'Student space · Local';$('#profile-avatar').textContent=name.charAt(0).toUpperCase();$('#account-setting-status').textContent=signedIn?'Signed in · Syncing privately':'Signed out · This browser only';$('#account-settings').textContent=signedIn?'Account':'Sign in';$('#account-setting-copy').textContent=signedIn?'Your tasks and preferences sync across devices.':'Sign in to sync your tasks and preferences across devices.';$('#auth-signout').classList.toggle('hidden',!signedIn);$('#auth-submit').classList.toggle('hidden',signedIn);$('#auth-mode-toggle').classList.toggle('hidden',signedIn);$('#auth-email').disabled=signedIn;$('#auth-password').disabled=signedIn;if(signedIn){$('#auth-title').textContent='Your Daylight account';$('#auth-copy').textContent=`Signed in as ${user.email}. Your tasks and preferences sync privately.`}else{$('#auth-title').textContent='Sign in to sync your space';$('#auth-copy').textContent='Keep tasks and preferences available wherever you use Daylight.'}}
  function updateSyncStatus(status){const signedIn=Boolean(window.DAYLIGHT_AUTH?.currentUser);const label=status==='pending'?'Syncing…':status==='error'?'Sync paused · Try again later':signedIn?'Signed in · Synced':'Signed out · This browser only';$('#account-setting-status').textContent=label;if(status==='error')notify('Your local changes are safe, but cloud sync needs attention.')}
  async function handleAuthState(event){const user=event.detail.user;updateAccount(user);if(!user){updateSyncStatus('signed-out');return}const revisionAtLoad=stateRevision;updateSyncStatus('pending');try{const remote=await window.DAYLIGHT_AUTH.loadState(user);if(revisionAtLoad!==stateRevision){window.DAYLIGHT_AUTH.queueSync(state);updateSyncStatus('pending');return}if(remote&&Array.isArray(remote.tasks)){state={...state,...remote,settings:{...initial.settings,...(remote.settings||{})}};applySettings();refresh();notify('Your synced space is ready.')}else{save();notify('Signed in. Your local space will sync here.')}}catch(error){console.error('Daylight account sync failed',error);updateSyncStatus('error');notify('Signed in, but cloud sync is unavailable right now.')}}
  function setDate(){const now=new Date();$('#header-date').textContent=now.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'}).toUpperCase();$('#date-day').textContent=now.getDate();$('#date-month').innerHTML=now.toLocaleDateString(undefined,{month:'short'}).toUpperCase()+'<br />'+now.toLocaleDateString(undefined,{weekday:'short'}).toUpperCase();const mondayOffset=(now.getDay()+6)%7;const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-mondayOffset);const sunday=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+6);$('#week-range').textContent=`${monday.toLocaleDateString(undefined,{month:'short',day:'numeric'})}–${sunday.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`.toUpperCase();const h=now.getHours();$('#greeting').textContent=h<12?'A FRESH START':h<17?'A LITTLE SPACE TO FOCUS':'A GENTLE END TO THE DAY'}
  initResourceFilters();bind();applyNavOrder();applySettings();setDate();refresh();renderResources();renderCoach();renderCoachMode();initializeCoachMode();
})();
