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
    corpo: corpoEl?.innerText?.trim() || null,
    links: extrairLinksReais(corpoEl)
  };
}

// Pega o destino REAL (href) de cada link no corpo do e-mail — não o texto
// exibido. Isso importa porque o golpe clássico de phishing é mostrar um
// texto como "www.meubanco.com.br" enquanto o link de verdade aponta pra
// outro domínio; só olhando o href a gente pega o destino de fato.
function extrairLinksReais(corpoEl) {
  if (!corpoEl) return [];
  const hrefs = Array.from(corpoEl.querySelectorAll('a[href]'))
    .map((a) => a.href)
    .filter((href) => href && /^https?:\/\//i.test(href));
  // remove duplicados mantendo a ordem, e limita a 5 pra não virar uma lista enorme
  return Array.from(new Set(hrefs)).slice(0, 5);
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
  let corpoElParaLinks = null;
  if (corpoFrame) {
    try {
      const corpoDoc = corpoFrame.contentDocument;
      corpoTexto = corpoDoc?.body?.innerText?.trim() || null;
      corpoElParaLinks = corpoDoc?.body || null;
    } catch (e) {
      // se o iframe for de outra origem, o navegador bloqueia o acesso
      corpoTexto = null;
    }
  }
  if (!corpoTexto) {
    const corpoDiv = painel.querySelector('[aria-label*="Corpo da mensagem"], [aria-label*="Message body"]');
    corpoTexto = corpoDiv?.innerText?.trim() || null;
    corpoElParaLinks = corpoDiv || null;
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
    corpo: corpoTexto,
    links: extrairLinksReais(corpoElParaLinks)
  };
}

function extrairEmailAtual() {
  const servico = detectarServico();
  if (servico === 'gmail') return extrairEmailGmail();
  if (servico === 'outlook') return extrairEmailOutlook();
  return null;
}

// ---------- DENÚNCIA REAL DE PHISHING (aciona o recurso nativo do próprio
// Gmail/Outlook, em vez de só marcar algo internamente na extensão) ----------
//
// Tanto o Gmail quanto o Outlook Web só expõem "denunciar phishing" como uma
// ação dentro da própria interface (menu "Mais" > "Denunciar phishing"), não
// existe uma URL ou API pública pra isso. Por isso, em vez de fingir que
// denunciamos, a extensão aciona esse mesmo menu nativo por script, como se
// o usuário tivesse clicado — e avisa honestamente se não conseguir achar
// os botões (layout pode variar).

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// procura, dentro de uma lista de elementos (por seletor), o primeiro cujo
// texto visível OU aria-label bate com a regex — funciona tanto em PT-BR
// quanto em EN, já que buscamos por padrões como /phishing/i
function encontrarElementoPorTexto(seletor, regexTexto) {
  const candidatos = Array.from(document.querySelectorAll(seletor));
  return candidatos.find((el) => {
    const texto = el.textContent || '';
    const aria = el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || '';
    return regexTexto.test(texto.trim()) || regexTexto.test(aria.trim());
  }) || null;
}

async function denunciarPhishingGmail() {
  // botão "Mais" (⋮) da mensagem aberta — geralmente o último na tela é o
  // da mensagem em foco, já que a lista de e-mails também tem o seu próprio
  const maisBtn = encontrarElementoPorTexto('[aria-label], [data-tooltip]', /^(mais|more)$/i);
  if (!maisBtn) {
    return { sucesso: false, mensagem: 'Não encontramos o menu "Mais" do Gmail nesta tela. Abra o e-mail e denuncie manualmente (⋮ › Denunciar phishing).' };
  }
  maisBtn.click();
  await aguardar(350);

  const itemPhishing = encontrarElementoPorTexto('div[role="menuitem"], span, div', /phishing/i);
  if (!itemPhishing) {
    return { sucesso: false, mensagem: 'Abrimos o menu "Mais", mas não encontramos a opção de phishing. Denuncie manualmente pelo mesmo menu.' };
  }
  itemPhishing.click();
  await aguardar(400);

  // o Gmail costuma pedir uma confirmação final antes de enviar a denúncia
  const botaoConfirmar = encontrarElementoPorTexto(
    'div[role="button"], button',
    /denunciar mensagem de phishing|report phishing message/i
  );
  if (botaoConfirmar) {
    botaoConfirmar.click();
    return { sucesso: true, mensagem: 'Denúncia enviada ao Gmail.' };
  }

  return { sucesso: false, mensagem: 'Selecionamos "Denunciar phishing" — confirme na janela que o Gmail abriu pra concluir o envio.' };
}

async function denunciarPhishingOutlook() {
  // tenta abrir o menu de "mais ações" da mensagem, se existir nessa versão
  const maisBtn = encontrarElementoPorTexto('[aria-label]', /^(mais ações|more actions|mais opções|more options)$/i);
  if (maisBtn) {
    maisBtn.click();
    await aguardar(350);
  }

  let itemReport = encontrarElementoPorTexto('[role="menuitem"], button, div[role="button"]', /^(report|denunciar)$/i);
  if (itemReport) {
    itemReport.click();
    await aguardar(350);
  }

  const itemPhishing = encontrarElementoPorTexto('[role="menuitem"], button, div[role="button"]', /phishing/i);
  if (!itemPhishing) {
    return { sucesso: false, mensagem: 'Não encontramos a opção de denunciar phishing nesta versão do Outlook. Denuncie manualmente pelo menu "Lixo eletrônico" › "Phishing".' };
  }
  itemPhishing.click();
  await aguardar(300);

  const botaoConfirmar = encontrarElementoPorTexto('button, div[role="button"]', /^(report|denunciar|confirm|confirmar)$/i);
  if (botaoConfirmar) {
    botaoConfirmar.click();
    return { sucesso: true, mensagem: 'Denúncia enviada ao Outlook.' };
  }
  return { sucesso: false, mensagem: 'Selecionamos a opção de phishing — confirme na janela que o Outlook abriu pra concluir o envio.' };
}

async function denunciarPhishingAtual() {
  const servico = detectarServico();
  if (servico === 'gmail') return denunciarPhishingGmail();
  if (servico === 'outlook') return denunciarPhishingOutlook();
  return { sucesso: false, mensagem: 'Serviço de e-mail não suportado para denúncia automática.' };
}

// escuta pedidos vindos do popup (script.js) pra extrair o e-mail da tela
// ou pra acionar a denúncia nativa de phishing
chrome.runtime.onMessage.addListener((mensagem, remetenteMsg, sendResponse) => {
  if (mensagem?.tipo === 'EXTRAIR_EMAIL_ATUAL') {
    sendResponse(extrairEmailAtual());
    return true;
  }
  if (mensagem?.tipo === 'DENUNCIAR_PHISHING') {
    denunciarPhishingAtual().then(sendResponse);
    return true; // resposta assíncrona
  }
  return true;
});
