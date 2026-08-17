import express from "express";
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new Database(path.join(__dirname, "finance.db"));
const PORT = process.env.PORT || 3000;

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname, "public")));

db.exec(`
CREATE TABLE IF NOT EXISTS accounts(
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, bank TEXT, balance REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cards(
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, limit_total REAL NOT NULL DEFAULT 0,
 used REAL NOT NULL DEFAULT 0, bill REAL NOT NULL DEFAULT 0, due_day INTEGER, closing_day INTEGER
);
CREATE TABLE IF NOT EXISTS transactions(
 id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL, type TEXT NOT NULL,
 amount REAL NOT NULL, date TEXT, paid INTEGER NOT NULL DEFAULT 0, card_id INTEGER, account_id INTEGER
);
CREATE TABLE IF NOT EXISTS installments(
 id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL, total REAL NOT NULL,
 installment_value REAL NOT NULL, total_installments INTEGER NOT NULL, current_installment INTEGER NOT NULL,
 card_id INTEGER, purchase_date TEXT
);
CREATE TABLE IF NOT EXISTS settings(
 id INTEGER PRIMARY KEY CHECK(id=1), reserve REAL NOT NULL DEFAULT 0, income REAL NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO settings(id,reserve,income) VALUES(1,0,0);
`);

const q = {
 accounts: db.prepare("SELECT * FROM accounts ORDER BY id DESC"),
 cards: db.prepare("SELECT * FROM cards ORDER BY id DESC"),
 tx: db.prepare("SELECT * FROM transactions ORDER BY id DESC"),
 installments: db.prepare("SELECT * FROM installments ORDER BY id DESC"),
 settings: db.prepare("SELECT * FROM settings WHERE id=1")
};

function state(){
  const accounts=q.accounts.all(), cards=q.cards.all(), transactions=q.tx.all(), installments=q.installments.all(), settings=q.settings.get();
  const balance=accounts.reduce((s,x)=>s+x.balance,0);
  const bills=cards.reduce((s,x)=>s+x.bill,0);
  const payables=transactions.filter(x=>!x.paid && x.type==="expense").reduce((s,x)=>s+x.amount,0);
  const futureInstallments=installments.reduce((s,x)=>s+x.installment_value*Math.max(0,x.total_installments-x.current_installment+1),0);
  const available=balance-bills-payables-settings.reserve;
  return {accounts,cards,transactions,installments,settings,summary:{balance,bills,payables,futureInstallments,available}};
}
app.get("/api/state",(req,res)=>res.json(state()));

app.post("/api/accounts",(req,res)=>{
  const {name,bank,balance=0}=req.body;
  if(!name) return res.status(400).json({error:"Nome da conta é obrigatório."});
  const info=db.prepare("INSERT INTO accounts(name,bank,balance) VALUES(?,?,?)").run(name,bank||"",Number(balance)||0);
  res.json({id:info.lastInsertRowid,...state()});
});
app.delete("/api/accounts/:id",(req,res)=>{db.prepare("DELETE FROM accounts WHERE id=?").run(req.params.id);res.json(state())});

app.post("/api/cards",(req,res)=>{
  const {name,limit_total=0,used=0,bill=0,due_day,closing_day}=req.body;
  if(!name) return res.status(400).json({error:"Nome do cartão é obrigatório."});
  const info=db.prepare("INSERT INTO cards(name,limit_total,used,bill,due_day,closing_day) VALUES(?,?,?,?,?,?)")
    .run(name,Number(limit_total)||0,Number(used)||0,Number(bill)||0,due_day||null,closing_day||null);
  res.json({id:info.lastInsertRowid,...state()});
});
app.delete("/api/cards/:id",(req,res)=>{db.prepare("DELETE FROM cards WHERE id=?").run(req.params.id);res.json(state())});

app.post("/api/transactions",(req,res)=>{
  const {description,type,amount,date,paid=false,card_id=null,account_id=null}=req.body;
  if(!description || !["income","expense"].includes(type) || !(Number(amount)>0))
    return res.status(400).json({error:"Lançamento inválido."});
  const info=db.prepare("INSERT INTO transactions(description,type,amount,date,paid,card_id,account_id) VALUES(?,?,?,?,?,?,?)")
    .run(description,type,Number(amount),date||null,paid?1:0,card_id||null,account_id||null);
  if(paid && account_id){
    const a=db.prepare("SELECT balance FROM accounts WHERE id=?").get(account_id);
    if(a) db.prepare("UPDATE accounts SET balance=? WHERE id=?").run(a.balance+(type==="income"?Number(amount):-Number(amount)),account_id);
  }
  if(card_id && type==="expense"){
    db.prepare("UPDATE cards SET used=used+?, bill=bill+? WHERE id=?").run(Number(amount),Number(amount),card_id);
  }
  res.json({id:info.lastInsertRowid,...state()});
});
app.delete("/api/transactions/:id",(req,res)=>{db.prepare("DELETE FROM transactions WHERE id=?").run(req.params.id);res.json(state())});

app.post("/api/purchase/installment", (req,res)=>{
  const {description,total,installments:count,card_id,purchase_date}=req.body;
  const value=Number(total)/Number(count);
  if(!description || !(Number(total)>0) || !(Number(count)>=2) || !card_id)
    return res.status(400).json({error:"Compra parcelada inválida."});
  const card=db.prepare("SELECT * FROM cards WHERE id=?").get(card_id);
  if(!card) return res.status(404).json({error:"Cartão não encontrado."});
  const info=db.transaction(()=>{
    const inst=db.prepare(`INSERT INTO installments(description,total,installment_value,total_installments,current_installment,card_id,purchase_date)
      VALUES(?,?,?,?,?,?,?)`).run(description,Number(total),value,Number(count),1,card_id,purchase_date||new Date().toISOString().slice(0,10));
    db.prepare("UPDATE cards SET used=used+?, bill=bill+? WHERE id=?").run(value,value,card_id);
    return inst.lastInsertRowid;
  })();
  res.json({installment_id:info,...state()});
});

app.post("/api/settings",(req,res)=>{
  db.prepare("UPDATE settings SET reserve=?, income=? WHERE id=1").run(Number(req.body.reserve)||0,Number(req.body.income)||0);
  res.json(state());
});

/* Agente local + ponto de integração para LLM.
   Em produção, configure AI_PROVIDER e um backend/endpoint compatível.
   A chave nunca é enviada ao navegador. */
app.post("/api/agent",(req,res)=>{
  const question=String(req.body.question||"").trim();
  const s=state(), t=s.summary;
  const l=question.toLowerCase();
  let answer;
  if(l.includes("gastar")){
    answer=`Seu dinheiro disponível estimado é ${brl(t.available)}. Esse cálculo desconta faturas, contas pendentes e a reserva configurada.`;
  } else if(l.includes("fatura") || l.includes("cartão")){
    const totalLimit=s.cards.reduce((a,c)=>a+c.limit_total,0);
    answer=`Suas faturas atuais somam ${brl(t.bills)}. Seus limites totais somam ${brl(totalLimit)}.`;
  } else if(l.includes("resumo")){
    answer=`Resumo: saldo ${brl(t.balance)}; faturas ${brl(t.bills)}; contas pendentes ${brl(t.payables)}; parcelas futuras ${brl(t.futureInstallments)}; disponível ${brl(t.available)}.`;
  } else if(l.includes("risco") || l.includes("faltar")){
    answer=t.available<0 ? `Há risco: seu disponível projetado está negativo em ${brl(Math.abs(t.available))}.` :
      `Não há déficit imediato pelos dados cadastrados. Disponível estimado: ${brl(t.available)}.`;
  } else {
    answer=`Posso analisar saldo, cartões, faturas, parcelas, contas e dinheiro disponível. Exemplo: "Quanto posso gastar?"`;
  }
  res.json({answer, source:"local"});
});
function brl(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0)}

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Gestor Financeiro IA: http://localhost:${PORT}`));
