const state = {query:"", factions:new Set(), abilities:new Set(), ranges:{}, sort:"name-asc", cards:[], keywordDefinitions:[]};
const $ = selector => document.querySelector(selector);
const projectBaseUrl = new URL("../../", document.currentScript.src);
let activeFamilyId = null;
const getForms = family => Array.isArray(family.forms) && family.forms.length ? family.forms : [family];
const allForms = () => state.cards.flatMap(getForms);
const familyDisplayForm = family => getForms(family).find(form=>formKeywords(form).some(keyword=>keyword.id==="montaria"))||getForms(family)[0];

async function start(){
  try{
    const [cardsResponse,keywordsResponse]=await Promise.all([
      fetch(new URL("data/cards.json",projectBaseUrl)),
      fetch(new URL("data/keywords.json",projectBaseUrl))
    ]);
    if(!cardsResponse.ok) throw new Error(`Não foi possível abrir data/cards.json (HTTP ${cardsResponse.status})`);
    if(!keywordsResponse.ok) throw new Error(`Não foi possível abrir data/keywords.json (HTTP ${keywordsResponse.status})`);
    const [data,keywordsData]=await Promise.all([cardsResponse.json(),keywordsResponse.json()]);
    state.cards=data.cards||[]; state.keywordDefinitions=keywordsData.keywords||[];
    document.title=`${data.game||"Card Atlas"} — catálogo de cartas`;
    renderFilters(); bindControls(); render();
  }catch(error){$("#card-grid").innerHTML='<p class="load-error">Não foi possível carregar o catálogo. Confira data/cards.json e abra o site pelo Live Server.</p>';console.error(error)}
}

function formKeywords(form){
  if(Array.isArray(form.keywords))return form.keywords;
  return (form.abilities||[]).map(name=>({id:String(name).toLocaleLowerCase("pt-BR").replace(/\s+/g,"-")}));
}
function getKeywordDefinition(id){return state.keywordDefinitions.find(keyword=>keyword.id===id)}
function keywordFilterName(id){return getKeywordDefinition(id)?.name||id}
function keywordLabel(item){
  const definition=getKeywordDefinition(item.id),name=definition?.name||item.id;
  const template=definition?.labelTemplate||(definition?.hasValue?`${name} {value}`:name);
  return template.replaceAll("{value}",String(item.value??"X")).replaceAll("{faction}",item.faction||"Y");
}
function keywordText(item){
  const definition=getKeywordDefinition(item.id),template=item.textOverride??definition?.text??"";
  if(!template)return "";
  const unit=Number(item.value)===1?definition?.unit?.one:definition?.unit?.other;
  return template.replaceAll("{value}",String(item.value??"X")).replaceAll("{unit}",unit||"").replaceAll("{faction}",item.faction||"Y");
}

function renderFilters(){
  const forms=allForms();
  const factions=[...new Set(forms.map(form=>form.faction).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  $("#faction-filters").innerHTML=factions.map(value=>`<label class="check-option"><input type="checkbox" value="${escapeHtml(value)}" data-faction><span class="custom-check"></span><span>${escapeHtml(value)}</span><span class="option-count">${state.cards.filter(family=>getForms(family).some(form=>form.faction===value)).length}</span></label>`).join("");
  const keywordItems=new Map(); forms.flatMap(formKeywords).forEach(item=>keywordItems.set(item.id,item));
  const abilities=[...keywordItems.keys()].sort((a,b)=>keywordFilterName(a).localeCompare(keywordFilterName(b),"pt-BR"));
  $("#ability-filters").innerHTML=abilities.map(id=>`<label class="check-option"><input type="checkbox" value="${escapeHtml(id)}" data-ability><span class="custom-check"></span><span>${escapeHtml(keywordFilterName(id))}</span><span class="option-count">${state.cards.filter(family=>getForms(family).some(form=>formKeywords(form).some(item=>item.id===id))).length}</span></label>`).join("");
  ["mana","latency","strength","health"].forEach(key=>{
    const observedMax=Math.max(0,...forms.map(form=>Number(form[key]||0))), max=Math.max(key==="mana"?12:1,observedMax);
    const group=$(`[data-dual-range="${key}"]`), minInput=group.querySelector(".range-min"), maxInput=group.querySelector(".range-max");
    minInput.max=max; maxInput.max=max; minInput.value=0; maxInput.value=max; $(`#${key}-range-end`).textContent=max;
    state.ranges[key]={min:0,max}; updateRangeDisplay(key);
  });
}

function updateRangeDisplay(key){
  const group=$(`[data-dual-range="${key}"]`), minInput=group.querySelector(".range-min"), maxInput=group.querySelector(".range-max"), scale=Number(maxInput.max)||1;
  group.style.setProperty("--range-start",`${Number(minInput.value)/scale*100}%`);
  group.style.setProperty("--range-end",`${Number(maxInput.value)/scale*100}%`);
  $(`#${key}-range-value`).textContent=`${minInput.value} – ${maxInput.value}`;
}

function bindControls(){
  $("#search").addEventListener("input",event=>{state.query=event.target.value.trim().toLocaleLowerCase("pt-BR");render()});
  ["#sort-direction","#sort-field"].forEach(selector=>$(selector).addEventListener("change",()=>{state.sort=`${$("#sort-field").value}-${$("#sort-direction").value}`;render()}));
  document.addEventListener("change",event=>{
    if(event.target.matches("[data-ability]")){event.target.checked?state.abilities.add(event.target.value):state.abilities.delete(event.target.value);render()}
    if(event.target.matches("[data-faction]")){event.target.checked?state.factions.add(event.target.value):state.factions.delete(event.target.value);render()}
  });
  document.querySelectorAll(".dual-range input").forEach(input=>input.addEventListener("input",()=>{
    const group=input.closest("[data-dual-range]"), key=group.dataset.dualRange, minInput=group.querySelector(".range-min"), maxInput=group.querySelector(".range-max");
    if(input===minInput&&Number(minInput.value)>Number(maxInput.value))maxInput.value=minInput.value;
    if(input===maxInput&&Number(maxInput.value)<Number(minInput.value))minInput.value=maxInput.value;
    state.ranges[key]={min:Number(minInput.value),max:Number(maxInput.value)}; updateRangeDisplay(key); render();
  }));
  $("#clear-filters").addEventListener("click",resetFilters); $("#empty-reset").addEventListener("click",resetFilters);
  $("#card-grid").addEventListener("click",event=>{const tile=event.target.closest("[data-family-id]");if(tile)openFamily(tile.dataset.familyId)});
  $("#card-grid").addEventListener("keydown",event=>{if((event.key==="Enter"||event.key===" ")&&event.target.matches("[data-family-id]")){event.preventDefault();openFamily(event.target.dataset.familyId)}});
  $("#form-switcher").addEventListener("click",event=>{const button=event.target.closest("[data-form-id]");if(button)renderFamilyDetails(activeFamilyId,button.dataset.formId)});
  $("#close-card-dialog").addEventListener("click",()=>$("#card-dialog").close());
  $("#card-dialog").addEventListener("click",event=>{if(event.target===$("#card-dialog"))$("#card-dialog").close()});
}

function resetFilters(){
  state.query=""; state.factions.clear(); state.abilities.clear(); $("#search").value="";
  document.querySelectorAll("[data-ability],[data-faction]").forEach(input=>input.checked=false);
  renderFilters(); render();
}

function formMatches(form,family){
  const keywords=formKeywords(form), keywordSearch=keywords.flatMap(item=>[keywordLabel(item),keywordText(item)]), searchable=[family.id,form.id,form.name,form.stage,form.faction,...keywordSearch].join(" ").toLocaleLowerCase("pt-BR");
  return(!state.query||searchable.includes(state.query))&&(!state.factions.size||state.factions.has(form.faction))&&(!state.abilities.size||[...state.abilities].every(id=>keywords.some(item=>item.id===id)))&&
    ["mana","latency","strength","health"].every(key=>{const value=Number(form[key]||0),range=state.ranges[key];return value>=range.min&&value<=range.max});
}

function filteredCards(){
  const entries=state.cards.map(family=>{
    const forms=getForms(family), matchingForms=forms.filter(form=>formMatches(form,family));
    return matchingForms.length?{family,forms,matchingForms,preview:familyDisplayForm(family)}:null;
  }).filter(Boolean);
  const [field,direction]=state.sort.split("-");
  return entries.sort((a,b)=>{
    const comparison=field==="name"?a.preview.name.localeCompare(b.preview.name,"pt-BR"):Number(a.preview[field]||0)-Number(b.preview[field]||0);
    return direction==="desc"?-comparison:comparison;
  });
}

function render(){
  const entries=filteredCards(); $("#result-count").textContent=String(entries.length).padStart(2,"0");
  const heroCount=$("#hero-count"); if(heroCount)heroCount.textContent=`${state.cards.length} CARTAS NA COLEÇÃO`;
  $("#card-grid").innerHTML=entries.map(cardMarkup).join(""); $("#empty-state").hidden=entries.length!==0; $("#card-grid").hidden=entries.length===0;
}

function imageUrl(path){return path?new URL(path,projectBaseUrl).href:""}
function cardPlaceholder(card,detail=false){
  return detail?`<div class="detail-art-placeholder" hidden>${escapeHtml(card.name)}</div>`:`<div class="placeholder-card image-fallback" hidden><span class="placeholder-spark">✧</span><span class="placeholder-type">CARTA</span><span class="placeholder-symbol">✦</span><span class="placeholder-name">${escapeHtml(card.name)}</span><div class="demo-stats"><span>FOR ${escapeHtml(card.strength)}</span><span>VID ${escapeHtml(card.health)}</span></div></div>`;
}
function cardMarkup(entry){
  const family=entry.family, card=entry.preview, image=imageUrl(card.image), formsCount=entry.forms.length;
  const artwork=image?`<img src="${escapeHtml(image)}" alt="${escapeHtml(card.name)}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">${cardPlaceholder(card)}`:cardPlaceholder(card).replace(" hidden","");
  const badge=formsCount>1?`<span class="form-count">${formsCount} FORMAS</span>`:"";
  return `<article class="card-item" data-family-id="${escapeHtml(family.id)}" tabindex="0" role="button" aria-label="Ver detalhes de ${escapeHtml(card.name)}">`+
    `<div class="art-frame">${artwork}<span class="cost-gem">${escapeHtml(card.mana)}</span>${badge}</div>`+
    `<div class="card-info"><div class="card-name-row"><h3>${escapeHtml(card.name)}</h3><span class="rarity-label">LAT. ${escapeHtml(card.latency)}</span></div>`+
    `<div class="card-meta"><span>${escapeHtml(card.faction||"Sem facção")}</span><span>Latência ${escapeHtml(card.latency)}</span></div>`+
    `<div class="card-bottom"><div class="tags">${formKeywords(card).map(item=>`<span>${escapeHtml(keywordLabel(item))}</span>`).join("")}</div><div class="stats"><span>⚔ ${escapeHtml(card.strength)}</span><span>♥ ${escapeHtml(card.health)}</span></div></div></div></article>`;
}

function openFamily(familyId){
  const family=state.cards.find(item=>String(item.id)===String(familyId)); if(!family)return;
  activeFamilyId=String(family.id);
  renderFamilyDetails(activeFamilyId,familyDisplayForm(family).id); $("#card-dialog").showModal();
}

function renderFamilyDetails(familyId,formId){
  const family=state.cards.find(item=>String(item.id)===String(familyId)); if(!family)return;
  const forms=getForms(family), selected=forms.find(form=>String(form.id)===String(formId))||forms[0];
  activeFamilyId=String(family.id);
  $("#form-switcher").innerHTML=forms.length>1?forms.map((form,index)=>{
    const label=form.stage|| (index===0?"Base":`Evolução ${index}`), active=String(form.id)===String(selected.id);
    return `<button type="button" role="tab" aria-selected="${active}" class="form-tab${active?" active":""}" data-form-id="${escapeHtml(form.id)}">${escapeHtml(label)}</button>`;
  }).join(""):"";
  const image=imageUrl(selected.image), artwork=image?`<img src="${escapeHtml(image)}" alt="${escapeHtml(selected.name)}" onerror="this.hidden=true;this.nextElementSibling.hidden=false">${cardPlaceholder(selected,true)}`:`<div class="detail-art-placeholder">${escapeHtml(selected.name)}</div>`;
  const keywords=formKeywords(selected), rules=keywords.map(item=>`<p class="card-rule"><strong>${escapeHtml(keywordLabel(item))}</strong><span>${keywordText(item)?` — ${escapeHtml(keywordText(item))}`:" — Descrição ainda não cadastrada."}</span></p>`).join("")||'<p class="rules-empty">Nenhuma palavra-chave cadastrada.</p>';
  $("#dialog-content").innerHTML=`<div class="detail-art">${artwork}</div><div class="detail-copy"><span class="eyebrow">${escapeHtml(selected.stage||"FORMA")}</span><h2 id="dialog-card-name">${escapeHtml(selected.name)}</h2><p class="detail-faction">${escapeHtml(selected.faction||"Sem facção")}</p><section class="detail-rules"><h3>Texto da carta</h3>${rules}</section></div>`;
}

function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char])}
start();
