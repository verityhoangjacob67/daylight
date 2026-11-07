(() => {
  const STORE = 'daylight.student.v1';
  const day = 86400000;
  const dateAt = n => {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  };
  const calendarDay = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / day;
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
  function readLocal(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function normalizeState(value) {
    const source = value && Array.isArray(value.tasks) ? value : structuredClone(initial);
    const nonnegative = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
    return {
      ...source,
      tasks: source.tasks.filter(task => task && typeof task.id === 'string' && typeof task.title === 'string').map(task => {
        const steps = Array.isArray(task.steps) && task.steps.length ? task.steps.map(step => typeof step === 'string' ? step : task.title) : [task.title];
        return {
          ...task, steps, done: steps.map((_, index) => task.done?.[index] === true),
          subject: typeof task.subject === 'string' ? task.subject : '',
          due: typeof task.due === 'string' ? task.due : '',
          resumeNote: typeof task.resumeNote === 'string' ? task.resumeNote : ''
        };
      }),
      settings: {...initial.settings, ...source.settings, duration: [0, 10, 15, 25].includes(source.settings?.duration) ? source.settings.duration : initial.settings.duration},
      events: Array.isArray(source.events) ? source.events.filter(event => typeof event?.at === 'string') : [],
      savedResources: Array.isArray(source.savedResources) ? source.savedResources.filter(id => typeof id === 'string') : [],
      focusMinutes: nonnegative(source.focusMinutes),
      focusRemainder: nonnegative(source.focusRemainder) % 60_000,
      returns: nonnegative(source.returns)
    };
  }
  let state = normalizeState(readLocal(STORE));
  let workspace = null;
  let currentTaskId = null, currentStep = 0, currentFilter = 'all', toastTimer;
  let timerRemaining = state.settings.duration * 60_000, timerDeadline = 0, timerStarted = 0, timerInterval;
  const resources = Array.isArray(window.DAYLIGHT_RESOURCES) ? window.DAYLIGHT_RESOURCES : [];
  const filterResources = window.DAYLIGHT_FILTER_RESOURCES || ((items)=>items);
  let resourceSearch = '', resourceCategory = 'all', resourceFormat = 'all', resourceTime = 'all', savedOnly = false, resourceSearchTimer;
  let coachMessages = [], coachContext = {challenge:'',attempted:[],preferred:''}, coachBusy = false, coachLastPrompt = '', coachRequest = null, pendingAssignmentFile = null, assignmentRequest = null;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function persist() {
    try {
      const key = workspace ? STORE + '.account.' + workspace.user.uid : STORE;
      const value = workspace ? {state, base: workspace.base, dirty: workspace.dirty} : state;
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      notify('Browser storage is unavailable. Changes may be lost if you reload.');
    }
  }
  function save() {
    if (workspace) {
      workspace.dirty = newId();
    }
    persist();
    scheduleSync();
  }
  const doneCount = t => t.done.filter(Boolean).length;
  const dueLabel = value => {
    if (!value) return 'No due date';
    const now = new Date(); now.setHours(0,0,0,0);
    const due = new Date(value+'T00:00:00'); const diff = calendarDay(due) - calendarDay(now);
    if (!Number.isFinite(diff)) return 'No due date';
    if (diff < 0) return 'Past due · reschedule any time';
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    return 'Due '+due.toLocaleDateString(undefined,{month:'short',day:'numeric'});
  };
  const subjectClass = s => /math|algebra/i.test(s)?'math':/english|writing/i.test(s)?'english':/history/i.test(s)?'history':'';
  const subjectIcon = s => /math|algebra/i.test(s)?'∑':/english|writing/i.test(s)?'Aa':/history/i.test(s)?'◷':/biology/i.test(s)?'❋':'✎';
  function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500)}
  function showView(name){
    if(name!=='focus'&&$('#view-focus').classList.contains('active')){stopTimer()}
    if(name!=='coach' && $('#view-coach').classList.contains('active')) clearCoachConversation(false);
    $$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+name));
    $$('[data-view]').forEach(button=>{
      const active=button.dataset.view===name;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    if(name==='today'){setDate();renderHome()}
    if(name==='progress'){setDate();renderWeek()}
    if(name==='tasks') renderTasks();
    if(name==='resources') renderResources();
    if(name==='coach') renderCoach();
    $('#view-'+name+' h1').focus({preventScroll:true});
    window.scrollTo({top:0,behavior:state.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  function activeTask(){return state.tasks.find(t=>t.id===currentTaskId)}
  function firstOpenTask(){return state.tasks.find(t=>t.done.some(x=>!x))||null}
  function firstOpenStep(t){return t?.done.findIndex(x=>!x) ?? -1}
  function resumeIndex(task) {
    return Number.isInteger(task.resumeStep) && task.done[task.resumeStep] === false ? task.resumeStep : firstOpenStep(task);
  }
  function renderHome(){
    const open=state.tasks.filter(t=>t.done.some(x=>!x));
    const pending=state.tasks.filter(t=>t.today&&!t.done.every(Boolean));
    const priorities=pending.slice(0,3);
    const n=pending.length;
    $('#today-count').textContent=n;
    const finishedToday=state.tasks.filter(t=>t.today&&t.done.every(Boolean)).length;
    const pct=n?Math.round(finishedToday/(n+finishedToday)*100):100;
    $('#day-progress-fill').style.width=pct+'%';$('#day-progress-label').textContent=`${finishedToday} of ${n+finishedToday} priorities`;$('#day-progress-pct').textContent=pct+'%';
    const next=priorities[0]||open[0];
    $('#start-next-label').textContent=next?'Start this step':'Add a task';
    if(next){const ix=resumeIndex(next);$('#next-subject').textContent=next.subject||'Schoolwork';$('#next-task-title').textContent=ix>=0?next.steps[ix]:next.title;$('#next-task-detail').innerHTML=`${esc(next.subject||'Schoolwork')} <span class="sep">·</span> ${ix>=0?'Step '+(ix+1)+' of '+next.steps.length:'Ready when you are'}`;$('#start-next').dataset.task=next.id;}else{$('#next-subject').textContent='Schoolwork';$('#next-task-title').textContent='You’ve done enough for now';$('#next-task-detail').textContent='Take a breath. You can add a task whenever.';$('#start-next').dataset.task='';}
    $('#priority-list').innerHTML= priorities.length? priorities.map(t=>`<div class="priority-row ${t.done.every(Boolean)?'is-done':''}"><button class="check-button" data-toggle-task="${esc(t.id)}" aria-label="Complete the next step in ${esc(t.title)}">✓</button><div class="priority-copy"><div class="priority-title">${esc(t.title)}</div><div class="priority-sub">${esc(t.subject||'Schoolwork')} · ${doneCount(t)} of ${t.steps.length} steps</div></div><span class="priority-due ${t.due&&t.due<=dateAt(1)?'soon':''}">${esc(dueLabel(t.due))}</span><button class="priority-open" data-focus-task="${esc(t.id)}" aria-label="Start ${esc(t.title)}">›</button></div>`).join('') : `<div class="empty-state" style="margin:24px auto"><h2>Room to breathe.</h2><p>There are no priorities left for today.</p></div>`;
    $('#nav-task-count').textContent=open.length;
    const res=state.tasks.find(t=>t.done[t.resumeStep]===false)||firstOpenTask();
    $('#resume-card').classList.toggle('hidden',!res);
    if(res){const ix=resumeIndex(res);$('#resume-title').textContent=res.title;$('#resume-button').dataset.task=res.id;$('#resume-button').setAttribute('aria-label','Resume '+res.title);$('#resume-card p').textContent=res.resumeNote.trim()||'Pick up: '+res.steps[ix];}
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
    list.innerHTML=tasks.map(t=>`<article class="task-card"><div class="task-card-top"><div class="task-color ${subjectClass(t.subject)}">${subjectIcon(t.subject)}</div><div class="task-card-heading"><h3>${esc(t.title)}</h3><p>${esc(t.subject||'Schoolwork')} · ${doneCount(t)} of ${t.steps.length} steps</p></div><span class="task-due ${t.due&&t.due<=dateAt(1)&&!t.done.every(Boolean)?'soon':''}">${esc(dueLabel(t.due))}</span></div><ul class="task-steps">${t.steps.map((s,i)=>`<li class="task-step ${t.done[i]?'done':''}"><button class="mini-check ${t.done[i]?'checked':''}" data-step-task="${esc(t.id)}" data-step-index="${i}" aria-label="${t.done[i]?'Reopen':'Complete'} step: ${esc(s)}">✓</button><span>${esc(s)}</span></li>`).join('')}</ul><div class="task-card-footer"><span class="task-progress-copy">${t.done.every(Boolean)?'Finished · nicely done':'Step '+(firstOpenStep(t)+1)+' of '+t.steps.length}</span><div class="task-progress-track" aria-label="Task progress"><span style="width:${Math.round(doneCount(t)/t.steps.length*100)}%"></span></div><div class="task-actions"><button class="small-action" data-focus-task="${esc(t.id)}">${t.done.every(Boolean)?'Review':'Start a step'}</button><button class="small-action" data-edit-task="${esc(t.id)}">Edit task</button></div></div></article>`).join('');
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
    $('#resource-detail').innerHTML=`<span class="resource-kind">${esc(r.kind)}</span><p class="eyebrow resource-detail-category">${esc(r.category)}</p><h2 id="resource-detail-title">${esc(r.title)}</h2><p class="resource-detail-description">${esc(r.description)}</p><div class="detail-meta"><div><small>PUBLISHER</small><b>${esc(r.publisher)}</b></div><div><small>FORMAT · READING TIME</small><b>${esc(r.format)} · about ${r.minutes} minutes</b></div><div><small>TYPE</small><b>${esc(r.kind)}</b></div></div><div class="resource-purpose"><b>What this is for</b><p>${esc(r.purpose)}</p></div><p class="resource-disclaimer">This is general information. It isn’t individualized medical advice or a substitute for support from a qualified professional.</p><div class="resource-detail-actions"><button type="button" class="button-secondary" data-save-resource="${esc(r.id)}" aria-pressed="${saved}">${saved?'♥ Saved':'♡ Save for later'}</button><a class="button-primary" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Visit source <span>↗</span></a></div>`;
    $('#resource-dialog').showModal();
  }
  function toggleSavedResource(id){
    const resource=resources.find(item=>item.id===id);if(!resource)return;
    const exists=state.savedResources.includes(id);
    state.savedResources=exists?state.savedResources.filter(x=>x!==id):[...state.savedResources,id];save();renderResources();
    const saved=!exists;$$(`[data-save-resource="${id}"]`).forEach(button=>{button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',`${saved?'Remove saved resource':'Save resource'}: ${resource.title}`);button.textContent=button.classList.contains('button-secondary')?(saved?'♥ Saved':'♡ Save for later'):(saved?'♥':'♡');button.classList.toggle('saved',saved)});
    notify(exists?'Removed from saved resources.':'Saved for later.');
  }
  function renderCoach(){
    const intro=$('#coach-intro'),log=$('#coach-messages');
    intro.classList.toggle('hidden',coachMessages.length>0);log.classList.toggle('hidden',coachMessages.length===0);
    log.innerHTML=coachMessages.map(m=>{
      if(m.role==='user')return `<div class="chat-row user-row"><div class="chat-bubble user-bubble">${esc(m.text)}</div></div>`;
      const choices=m.choices?.length?`<div class="coach-choices">${m.choices.map(c=>`<button data-coach-prompt="${esc(c.text)}">${esc(c.label)}</button>`).join('')}</div>`:'';
      const advice=m.proposal&&!m.text.toLowerCase().includes(m.proposal.action.toLowerCase())?` ${m.proposal.action}`:'';
      return `<div class="chat-row assistant-row"><div class="coach-avatar small-avatar" aria-hidden="true">◌</div><div class="assistant-stack"><div class="chat-bubble assistant-bubble">${esc(m.text+advice)}</div>${choices}</div></div>`;
    }).join('')+(coachBusy?'<div class="chat-row assistant-row"><div class="coach-avatar small-avatar" aria-hidden="true">◌</div><div class="chat-bubble assistant-bubble typing" role="status">Thinking through one next step…</div></div>':'');
    $('#coach-send').disabled=coachBusy;$('#coach-input').disabled=coachBusy;
    if(coachMessages.length)log.scrollTop=log.scrollHeight;
  }
  // Mock service is intentionally separate from the local task breakdown function above.
  const coachService=window.DAYLIGHT_COACH_SERVICE||{reply:async()=>{throw new Error('Coach service is not configured')}};
  function renderCoachMode(){
    const liveAvailable=coachService.liveAvailable;
    const liveEnabled=coachService.mode==='live-enabled';
    $('#coach-mode-title').textContent=liveEnabled?'Live AI coach':liveAvailable?'Live AI available':'Local coach preview';
    $('#coach-mode-copy').textContent=liveEnabled?'Your message and brief coach choices are sent to OpenRouter, which routes them to a free AI model. Free models may log or train on messages. Daylight does not save this chat; avoid identifying details.':coachService.liveAvailable?'Scripted suggestions are local. You can optionally enable live AI for this session; messages will be sent to OpenRouter.':'Scripted suggestions only. Messages stay in this tab and clear when you leave or choose “Clear conversation.”';
    $('#enable-live-coach').classList.toggle('hidden',!coachService.liveAvailable||liveEnabled);
    $('#use-local-coach').classList.toggle('hidden',!liveEnabled);
    $('#choose-assignment-pdf').disabled=!liveAvailable||Boolean(assignmentRequest);
    if(!coachService.liveAvailable)setAssignmentStatus('PDF breakdown needs live AI. You can still add a task manually.');
  }
  async function initializeCoachMode(){
    if(coachService.checkStatus)await coachService.checkStatus();
    renderCoachMode();
    if(coachService.liveAvailable)setAssignmentStatus('PDFs up to 3 MB. The file is sent to OpenRouter only after you confirm.');
  }
  async function requestCoachReply(text){
    if(coachBusy)return;
    const controller=new AbortController();
    coachRequest=controller;
    coachBusy=true;
    $('#coach-error').classList.add('hidden');
    renderCoach();
    const timeout=setTimeout(()=>controller.abort(),45_000);
    try {
      const result=await coachService.reply(text,coachContext,controller.signal);
      if(coachRequest===controller)coachMessages.push({role:'assistant',...result});
    } catch {
      if(coachRequest===controller)$('#coach-error').classList.remove('hidden');
    } finally {
      clearTimeout(timeout);
      if(coachRequest===controller){
        coachRequest=null;
        coachBusy=false;
        renderCoach();
        if($('#view-coach').classList.contains('active')&&document.activeElement===document.body)$('#coach-input').focus();
      }
    }
  }
  async function submitCoachMessage(clean){
    coachLastPrompt=clean;coachMessages.push({role:'user',text:clean});$('#coach-input').value='';resizeCoachInput();
    await requestCoachReply(clean);
  }
  function resizeCoachInput(){
    const input=$('#coach-input');if(!input)return;
    const maxHeight=110;
    input.style.height='auto';
    const needed=input.scrollHeight+2;
    input.style.height=Math.min(needed,maxHeight)+'px';
    input.style.overflowY=needed>maxHeight?'auto':'hidden';
  }
  async function sendCoachMessage(text){
    const clean=text.trim().slice(0,500);if(!clean||coachBusy)return;
    await submitCoachMessage(clean);
  }
  function clearCoachConversation(showNotice=true){coachRequest?.abort();coachRequest=null;coachMessages=[];coachContext={challenge:'',attempted:[],preferred:''};coachBusy=false;coachLastPrompt='';$('#coach-input').value='';resizeCoachInput();$('#coach-error').classList.add('hidden');renderCoach();if(showNotice)notify('Conversation cleared from this tab.');}
  function setAssignmentStatus(message,isError=false){const status=$('#assignment-upload-status');status.textContent=message;status.classList.toggle('is-error',isError)}
  function chooseAssignmentFile(file){
    if(!file)return;
    if(!/\.pdf$/i.test(file.name)||file.type&&file.type!=='application/pdf'){setAssignmentStatus('Choose a PDF file to continue.',true);return}
    if(file.size>3*1024*1024){setAssignmentStatus('This PDF is over 3 MB. Choose a smaller file.',true);return}
    if(!file.size){setAssignmentStatus('That PDF is empty. Choose another file.',true);return}
    if(!coachService.liveAvailable){setAssignmentStatus('Live AI is not available for this app yet. You can still add a task manually.',true);return}
    pendingAssignmentFile=file;$('#assignment-consent-file').textContent=`${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;$('#assignment-consent-dialog').showModal();
  }
  function renderAssignmentReview(result){
    $('#assignment-task-title').value=result.title||'Assignment task';$('#assignment-task-subject').value=result.subject||'';$('#assignment-task-due').value='';
    $('#assignment-review-steps').innerHTML=result.steps.map((step,i)=>`<div class="assignment-review-step"><span>${i+1}</span><input class="text-input" maxlength="100" aria-label="Step ${i+1}" value="${esc(step)}" /><button type="button" class="remove-step" aria-label="Remove step ${i+1}">×</button></div>`).join('');
    $('#assignment-review-error').classList.add('hidden');$('#assignment-review-dialog').showModal();
  }
  async function submitAssignmentFile(){
    if(!pendingAssignmentFile||assignmentRequest)return;
    const dialog=$('#assignment-consent-dialog'),button=$('#assignment-consent-send');
    const controller=new AbortController();
    assignmentRequest=controller;
    button.disabled=true;
    button.textContent='Reading the PDF…';
    setAssignmentStatus('Reading the assignment…');
    const timeout=setTimeout(()=>controller.abort(),45_000);
    try {
      const result=await coachService.breakdown(pendingAssignmentFile,controller.signal);
      if(!dialog.open||controller.signal.aborted)return;
      dialog.close();
      if(!result.steps.length){
        setAssignmentStatus('The PDF did not contain a clear assignment prompt. Try a clearer copy or add the task manually.',true);
        return;
      }
      setAssignmentStatus('Suggestions are ready to review.');
      renderAssignmentReview(result);
    } catch(error) {
      if(dialog.open){
        dialog.close();
        setAssignmentStatus(controller.signal.aborted?'The PDF request timed out. Try again.':error.message||'We couldn’t read that PDF. Try again.',true);
      }
    } finally {
      clearTimeout(timeout);
      assignmentRequest=null;
      button.disabled=false;
      button.textContent='Send PDF for ideas';
      renderCoachMode();
    }
  }
  function saveAssignmentBreakdown(event){
    event.preventDefault();const title=$('#assignment-task-title').value.trim(),steps=$$('#assignment-review-steps input').map(input=>input.value.trim()).filter(Boolean),error=$('#assignment-review-error');
    if(!title){error.textContent='Add a task name before saving.';error.classList.remove('hidden');$('#assignment-task-title').focus();return}
    if(!steps.length){error.textContent='Add at least one step so you have a place to begin.';error.classList.remove('hidden');$('#assignment-review-steps input')?.focus();return}
    newTask({title:title.slice(0,100),subject:$('#assignment-task-subject').value.trim().slice(0,40),due:$('#assignment-task-due').value,steps:steps.slice(0,12)});
    $('#assignment-review-dialog').close();$('#assignment-pdf').value='';setAssignmentStatus('Task saved. You can change the steps any time.');refresh();showView('tasks');notify('Assignment task saved. Review the steps whenever you like.');
  }
  function renderWeek(){
    const counts=Array(7).fill(0);
    const today=new Date(), mondayOffset=(today.getDay()+6)%7;
    const monday=calendarDay(today)-mondayOffset;
    for(const event of state.events){
      const date=new Date(/^\d{4}-\d{2}-\d{2}$/.test(event.at)?event.at+'T00:00:00':event.at);
      const index=calendarDay(date)-monday;
      if(index>=0&&index<7)counts[index]++;
    }
    const max=Math.max(2,...counts);
    const names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    $('#week-bars').innerHTML=names.map((name,i)=>`<div class="week-day ${i===mondayOffset?'today':''}"><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="height:${counts[i]/max*100}%"></div></div><span>${name}</span><span class="sr-only">: ${counts[i]} steps</span></div>`).join('');
  }
  function renderWorkspace(){renderHome();renderTasks();renderWeek()}
  function refresh(){renderWorkspace();save()}
  function openTaskForm(task=null,prefill=null){const d=$('#task-dialog'),draft=task||prefill;$('#task-form').dataset.edit=task?.id||'';$('#dialog-title').textContent=task?'Edit task':prefill?'Shape this into a task':'Add a task';$('#task-form-error').classList.add('hidden');$('#task-name').removeAttribute('aria-invalid');$('#task-name').value=draft?.title||'';$('#task-subject').value=draft?.subject||'';$('#task-due').value=draft?.due||'';renderStepInputs(draft?.steps||[]);d.showModal()}
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
  function beginFocus(id,returning=false){
    const task=state.tasks.find(item=>item.id===id)||firstOpenTask();
    if(!task){notify('Add a task to begin.');return}
    stopTimer();
    currentTaskId=task.id;
    const index=resumeIndex(task);
    const reviewing=index<0;
    currentStep=reviewing?0:index;
    if(!reviewing){
      task.resumeStep=currentStep;
      if(returning)state.returns++;
      save();
    }
    const label=reviewing?task.title:task.steps[currentStep];
    $('#focus-title').textContent=label;
    $('#focus-task-name').textContent=reviewing?'All steps complete':(task.subject||'Schoolwork')+' · '+task.title;
    $('#focus-step').classList.toggle('hidden',reviewing);
    $('#resume-note-field').classList.toggle('hidden',reviewing);
    $('#focus-step-number').textContent=currentStep+1;
    $('#focus-step-text').textContent=label;
    $('#step-done').setAttribute('aria-label','Mark step complete: '+label);
    $('#resume-note').value=task.resumeNote;
    $('#resume-note-status').textContent='Your current step is remembered automatically.';
    resetTimer();
    showView('focus');
  }

  function resetTimer(){
    stopTimer();
    const minutes=state.settings.duration;
    timerRemaining=minutes*60_000;
    $('#timer-toggle').disabled=!minutes;
    $('#timer-caption').textContent=minutes?'OPTIONAL FOCUS TIMER':'NO TIMER';
    $('#focus-encouragement').textContent=minutes?'You can pause or stop whenever you need.':'Use as much or as little time as you like.';
    $$('.timer-preset').forEach(button=>{
      const active=Number(button.dataset.minutes)===minutes;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    updateTimer();
  }
  function updateTimer(){
    const seconds=Math.ceil(timerRemaining/1000);
    $('#timer-display').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
    $('#timer-face').classList.toggle('running',Boolean(timerDeadline));
    $('#timer-toggle').textContent=timerDeadline?'Ⅱ Pause':timerRemaining===0&&state.settings.duration?'▶ Start another':timerRemaining<state.settings.duration*60_000?'▶ Resume timer':'▶ Start timer';
  }
  function stopTimer(){
    if(!timerDeadline)return;
    const now=Date.now();
    timerRemaining=Math.max(0,timerDeadline-now);
    const elapsed=Math.max(0,Math.min(now,timerDeadline)-timerStarted);
    const total=state.focusRemainder+elapsed;
    state.focusMinutes+=Math.floor(total/60_000);
    state.focusRemainder=total%60_000;
    timerDeadline=0;
    clearInterval(timerInterval);
    updateTimer();
    renderHome();
    save();
  }
  function toggleTimer(){
    if(timerDeadline){
      stopTimer();
      $('#focus-encouragement').textContent='Paused. Take the time you need.';
      return;
    }
    if(!state.settings.duration)return;
    if(!timerRemaining)timerRemaining=state.settings.duration*60_000;
    timerStarted=Date.now();
    timerDeadline=timerStarted+timerRemaining;
    $('#focus-encouragement').textContent='You can pause or stop whenever you need.';
    timerInterval=setInterval(()=>{
      timerRemaining=Math.max(0,timerDeadline-Date.now());
      if(timerRemaining){updateTimer();return}
      stopTimer();
      $('#focus-encouragement').textContent='Your timer is up. Keep going, take a break, or stop here.';
      notify(state.settings.breaks?'Focus time is up. Take a break if you’d like.':'Focus time is up.');
    },250);
    updateTimer();
  }
  function finishStep(){
    const task=activeTask();
    if(!task||task.done[currentStep]!==false)return;
    stopTimer();
    task.done[currentStep]=true;
    state.events.push({at:new Date().toISOString(),type:'step'});
    const next=firstOpenStep(task);
    if(next>=0)task.resumeStep=next;
    else delete task.resumeStep;
    task.resumeNote='';
    refresh();
    $('#done-title').textContent=next<0?'You finished this task.':'You made a little progress.';
    $('#done-message').textContent=next<0?task.title+' is done. Take a moment to notice that.':'You showed up for this step. That matters.';
    $('#done-next').textContent=next<0?'Choose another small step →':'One more small step →';
    $('#done-dialog').showModal();
  }
  function toggleStep(id,index){
    const task=state.tasks.find(item=>item.id===id);
    if(!task||typeof task.done[index]!=='boolean')return;
    task.done[index]=!task.done[index];
    if(task.done[index])state.events.push({at:new Date().toISOString(),type:'step'});
    if(task.done[task.resumeStep]!==false){
      const next=firstOpenStep(task);
      if(next>=0)task.resumeStep=next;
      else delete task.resumeStep;
      task.resumeNote='';
    }
    refresh();
    notify(task.done[index]?'Step complete. That counts.':'Step reopened. You can take it from here.');
  }
  function editTask(task,{title,subject,due,steps}){
    const used=new Set();
    const previous=steps.map(step=>{
      const index=task.steps.findIndex((old,i)=>old===step&&!used.has(i));
      if(index>=0)used.add(index);
      return index;
    });
    const resume=previous.indexOf(task.resumeStep);
    const done=previous.map(index=>task.done[index]===true);
    Object.assign(task,{title,subject,due,steps,done});
    if(resume>=0&&!done[resume])task.resumeStep=resume;
    else {
      delete task.resumeStep;
      task.resumeNote='';
    }
  }
  const newId=()=>globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2);
  function newTask(details){
    const id='task-'+newId();
    state.tasks.unshift({id,...details,done:details.steps.map(()=>false),today:true,resumeNote:''});
  }
  function bind(){
    enableNavReorder();
    $('.brand').addEventListener('click',event=>{event.preventDefault();showView('today')});
    $$('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
    $$('[data-go="tasks"]').forEach(b=>b.addEventListener('click',()=>showView('tasks')));
    $('#add-task').addEventListener('click',()=>openTaskForm());$('#quick-add').addEventListener('click',()=>openTaskForm());$('#capture-button').addEventListener('click',()=>openTaskForm());$('#empty-add').addEventListener('click',()=>openTaskForm());
    $('#task-close').addEventListener('click',()=>$('#task-dialog').close());
    $('#cancel-task').addEventListener('click',()=>$('#task-dialog').close());
    $('#task-form').addEventListener('submit',event=>{
      event.preventDefault();
      const title=$('#task-name').value.trim(),error=$('#task-form-error');
      if(!title){
        error.textContent='Add a task name so you know what to start.';
        error.classList.remove('hidden');
        $('#task-name').setAttribute('aria-invalid','true');
        $('#task-name').focus();
        return;
      }
      const editId=event.currentTarget.dataset.edit;
      const task=state.tasks.find(item=>item.id===editId);
      if(editId&&!task){$('#task-dialog').close();return}
      const steps=$$('#step-inputs input').map(input=>input.value.trim()).filter(Boolean);
      const details={title,subject:$('#task-subject').value.trim(),due:$('#task-due').value,steps:steps.length?steps:[task?title:'Open '+title]};
      if(task)editTask(task,details);
      else newTask(details);
      $('#task-dialog').close();
      refresh();
      if(task&&$('#view-focus').classList.contains('active'))beginFocus(task.id);
      if(task)$$('[data-edit-task]').find(button=>button.dataset.editTask===task.id)?.focus();
      notify(task?'Task updated.':'Task saved. One small step is ready.');
    });
    $('#add-step').addEventListener('click',()=>{const current=$$('#step-inputs input').map(x=>x.value);renderStepInputs([...current,'']);$$('#step-inputs input').at(-1)?.focus()});$('#suggest-steps').addEventListener('click',suggestSteps);$('#step-inputs').addEventListener('click',e=>{if(e.target.classList.contains('remove-step')){const row=e.target.closest('.step-field');if($$('.step-field').length>1)row.remove();else row.querySelector('input').value='';$$('.step-field').forEach((r,i)=>{r.querySelector('.step-bullet').textContent=i+1;r.querySelector('input').setAttribute('aria-label','Step '+(i+1));r.querySelector('button').setAttribute('aria-label','Remove step '+(i+1))});$('#step-inputs input')?.focus()}});
    $('#task-list').addEventListener('click',e=>{const step=e.target.closest('[data-step-task]');if(step){toggleStep(step.dataset.stepTask,Number(step.dataset.stepIndex));$$('[data-step-task]').find(button=>button.dataset.stepTask===step.dataset.stepTask&&button.dataset.stepIndex===step.dataset.stepIndex)?.focus();return}const focus=e.target.closest('[data-focus-task]');if(focus){beginFocus(focus.dataset.focusTask);return}const edit=e.target.closest('[data-edit-task]');if(edit){const task=state.tasks.find(item=>item.id===edit.dataset.editTask);if(task)openTaskForm(task)}});
    $('#priority-list').addEventListener('click',e=>{const check=e.target.closest('[data-toggle-task]');if(check){const t=state.tasks.find(x=>x.id===check.dataset.toggleTask);if(t){const i=firstOpenStep(t);if(i>=0)toggleStep(t.id,i);else notify('This task is already finished.')}return}const b=e.target.closest('[data-focus-task]');if(b)beginFocus(b.dataset.focusTask)});
    $$('.filter-tab').forEach(b=>b.addEventListener('click',()=>{$$('.filter-tab').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');currentFilter=b.dataset.filter;renderTasks()}));$('#sort-tasks').addEventListener('change',renderTasks);
    $('#start-next').addEventListener('click',()=>{if($('#start-next').dataset.task)beginFocus($('#start-next').dataset.task);else openTaskForm()});$('#resume-button').addEventListener('click',()=>beginFocus($('#resume-button').dataset.task,true));$('#focus-back').addEventListener('click',()=>showView('today'));$('#step-done').addEventListener('click',finishStep);$('#timer-toggle').addEventListener('click',toggleTimer);
    $('#resume-note').addEventListener('input',()=>{const t=activeTask();if(!t)return;t.resumeStep=currentStep;t.resumeNote=$('#resume-note').value.trim();save();$('#resume-note-status').textContent='Note saved for your next visit.'});
    $$('.timer-preset').forEach(button=>button.addEventListener('click',()=>{stopTimer();state.settings.duration=Number(button.dataset.minutes);resetTimer();save()}));
    $('#focus-break').addEventListener('click',()=>{stopTimer();if(state.settings.breaks)notify('Break time. Come back whenever you’re ready.');else notify('Timer paused. Take the break you need.');$('#focus-encouragement').textContent='Take a breather. You can return when you’re ready.'});$('#focus-finish').addEventListener('click',()=>showView('today'));
    $('#done-next').addEventListener('click',()=>{const t=activeTask();$('#done-dialog').close();if(t&&!t.done.every(Boolean))beginFocus(t.id,true);else{const next=firstOpenTask();if(next)beginFocus(next.id,true);else openTaskForm()}});$('#done-today').addEventListener('click',()=>{$('#done-dialog').close();showView('today')});$('#done-dialog').addEventListener('close',()=>{if($('#view-focus').classList.contains('active')&&activeTask()?.done[currentStep])showView('today')});
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
    $('#assignment-pdf').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';chooseAssignmentFile(file)});
    $('#assignment-consent-send').addEventListener('click',submitAssignmentFile);
    for(const id of ['assignment-consent-cancel','assignment-consent-close'])$('#'+id).addEventListener('click',()=>$('#assignment-consent-dialog').close());
    $('#assignment-consent-dialog').addEventListener('close',()=>{
      pendingAssignmentFile=null;
      if(assignmentRequest){
        assignmentRequest.abort();
        setAssignmentStatus('PDF request canceled.');
      }
    });
    $('#assignment-review-form').addEventListener('submit',saveAssignmentBreakdown);
    $('#assignment-review-close').addEventListener('click',()=>$('#assignment-review-dialog').close());
    $('#assignment-review-cancel').addEventListener('click',()=>$('#assignment-review-dialog').close());
    $('#assignment-review-add-step').addEventListener('click',()=>{const container=$('#assignment-review-steps'),count=container.querySelectorAll('.assignment-review-step').length;if(count>=12){notify('Keep the breakdown to 12 steps or fewer.');return}const item=document.createElement('div');item.className='assignment-review-step';item.innerHTML=`<span>${count+1}</span><input class="text-input" maxlength="100" aria-label="Step ${count+1}" /><button type="button" class="remove-step" aria-label="Remove step ${count+1}">×</button>`;container.append(item);item.querySelector('input').focus()});
    $('#assignment-review-steps').addEventListener('click',e=>{if(!e.target.classList.contains('remove-step'))return;const row=e.target.closest('.assignment-review-step');if(row)row.remove();[...$('#assignment-review-steps').querySelectorAll('.assignment-review-step')].forEach((item,i)=>{item.querySelector('span').textContent=i+1;item.querySelector('input').setAttribute('aria-label',`Step ${i+1}`);item.querySelector('button').setAttribute('aria-label',`Remove step ${i+1}`)})});
    $('#coach-input').addEventListener('keydown',e=>{if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.keyCode===229)return;e.preventDefault();if(e.currentTarget.value.trim())e.currentTarget.form.requestSubmit()});
    $('#coach-input').addEventListener('input',resizeCoachInput);
    resizeCoachInput();
    $('#enable-live-coach').addEventListener('click',()=>$('#ai-consent-dialog').showModal());
    $('#ai-consent-accept').addEventListener('click',()=>{coachService.enableLive?.();$('#ai-consent-dialog').close();renderCoachMode()});
    $('#ai-consent-preview').addEventListener('click',()=>{coachService.usePreview?.();$('#ai-consent-dialog').close();renderCoachMode()});
    $('#use-local-coach').addEventListener('click',()=>{coachService.usePreview?.();clearCoachConversation(false);renderCoachMode();notify('Local coach preview is on for this session.')});
    $('#ai-consent-close').addEventListener('click',()=>$('#ai-consent-dialog').close());
    $('#clear-chat').addEventListener('click',()=>clearCoachConversation());
    $('#retry-coach').addEventListener('click',()=>{if(coachLastPrompt)requestCoachReply(coachLastPrompt);else notify('There is no message to retry yet.')});
    $('#coach-resources-link').addEventListener('click',()=>showView('resources'));
    const openAccount=(create=false)=>{authCreateMode=create;updateAuthMode();$('#auth-dialog').showModal();updateAccount(window.DAYLIGHT_AUTH?.currentUser);if(create)setTimeout(()=>$('#auth-name').focus(),50)};$('#profile-menu').addEventListener('click',()=>openAccount());$('#account-settings').addEventListener('click',()=>openAccount());$('#account-prompt').addEventListener('click',()=>openAccount());
    $('#auth-signout').addEventListener('click',async()=>{try{await window.DAYLIGHT_AUTH?.signOut();$('#auth-dialog').close();notify('Signed out. This browser keeps your local space.')}catch(error){$('#auth-error').textContent=window.DAYLIGHT_AUTH?.errorMessage?.(error)||'Could not sign out. Try again.';$('#auth-error').classList.remove('hidden')}});
    let authCreateMode=false;const updateAuthMode=()=>{$('.auth-name-field').classList.toggle('hidden',!authCreateMode);$('.auth-account-fields').classList.remove('hidden');$('#auth-name').required=authCreateMode;$('#auth-email').required=true;$('#auth-password').required=true;$('#auth-title').textContent=authCreateMode?'Create your Daylight account':'Sign in to sync your space';$('#auth-copy').textContent='Keep tasks and preferences available wherever you use Daylight.';$('#auth-submit').textContent=authCreateMode?'Create account':'Sign in';$('#auth-mode-toggle').textContent=authCreateMode?'Already have an account? Sign in':'Need an account? Create one';$('#auth-password').setAttribute('autocomplete',authCreateMode?'new-password':'current-password');};$('#auth-mode-toggle').addEventListener('click',()=>{authCreateMode=!authCreateMode;updateAuthMode();$('#auth-error').classList.add('hidden');(authCreateMode?$('#auth-name'):$('#auth-email')).focus()});$('#auth-close').addEventListener('click',()=>$('#auth-dialog').close());
    $('#auth-form').addEventListener('submit',async e=>{e.preventDefault();const name=$('#auth-name').value.trim(),email=$('#auth-email').value.trim(),password=$('#auth-password').value,error=$('#auth-error'),submit=$('#auth-submit');error.classList.add('hidden');if(authCreateMode&&!name){error.textContent='Enter your name to create your Daylight account.';error.classList.remove('hidden');$('#auth-name').focus();return}submit.disabled=true;try{const action=authCreateMode?window.DAYLIGHT_AUTH?.signUp:window.DAYLIGHT_AUTH?.signIn;if(!action)throw new Error('Firebase is still loading');if(authCreateMode)await action(name,email,password);else await action(email,password);$('#auth-dialog').close();notify(authCreateMode?'Account created. Your space will sync here.':'Signed in. Your space will sync here.')}catch(err){error.textContent=window.DAYLIGHT_AUTH?.errorMessage?.(err)||err.message;error.classList.remove('hidden')}finally{submit.disabled=false}});
    window.addEventListener('daylight-auth-state',handleAuthState);
    window.addEventListener('daylight-auth-profile',event=>updateAccount(event.detail.user));
    window.addEventListener('online',()=>{
      if(workspace?.needsLoad)loadWorkspace(workspace);
      else scheduleSync();
    });
    $('#sync-use-cloud').addEventListener('click',()=>resolveSyncConflict(false));
    $('#sync-use-local').addEventListener('click',()=>resolveSyncConflict(true));
    $('#auth-dialog').addEventListener('close',()=>{
      $('#auth-password').value='';
      $('#auth-error').classList.add('hidden');
    });
    document.addEventListener('click',e=>{
      const saveButton=e.target.closest('[data-save-resource]');if(saveButton){toggleSavedResource(saveButton.dataset.saveResource);if(!saveButton.isConnected)([...document.querySelectorAll('[data-save-resource]')].find(button=>button.dataset.saveResource===saveButton.dataset.saveResource)||$('#saved-only')).focus();return}
      const resourceButton=e.target.closest('[data-open-resource]');if(resourceButton){openResource(resourceButton.dataset.openResource);return}
      const promptButton=e.target.closest('[data-coach-prompt]');if(promptButton){sendCoachMessage(promptButton.dataset.coachPrompt);return}
    });
    document.addEventListener('keydown',e=>{if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&e.key==='/'&&!$('dialog[open]')&&$('#view-resources').classList.contains('active')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('#resource-search').focus()}});
  }
  function applySettings(){document.body.classList.toggle('reduce-motion',state.settings.reducedMotion);document.body.classList.toggle('soft-contrast',state.settings.softContrast);document.body.classList.toggle('dark-mode',state.settings.darkMode);$('#default-duration').value=String(state.settings.duration);$('#break-reminders').checked=state.settings.breaks;$('#reduce-motion').checked=state.settings.reducedMotion;$('#soft-contrast').checked=state.settings.softContrast;$('#dark-mode').checked=state.settings.darkMode;$('#celebrations').checked=state.settings.celebrations;$$('.done-spark,.progress-flower').forEach(icon=>icon.classList.toggle('hidden',!state.settings.celebrations));document.querySelector('meta[name="theme-color"]')?.setAttribute('content',state.settings.darkMode?'#171d1b':'#f7f7f3')}
  function updateAccount(user){const signedIn=Boolean(user),displayName=signedIn?(user.displayName||user.email?.split('@')[0]||'Student'):'',name=displayName||'Student';$('#profile-name').textContent=name;$('#today-name').textContent=displayName||'student';$('#account-prompt-label').textContent=displayName||'Sign in';$('#account-prompt').setAttribute('aria-label',signedIn?`Account: ${displayName}`:'Sign in to sync your tasks');$('#profile-status').textContent=signedIn?'Signed in · Cloud sync':'Student space · Local';$('#profile-avatar').textContent=name.charAt(0).toUpperCase();$('#account-settings').textContent=signedIn?'Account':'Sign in';$('#account-setting-copy').textContent=signedIn?'Your tasks and preferences sync across devices.':'Sign in to sync your tasks and preferences across devices.';$('#auth-signout').classList.toggle('hidden',!signedIn);$('#auth-submit').classList.toggle('hidden',signedIn);$('#auth-mode-toggle').classList.toggle('hidden',signedIn);$('.auth-account-fields').classList.toggle('hidden',signedIn);if(signedIn)$('.auth-name-field').classList.add('hidden');$('#auth-name').disabled=signedIn;$('#auth-email').disabled=signedIn;$('#auth-password').disabled=signedIn;if(signedIn){$('#auth-title').textContent='Your Daylight account';$('#auth-copy').textContent=`Signed in as ${user.email}. Your tasks and preferences sync privately.`}}
  function updateSyncStatus(status){
    const labels={
      pending:'Syncing…', error:'Sync paused. Changes are saved in this browser.',
      conflict:'This browser and your account have different changes.',
      saved:'Signed in · Synced', 'signed-out':'Signed out · This browser only'
    };
    $('#account-setting-status').textContent=labels[status];
    $('#sync-conflict').classList.toggle('hidden',status!=='conflict');
  }
  function renderAccountWorkspace(){
    applyNavOrder();
    applySettings();
    renderWorkspace();
    renderResources();
  }
  function scheduleSync(){
    const session=workspace;
    if(!session?.dirty||session.loading||session.writing||session.conflict||session.base===undefined)return;
    clearTimeout(session.timer);
    updateSyncStatus('pending');
    session.timer=setTimeout(()=>syncWorkspace(session),500);
  }
  async function syncWorkspace(session){
    if(session!==workspace||!session.dirty)return;
    const version=session.dirty;
    const snapshot=structuredClone(state);
    session.writing=true;
    try {
      const saved=await window.DAYLIGHT_AUTH.writeState(session.user,snapshot,session.base,version);
      if(session!==workspace)return;
      if(!saved){
        session.conflict=true;
        updateSyncStatus('conflict');
        return;
      }
      session.base=version;
      if(session.dirty===version)session.dirty=null;
      persist();
      updateSyncStatus(session.dirty?'pending':'saved');
    } catch {
      if(session===workspace)updateSyncStatus('error');
      return;
    } finally {
      session.writing=false;
    }
    scheduleSync();
  }
  async function loadWorkspace(session){
    if(session.loading)return;
    session.loading=true;
    session.needsLoad=true;
    updateSyncStatus('pending');
    try {
      const remote=await window.DAYLIGHT_AUTH.loadState(session.user);
      if(session!==workspace)return;
      if(remote.version!==null&&!Array.isArray(remote.state?.tasks))throw new Error('Invalid synced workspace');
      session.needsLoad=false;
      if(session.dirty===remote.version)session.dirty=null;
      if(session.dirty&&session.base!==remote.version&&!(session.base===undefined&&remote.version===null)){
        session.conflict=true;
        updateSyncStatus('conflict');
        return;
      }
      session.base=remote.version;
      if(!session.dirty){
        if(remote.version===null){
          session.dirty=newId();
        }else{
          if($('#view-focus').classList.contains('active'))showView('today');
          state=normalizeState(remote.state);
        }
      }
      persist();
      renderAccountWorkspace();
      updateSyncStatus(session.dirty?'pending':'saved');
    } catch {
      if(session===workspace)updateSyncStatus('error');
      return;
    } finally {
      session.loading=false;
    }
    scheduleSync();
  }
  async function resolveSyncConflict(keepLocal){
    const session=workspace;
    if(!session?.conflict||session.loading)return;
    const message=keepLocal?'Replace the synced copy with your changes from this browser?':'Replace the changes in this browser with the synced copy?';
    if(!window.confirm(message))return;
    session.loading=true;
    updateSyncStatus('pending');
    try {
      const remote=await window.DAYLIGHT_AUTH.loadState(session.user);
      if(session!==workspace)return;
      if(!keepLocal){
        if(remote.version!==null&&!Array.isArray(remote.state?.tasks))throw new Error('Synced workspace is unavailable');
        state=normalizeState(remote.state);
        session.dirty=null;
        renderAccountWorkspace();
      }
      session.base=remote.version;
      session.conflict=false;
      persist();
      updateSyncStatus(session.dirty?'pending':'saved');
    } catch {
      if(session===workspace){updateSyncStatus('conflict');notify('Cloud sync is unavailable. Try again when you’re online.')}
    } finally {
      session.loading=false;
    }
    scheduleSync();
  }
  function handleAuthState(event){
    const user=event.detail.user;
    updateAccount(user);
    if(workspace?.user.uid===user?.uid)return;
    stopTimer();
    clearTimeout(workspace?.timer);
    for(const dialog of $$('dialog[open]'))if(dialog.id!=='auth-dialog')dialog.close();
    clearCoachConversation(false);
    if($('#view-focus').classList.contains('active'))showView('today');
    currentTaskId=null;
    const local=readLocal(user?STORE+'.account.'+user.uid:STORE);
    workspace=user?{user,base:local?.base,dirty:local?.dirty}:null;
    state=normalizeState(user?local?.state:local);
    renderAccountWorkspace();
    if(workspace)loadWorkspace(workspace);
    else updateSyncStatus('signed-out');
  }
  function setDate(){const now=new Date();$('#header-date').textContent=now.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'}).toUpperCase();$('#date-day').textContent=now.getDate();$('#date-month').innerHTML=now.toLocaleDateString(undefined,{month:'short'}).toUpperCase()+'<br />'+now.toLocaleDateString(undefined,{weekday:'short'}).toUpperCase();const mondayOffset=(now.getDay()+6)%7;const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-mondayOffset);const sunday=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+6);$('#week-range').textContent=`${monday.toLocaleDateString(undefined,{month:'short',day:'numeric'})}–${sunday.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`.toUpperCase();const h=now.getHours();$('#greeting').textContent=h<12?'A FRESH START':h<17?'A LITTLE SPACE TO FOCUS':'A GENTLE END TO THE DAY'}
  initResourceFilters();bind();applyNavOrder();applySettings();setDate();renderWorkspace();renderResources();renderCoach();renderCoachMode();initializeCoachMode();
})();
