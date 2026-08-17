let S={}; const $=id=>document.getElementById(id);
const brl=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v)||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opt});const d=await r.json();if(!r.ok)throw Error(d.error||"Erro");return d}
async function load(){S=await api("/api/state");render()}
function render(){
  const t=S.summary;
  $("available").textContent=brl(t.available);$("balance").textContent=brl(t.balance);$("bills").textContent=brl(t.bills);$("payables").textContent=brl(t.payables);
  $("health").innerHTML=t.available<0?`🔴 <b>Risco financeiro:</b> déficit projetado de ${brl(Math.abs(t.available))}.`:`🟢 <b>Disponível seguro estimado:</b> ${brl(t.available)}.`;
  $("cardList").innerHTML=S.cards.map(c=>item(`💳 ${esc(c.name)}`,`Limite ${brl(c.limit_total)} · utilizado ${brl(c.used)} · fatura ${brl(c.bill)}`,brl(c.limit_total-c.used))).join("")||"<p class='note'>Nenhum cartão.</p>";
  $("accountsList").innerHTML=S.accounts.map(a=>item(`🏦 ${esc(a.name)}`,esc(a.bank),brl(a.balance))).join("")||"<p class='note'>Nenhuma conta.</p>";
  $("cardsList").innerHTML=S.cards.map(c=>item(`💳 ${esc(c.name)}`,`Limite ${brl(c.limit_total)} · fatura ${brl(c.bill)}`,brl(c.limit_total-c.used))).join("")||"<p class='note'>Nenhum cartão.</p>";
  $("movesList").innerHTML=S.transactions.map(x=>item(x.type==="income"?"📈 "+esc(x.description):"💸 "+esc(x.description),`${x.date||""} · ${x.paid?"Pago":"Pendente"}`,brl(x.amount),x.type==="income"?"good":"bad")).join("")||"<p class='note'>Nenhum lançamento.</p>";
  $("reserve").value=S.settings.reserve;$("income").value=S.settings.income;
}
function item(a,b,c,cls=""){return `<div class="item"><div><b>${a}</b><small>${b}</small></div><div class="amount ${cls}">${c}</div></div>`}
function go(id){document.querySelectorAll(".view").forEach(x=>x.classList.add("hidden"));$(id).classList.remove("hidden")}
async function newAccount(){let name=prompt("Nome da conta:");if(!name)return;let bank=prompt("Banco:")||"";let balance=prompt("Saldo atual:","0");await api("/api/accounts",{method:"POST",body:JSON.stringify({name,bank,balance})});load()}
async function newCard(){let name=prompt("Nome do cartão:");if(!name)return;let limit=prompt("Limite total:","0");let used=prompt("Limite já utilizado:","0");let bill=prompt("Fatura atual:","0");let due=prompt("Dia do vencimento:","10");let closing=prompt("Dia do fechamento:","3");await api("/api/cards",{method:"POST",body:JSON.stringify({name,limit_total:limit,used,bill,due_day:due,closing_day:closing})});load()}
async function newTx(){let description=prompt("Descrição:");if(!description)return;let type=confirm("OK = receita | Cancelar = despesa")?"income":"expense";let amount=prompt("Valor:","0");let paid=confirm("Já foi pago/recebido?");await api("/api/transactions",{method:"POST",body:JSON.stringify({description,type,amount,paid,date:new Date().toISOString().slice(0,10)})});load()}
async function newPurchase(){if(!S.cards.length)return alert("Cadastre um cartão primeiro.");let description=prompt("O que foi comprado?");if(!description)return;let total=prompt("Valor total:","0");let count=prompt("Número de parcelas:","10");let choices=S.cards.map((c,i)=>`${i+1} - ${c.name}`).join("\n");let n=Number(prompt("Escolha o cartão:\n"+choices,"1"))-1;let card=S.cards[n];if(!card)return;await api("/api/purchase/installment",{method:"POST",body:JSON.stringify({description,total,installments:count,card_id:card.id,purchase_date:new Date().toISOString().slice(0,10)})});load();alert(`Compra registrada: ${brl(Number(total)/Number(count))} x ${count}.`)}
async function saveSettings(){await api("/api/settings",{method:"POST",body:JSON.stringify({reserve:$("reserve").value,income:$("income").value})});load();alert("Salvo.")}
async function ask(q){$("chat").innerHTML+=`<div class="bubble me">${esc(q)}</div>`;let d=await api("/api/agent",{method:"POST",body:JSON.stringify({question:q})});$("chat").innerHTML+=`<div class="bubble bot">${esc(d.answer)}</div>`}
function send(e){e.preventDefault();let q=$("question").value.trim();if(q)ask(q);$("question").value=""}
load();
