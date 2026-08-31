// content.js
//
// Este arquivo roda DENTRO da página do Gmail ou do Outlook (não dentro do
// popup da extensão). É aqui que deve ficar a lógica que lê o e-mail aberto
// na tela do usuário e manda esses dados pro popup analisar.
//
// Ele já está habilitado no manifest.json para rodar automaticamente nas
// páginas do Gmail e do Outlook (veja "content_scripts" e "host_permissions").
//
// ---------- PRÓXIMOS PASSOS (a preencher) ----------
// 1. Detectar quando um e-mail está aberto na tela (Gmail e Outlook têm
//    estruturas de HTML diferentes, então provavelmente vai precisar de
//    duas funções de extração, uma pra cada serviço).
// 2. Extrair: remetente, assunto e corpo do e-mail.
// 3. Mandar esses dados pro popup/background quando ele pedir, usando
//    chrome.runtime.onMessage (exemplo abaixo).

function detectarServico() {
  if (location.hostname.includes('mail.google.com')) return 'gmail';
  if (location.hostname.includes('outlook.live.com') || location.hostname.includes('outlook.office.com')) return 'outlook';
  return null;
}

// Extrai o e-mail aberto no Gmail.
// Obs: o Gmail não tem uma API pública de DOM estável, então esses seletores
// podem quebrar se o Google mudar o layout. Testado no layout "padrão"
// (não o modo denso/compacto alternativo).
function extrairEmailGmail() {
  // .hP = assunto do e-mail aberto
  const assuntoEl = document.querySelector('.hP');

  // .gD = nome do remetente, com o e-mail real no atributo "email"
  const remetenteEl = document.querySelector('.gD');

  // .a3s = corpo do e-mail (pode haver mais de um bloco em conversas com
  // várias mensagens; pegamos o último, que costuma ser o mais recente aberto)
  const corpoEls = document.querySelectorAll('.a3s');
  const corpoEl = corpoEls.length ? corpoEls[corpoEls.length - 1] : null;

  if (!assuntoEl && !remetenteEl && !corpoEl) {
    // nenhum e-mail aberto na tela no momento
    return null;
  }

  return {
    remetente: remetenteEl?.getAttribute('email') || remetenteEl?.textContent?.trim() || null,
    assunto: assuntoEl?.textContent?.trim() || null,
    corpo: corpoEl?.innerText?.trim() || null
  };
}

// Extrai só o endereço de e-mail de dentro de um texto (remove rótulos como
// "Para:", "De:", nome de exibição, etc. — sempre devolve algo como
// "fulano@dominio.com" ou null se não achar nada parecido com e-mail).
function extrairEnderecoEmail(texto) {
  if (!texto) return null;
  const match = texto.match(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/);
  return match ? match[0] : null;
}

// Um elemento "parece destinatário" (Para/To/Cc/Cco/Bcc) quando o texto dele
// começa com um desses rótulos — nesse caso NÃO é o remetente, é quem
// recebeu a mensagem, e deve ser descartado na hora de achar o "De:".
function pareceCampoDestinatario(texto) {
  return /^\s*(para|to|cc|cco|bcc)\s*:/i.test(texto || '');
}

// Extrai o e-mail aberto no Outlook (versão web - outlook.live.com / outlook.office.com).
// Obs: o Outlook Web usa classes CSS geradas dinamicamente (ofuscadas), que
// mudam a cada atualização da Microsoft. Por isso usamos seletores baseados
// em atributos ARIA/role, que tendem a ser mais estáveis que classes CSS.
function extrairEmailOutlook() {
  // o painel de leitura do e-mail aberto geralmente tem role="main"
  const painel = document.querySelector('[role="main"]');
  if (!painel) return null;

  // o assunto costuma estar num heading (h1/h2) dentro do painel de leitura
  const assuntoEl = painel.querySelector('h1, h2, [role="heading"]');

  // Pega TODOS os elementos com "@" no title/aria-label (o painel mostra
  // várias linhas: De/From, Para/To, Cc...) e descarta os que claramente
  // são de destinatário ("Para:", "To:", "Cc:", "Cco:"). O primeiro que
  // sobrar tende a ser o remetente, que o Outlook sempre lista primeiro.
  const candidatos = Array.from(
    painel.querySelectorAll('[title*="@"], [aria-label*="@"]')
  );
  const remetenteEl = candidatos.find((el) => {
    const texto = el.getAttribute('title') || el.getAttribute('aria-label') || '';
    return !pareceCampoDestinatario(texto);
  }) || null;

  // o corpo do e-mail costuma ficar num iframe ou div marcado como conteúdo da mensagem
  const corpoFrame = painel.querySelector('iframe');
  let corpoTexto = null;
  if (corpoFrame) {
    try {
      corpoTexto = corpoFrame.contentDocument?.body?.innerText?.trim() || null;
    } catch (e) {
      // se o iframe for de outra origem, o navegador bloqueia o acesso
      corpoTexto = null;
    }
  }
  if (!corpoTexto) {
    const corpoDiv = painel.querySelector('[aria-label*="Corpo da mensagem"], [aria-label*="Message body"]');
    corpoTexto = corpoDiv?.innerText?.trim() || null;
  }

  if (!assuntoEl && !remetenteEl && !corpoTexto) {
    return null;
  }

  const remetenteTexto = remetenteEl?.getAttribute('title') || remetenteEl?.getAttribute('aria-label') || remetenteEl?.textContent || null;

  return {
    // sempre devolve só o endereço limpo (sem "Para:"/"De:"/nome de exibição);
    // se por algum motivo não achar um e-mail válido no texto, cai pro texto cru
    remetente: extrairEnderecoEmail(remetenteTexto) || remetenteTexto,
    assunto: assuntoEl?.textContent?.trim() || null,
    corpo: corpoTexto
  };
}

function extrairEmailAtual() {
  const servico = detectarServico();
  if (servico === 'gmail') return extrairEmailGmail();
  if (servico === 'outlook') return extrairEmailOutlook();
  return null;
}

// escuta pedidos vindos do popup (script.js) pra extrair o e-mail da tela
chrome.runtime.onMessage.addListener((mensagem, remetenteMsg, sendResponse) => {
  if (mensagem?.tipo === 'EXTRAIR_EMAIL_ATUAL') {
    const dados = extrairEmailAtual();
    sendResponse(dados);
  }
  // mantém o canal aberto para resposta assíncrona, se precisar no futuro
  return true;
});
