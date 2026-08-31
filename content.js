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

  // Estratégia 1 (mais robusta): varre o texto do cabeçalho linha por linha
  // procurando um endereço de e-mail (padrão "algo@algo.algo"), pulando
  // qualquer linha que comece com "Para:"/"To:"/"Cc:" (destinatário, não remetente).
  // Cobre tanto o caso do e-mail aparecer como link (mailto:) quanto como
  // texto puro (ex: "Indeed<no-reply@indeed.com>").
  const textoCabecalho = (painel.innerText || '').slice(0, 1000);
  const linhasCabecalho = textoCabecalho.split('\n').map(l => l.trim()).filter(Boolean);

  let remetenteEmail = null;
  let remetenteNome = null;

  for (const linha of linhasCabecalho) {
    const match = linha.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (!match) continue;

    const ehDestinatario = /^(para|to|cc|cco|bcc)\s*:/i.test(linha);
    if (ehDestinatario) continue; // pula "Para:"/"To:", que é o destinatário

    remetenteEmail = match[0];
    // tenta pegar o nome antes do "<email>", se existir (ex: "Indeed<...>")
    remetenteNome = linha.replace(/<.*$/, '').trim() || null;
    break;
  }

  if (!remetenteEmail) {
    // Estratégia 2 (fallback): procura um link mailto: que não seja destinatário
    const linksMailto = Array.from(painel.querySelectorAll('a[href^="mailto:"]'));
    const linkRemetente = linksMailto.find(link => {
      const contexto = (link.closest('div, li, tr')?.textContent || '').trim().toLowerCase();
      return !/^(para|to|cc|cco|bcc)\s*:/.test(contexto);
    }) || linksMailto[0];

    if (linkRemetente) {
      remetenteEmail = decodeURIComponent(linkRemetente.getAttribute('href').replace('mailto:', '').split('?')[0]);
      remetenteNome = linkRemetente.textContent?.trim() || null;
    }
  }

  if (!remetenteEmail) {
    // Estratégia 3 (último recurso): título/aria-label com "@"
    const remetenteEl =
      painel.querySelector('[title*="@"]') ||
      painel.querySelector('[aria-label*="@"]');
    remetenteEmail = remetenteEl?.getAttribute('title') || null;
    remetenteNome = remetenteEl?.textContent?.trim() || null;
  }

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

  if (!assuntoEl && !remetenteEmail && !remetenteNome && !corpoTexto) {
    return null;
  }

  return {
    // prioriza o e-mail de verdade; se só achou o nome, manda o nome mesmo
    remetente: remetenteEmail || remetenteNome || null,
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
