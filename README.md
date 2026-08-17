# Gestor Financeiro IA 2.0

## Arquitetura
Android/PWA -> API segura -> banco SQLite -> agente financeiro.

A versão entregue já inclui:
- backend Node.js/Express;
- banco SQLite local no servidor;
- contas;
- cartões;
- limites;
- faturas;
- lançamentos;
- compras parceladas;
- parcelas futuras;
- cálculo de dinheiro disponível;
- reserva;
- agente financeiro;
- PWA instalável.

## Executar no computador
1. Instale Node.js 20+.
2. Entre na pasta do projeto.
3. Execute `npm install`.
4. Execute `npm start`.
5. Abra `http://localhost:3000`.

## Publicar para Android
O servidor precisa estar em HTTPS. Depois, abra o endereço no Chrome do Android e escolha "Instalar app" / "Adicionar à tela inicial".

## IA real
A rota `/api/agent` é o ponto de integração. A implementação entregue usa respostas locais para funcionar imediatamente.
Para conectar um LLM real, implemente a chamada no servidor e mantenha a chave da API somente no servidor.

## Open Finance
A integração bancária real não é feita diretamente no PWA. Deve ser feita por um provedor Open Finance autorizado e com consentimento do usuário. O backend recebe somente os dados necessários, normaliza as transações e grava no banco.
Nunca coloque credenciais bancárias, CVV ou tokens de acesso no frontend.

## Próximas etapas
- autenticação com senha e sessões;
- PostgreSQL em produção;
- criptografia e backups;
- IA real;
- categorização automática;
- importação CSV/OFX;
- Open Finance via provedor;
- notificações;
- gráficos;
- metas;
- sincronização entre dispositivos.
