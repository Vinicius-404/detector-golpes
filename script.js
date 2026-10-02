// ---------- CONFIG DA API ----------
const API_URL = 'http://localhost:8000/analisar-email';

// ---------- STORAGE (chrome.storage.local, com fallback para testes fora da extensão) ----------
const storage = {
  get(key) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([key], (result) => resolve(result[key]));
      } else {
        // fora da extensão (ex.: testes locais), uma chave nunca definida
        // precisa resolver como "undefined" — igual ao comportamento real
        // do chrome.storage.local — não como "null"
        window.__devStorage = window.__devStorage || {};
        if (!(key in window.__devStorage)) { resolve(undefined); return; }
        try { resolve(JSON.parse(window.__devStorage[key])); }
        catch (e) { resolve(undefined); }
      }
    });
  },
  set(key, value) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [key]: value }, resolve);
      } else {
        window.__devStorage = window.__devStorage || {};
        window.__devStorage[key] = JSON.stringify(value);
        resolve();
      }
    });
  }
};

const MAX_HISTORICO = 3;

// data/hora relativa ("Hoje 10:18" / "Ontem 18:42" / "20/09 11:39"), calculada
// a partir de um timestamp ISO guardado no storage — assim o rótulo
// "Hoje"/"Ontem" sempre fica correto, mesmo reabrindo o popup dias depois
function formatRelativo(iso) {
  const d = new Date(iso);
  const agora = new Date();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const mesmoDia = d.toDateString() === agora.toDateString();
  if (mesmoDia) return `Hoje ${hora}`;

  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `Ontem ${hora}`;

  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + hora;
}

// ---------- CONFIG POR NÍVEL DE AMEAÇA ----------
const THREAT_CONFIG = {
  alto: {
    pillClass: 'risk-pill--alto',
    pillText: 'Risco alto',
    noticeClass: 'notice--red',
    noticeTitle: 'Isto parece um golpe',
    noticeDescPadrao: 'Encontramos fortes indícios de phishing nesta mensagem. Não clique em links nem informe seus dados.',
    showReport: true
  },
  medio: {
    pillClass: 'risk-pill--medio',
    pillText: 'Risco médio',
    noticeClass: 'notice--amber',
    noticeTitle: 'Alguns sinais de atenção',
    noticeDescPadrao: 'A mensagem tem características suspeitas, mas não há certeza de golpe. Evite clicar em links antes de confirmar o remetente.',
    showReport: true
  },
  baixo: {
    pillClass: 'risk-pill--baixo',
    pillText: 'Risco baixo',
    noticeClass: 'notice--green',
    noticeTitle: 'E-mail classificado como seguro',
    noticeDescPadrao: 'Não encontramos indícios de phishing ou golpe nesta mensagem.',
    showReport: false
  }
};

let currentLevel = 'alto';

// ---------- NAVEGAÇÃO ENTRE TELAS (bottom nav) ----------
const navButtons = document.querySelectorAll('.navbtn');
const screens = document.querySelectorAll('.screen');
const btnSino = document.getElementById('btn-simulate-email');
const btnBackGenerico = document.getElementById('btn-back-generic');

// o sino só faz sentido na tela Início; a seta de voltar do topo só
// aparece nas telas que não têm atalho na barra inferior (permissão,
// novo e-mail) e também na tela de ameaças quando se chega vindo de uma
// análise (mantém consistência com o fluxo anterior)
function atualizarTopbar() {
  const inicioEstaAtivo = document.getElementById('screen-inicio').classList.contains('active');
  const permissaoEstaAtiva = document.getElementById('screen-permissao').classList.contains('active');
  const novoEmailEstaAtivo = document.getElementById('screen-novoemail').classList.contains('active');
  const ameacasEstaAtivo = document.getElementById('screen-ameacas').classList.contains('active');
  btnSino.style.visibility = inicioEstaAtivo ? 'visible' : 'hidden';
  btnBackGenerico.style.display = (permissaoEstaAtiva || novoEmailEstaAtivo || ameacasEstaAtivo) ? 'flex' : 'none';
}

function irParaTela(id) {
  navButtons.forEach(b => b.classList.remove('active'));
  const navCorrespondente = document.querySelector(`.navbtn[data-screen="${id}"]`);
  if (navCorrespondente) navCorrespondente.classList.add('active');
  screens.forEach(s => s.classList.toggle('active', s.id === `screen-${id}`));
  atualizarTopbar();
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => irParaTela(btn.dataset.screen));
});

btnBackGenerico.addEventListener('click', () => irParaTela('inicio'));

atualizarTopbar();

// ---------- RENDER DO CARD DE AMEAÇA (pill + caixa de aviso colorida) ----------
function renderThreat(level, descPersonalizada) {
  currentLevel = level;
  const cfg = THREAT_CONFIG[level];

  const pill = document.getElementById('risk-pill');
  pill.className = 'risk-pill ' + cfg.pillClass;
  pill.textContent = cfg.pillText;

  const notice = document.getElementById('threat-notice');
  notice.className = 'notice ' + cfg.noticeClass;
  document.getElementById('threat-notice-title').textContent = cfg.noticeTitle;
  document.getElementById('threat-notice-desc').textContent = descPersonalizada || cfg.noticeDescPadrao;

  document.getElementById('btn-denunciar').style.display = cfg.showReport ? 'block' : 'none';
}
renderThreat(currentLevel);

// ---------- HISTÓRICO DE AMEAÇAS (persistente, máx. 3 itens, FIFO) ----------
const historicoToggle = document.getElementById('historico-toggle');
const historicoList = document.getElementById('historico-list');
const historicoChevron = document.getElementById('historico-chevron');
const historicoSub = document.getElementById('historico-sub');
let historicoExpanded = false;

function renderHistorico(items) {
  historicoList.innerHTML = '';
  if (!items || items.length === 0) {
    historicoList.innerHTML = '<p class="historico__empty" id="historico-empty">Nenhuma análise ainda. Clique no sino (🔔) pra começar.</p>';
    return;
  }
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'historico__card';
    card.innerHTML = `
      <div class="historico__card-row">
        <span class="historico__dot historico__dot--${item.level}"></span>
        <span class="historico__email">${item.remetente}</span>
        <span class="historico__when">${formatRelativo(item.timestamp)}</span>
      </div>
      <p class="historico__reason">${THREAT_CONFIG[item.level].pillText} — ${item.motivo}</p>
    `;
    historicoList.appendChild(card);
  });
}

async function getHistorico() {
  return (await storage.get('historico')) || [];
}

// adiciona no topo; se passar de MAX_HISTORICO, remove o mais antigo (FIFO)
async function addHistorico(level, remetente, motivo) {
  const items = await getHistorico();
  items.unshift({ level, remetente, motivo, timestamp: new Date().toISOString() });
  const limitado = items.slice(0, MAX_HISTORICO);
  await storage.set('historico', limitado);
  renderHistorico(limitado);
}

function expandirHistorico() {
  historicoExpanded = true;
  historicoList.classList.add('expanded');
  historicoChevron.classList.add('rotated');
  historicoSub.textContent = 'Clique para esconder seu histórico de ameaças';
}

historicoToggle.addEventListener('click', () => {
  historicoExpanded = !historicoExpanded;
  historicoList.classList.toggle('expanded', historicoExpanded);
  historicoChevron.classList.toggle('rotated', historicoExpanded);
  historicoSub.textContent = historicoExpanded
    ? 'Clique para esconder seu histórico de ameaças'
    : 'Clique para ver seu histórico de ameaças';
});

// botão "Ver histórico de análises" no card de resultado: expande e rola
// até a seção de histórico, em vez de duplicar a lista num lugar novo
document.getElementById('btn-ver-historico').addEventListener('click', () => {
  expandirHistorico();
  historicoToggle.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// carrega histórico salvo assim que o popup abre
getHistorico().then(renderHistorico);

// ---------- STATS (persistentes) ----------
const statEmails = document.getElementById('stat-emails');
const statAmeacas = document.getElementById('stat-ameacas');
const statDenuncias = document.getElementById('stat-denuncias');

async function getStats() {
  return (await storage.get('stats')) || { emails: 0, ameacas: 0, denuncias: 0 };
}
async function saveStats(stats) {
  await storage.set('stats', stats);
  statEmails.textContent = String(stats.emails).padStart(2, '0');
  statAmeacas.textContent = String(stats.ameacas).padStart(2, '0');
  statDenuncias.textContent = String(stats.denuncias).padStart(2, '0');
}
const ultimaVerificacaoEl = document.getElementById('ultima-verificacao');
async function atualizarUltimaVerificacao() {
  await storage.set('ultimaVerificacao', new Date().toISOString());
  ultimaVerificacaoEl.textContent = formatRelativo(new Date().toISOString());
}
storage.get('ultimaVerificacao').then((val) => {
  ultimaVerificacaoEl.textContent = val ? formatRelativo(val) : 'nunca';
});

getStats().then(saveStats);

// ---------- CONFIGURAÇÕES ----------
const cfgVerificacaoAutomatica = document.getElementById('cfg-verificacao-automatica');
const cfgNotificacoes = document.getElementById('cfg-notificacoes');
const cfgDenunciaAutomatica = document.getElementById('cfg-denuncia-automatica');

// carrega as preferências salvas
storage.get('cfgVerificacaoAutomatica').then((val) => { cfgVerificacaoAutomatica.checked = !!val; });
storage.get('cfgNotificacoes').then((val) => { cfgNotificacoes.checked = val === undefined ? true : val; });
storage.get('cfgDenunciaAutomatica').then((val) => { cfgDenunciaAutomatica.checked = !!val; });

cfgVerificacaoAutomatica.addEventListener('change', () => {
  storage.set('cfgVerificacaoAutomatica', cfgVerificacaoAutomatica.checked);
});
cfgNotificacoes.addEventListener('change', () => {
  storage.set('cfgNotificacoes', cfgNotificacoes.checked);
});
cfgDenunciaAutomatica.addEventListener('change', () => {
  storage.set('cfgDenunciaAutomatica', cfgDenunciaAutomatica.checked);
});

// botão "Limpar histórico e estatísticas"
document.getElementById('btn-limpar-dados').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const confirmar = window.confirm('Isso vai apagar seu histórico de ameaças e as estatísticas. Deseja continuar?');
  if (!confirmar) return;

  await storage.set('historico', []);
  await storage.set('stats', { emails: 0, ameacas: 0, denuncias: 0 });
  await storage.set('ultimoResultado', null);

  renderHistorico([]);
  await saveStats({ emails: 0, ameacas: 0, denuncias: 0 });

  threatEmptyEl.style.display = 'block';
  threatCardEl.style.display = 'none';
  resetarBotaoDenunciar(btnDenunciar);

  const originalText = btn.textContent;
  btn.textContent = 'Dados apagados ✓';
  setTimeout(() => { btn.textContent = originalText; }, 1800);
});

// ---------- BOTÃO "ATIVAR PROTEÇÃO" (liga/desliga) + CARD DE STATUS ---------
const btnAtivarProtecao = document.getElementById('btn-ativar-protecao');
const heroStatus = document.getElementById('hero-status');
const heroStatusIcon = document.getElementById('hero-status-icon');
const heroStatusTitle = document.getElementById('hero-status-title');
const heroStatusSub = document.getElementById('hero-status-sub');

function renderBotaoProtecao(btn, ativada) {
  heroStatus.classList.toggle('hero-status--safe', ativada);
  heroStatusIcon.classList.toggle('hero-status__icon--safe', ativada);
  if (ativada) {
    heroStatusTitle.textContent = 'Proteção ativada';
    heroStatusSub.textContent = 'Seus e-mails estão sendo verificados';
    btn.textContent = 'Proteção ativada ✓';
    btn.classList.add('btn--ativo');
  } else {
    heroStatusTitle.textContent = 'Proteção desativada';
    heroStatusSub.textContent = 'Seus e-mails não estão sendo verificados';
    btn.textContent = 'Ativar proteção';
    btn.classList.remove('btn--ativo');
  }
}

btnAtivarProtecao.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const ativadaAtualmente = await storage.get('protecaoAtivada');
  const novoEstado = !ativadaAtualmente;
  renderBotaoProtecao(btn, novoEstado);
  await storage.set('protecaoAtivada', novoEstado);

  // ao ATIVAR (não ao desativar), mostra o toast de "novo e-mail" logo
  // em seguida, já que é o próximo passo natural do fluxo
  if (novoEstado) {
    setTimeout(mostrarToastNovoEmail, 200);
  }
});

// ao abrir o popup, recarrega o estado salvo do botão de proteção
storage.get('protecaoAtivada').then((ativada) => {
  renderBotaoProtecao(btnAtivarProtecao, !!ativada);
});

// ---------- BOTÃO "DENUNCIAR" ----------
const btnDenunciar = document.getElementById('btn-denunciar');

function marcarDenunciado(btn) {
  btn.textContent = 'Denunciado ✓';
  btn.disabled = true;
  btn.style.opacity = '0.75';
}

function resetarBotaoDenunciar(btn) {
  btn.textContent = 'Denunciar e-mail';
  btn.disabled = false;
  btn.style.opacity = '1';
}

btnDenunciar.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const stats = await getStats();
  stats.denuncias += 1;
  await saveStats(stats);
  marcarDenunciado(btn);

  // marca a denúncia no resultado salvo, pra manter o estado ao reabrir
  const ultimo = await storage.get('ultimoResultado');
  if (ultimo) {
    ultimo.denunciado = true;
    await storage.set('ultimoResultado', ultimo);
  }
});

// ---------- TOAST "NOVO E-MAIL DETECTADO" (flutua sobre o início) ----------
const novoEmailToast = document.getElementById('novoemail-toast');

function mostrarToastNovoEmail() {
  novoEmailToast.classList.add('active');
}
function esconderToastNovoEmail() {
  novoEmailToast.classList.remove('active');
}

// se o usuário tenta analisar um e-mail sem ter clicado em "Ativar proteção"
// primeiro, mostra um aviso visual (botão piscando) e mantém o usuário no
// início, sem gastar permissão de leitura da aba à toa
function irParaInicioEDestacarAtivarProtecao() {
  irParaTela('inicio');
  btnAtivarProtecao.classList.add('btn--pulse');
  setTimeout(() => btnAtivarProtecao.classList.remove('btn--pulse'), 3200);
}

btnSino.addEventListener('click', () => {
  mostrarToastNovoEmail();
});

document.getElementById('btn-toast-depois').addEventListener('click', () => {
  esconderToastNovoEmail();
});

document.getElementById('btn-toast-analisar').addEventListener('click', async () => {
  esconderToastNovoEmail();
  const protecaoAtivada = await storage.get('protecaoAtivada');
  if (!protecaoAtivada) {
    irParaInicioEDestacarAtivarProtecao();
    return;
  }
  irParaTela('permissao');
});

document.getElementById('btn-permissao-agora-nao').addEventListener('click', () => {
  irParaTela('inicio');
});

// ---------- OVERLAY DE ANÁLISE ----------
const overlayAnalise = document.getElementById('overlay-analise');
const bottomnav = document.getElementById('bottomnav');
const progressBar = document.getElementById('progress-bar');
const progressPct = document.getElementById('progress-pct');

function showOverlay(overlay) {
  bottomnav.style.display = 'none';
  overlay.classList.add('active');
}
function hideOverlays() {
  overlayAnalise.classList.remove('active');
  bottomnav.style.display = 'flex';
}

// ---------- TELA "NOVO E-MAIL" (leitura real da aba + confirmação/erro) ---
let emailExtraidoAtual = null;

const elCarregandoEmail = document.getElementById('carregando-email');
const elEmailPreview = document.getElementById('email-preview');
const elPreviewRemetente = document.getElementById('preview-remetente');
const elPreviewAssunto = document.getElementById('preview-assunto');
const elNovoEmailDesc = document.getElementById('novoemail-desc');
const elBtnMeProteger = document.getElementById('btn-me-proteger');
const elNoticeErro = document.getElementById('notice-erro');
const elBtnAnalisarNovamente = document.getElementById('btn-analisar-novamente');
const elBtnVoltarNovoEmail = document.getElementById('btn-voltar-novoemail');
const elIconNovoEmail = document.getElementById('icon-novoemail');

function resetarTelaNovoEmail() {
  elCarregandoEmail.style.display = 'none';
  elEmailPreview.style.display = 'none';
  elNovoEmailDesc.style.display = 'none';
  elBtnMeProteger.style.display = 'none';
  elNoticeErro.style.display = 'none';
  elBtnAnalisarNovamente.style.display = 'none';
  elBtnVoltarNovoEmail.style.display = 'none';
  emailExtraidoAtual = null;
}

// tenta pegar o e-mail real aberto na aba ativa (Gmail/Outlook) via
// content.js; se não conseguir (aba errada, nenhum e-mail aberto, extensão
// sem permissão, etc.), usa null e quem chamar decide o fallback
async function tentarExtrairEmailDaAbaAtiva() {
  let origin = null;
  let permissaoConcedidaAgora = false;

  try {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!aba?.id || !aba?.url) return null;

    const ehGmailOuOutlook =
      aba.url.includes('mail.google.com') ||
      aba.url.includes('outlook.live.com') ||
      aba.url.includes('outlook.office.com');
    if (!ehGmailOuOutlook) return null;

    origin = new URL(aba.url).origin + '/*';

    // pede a permissão sempre (mesmo que já tenha sido concedida antes,
    // a gente remove ela no "finally", então nunca fica "lembrada") —
    // a tela "Permitir acesso ao e-mail?" já preparou o usuário pra esse
    // prompt nativo do Chrome antes de chegarmos aqui
    permissaoConcedidaAgora = await chrome.permissions.request({ origins: [origin] });
    if (!permissaoConcedidaAgora) return null; // usuário negou a permissão

    await chrome.scripting.executeScript({
      target: { tabId: aba.id },
      files: ['content.js']
    });

    const resposta = await chrome.tabs.sendMessage(aba.id, { tipo: 'EXTRAIR_EMAIL_ATUAL' });
    if (!resposta || !resposta.corpo) return null;

    return {
      remetente: resposta.remetente || 'remetente não identificado',
      email_subject: resposta.assunto || '',
      email_text: resposta.corpo
    };
  } catch (err) {
    return null;
  } finally {
    if (permissaoConcedidaAgora && origin) {
      try { await chrome.permissions.remove({ origins: [origin] }); } catch (e) { /* ignora */ }
    }
  }
}

// faz a leitura da aba e atualiza a tela "Analisar e-mail" com o resultado
// (preview de remetente/assunto em caso de sucesso, ou aviso de erro)
async function lerEmailEAtualizarTela() {
  resetarTelaNovoEmail();
  elCarregandoEmail.style.display = 'block';
  elIconNovoEmail.classList.add('icon-pulse');

  const emailReal = await tentarExtrairEmailDaAbaAtiva();

  elCarregandoEmail.style.display = 'none';
  elIconNovoEmail.classList.remove('icon-pulse');

  if (!emailReal) {
    elNoticeErro.style.display = 'flex';
    elBtnAnalisarNovamente.style.display = 'block';
    elBtnVoltarNovoEmail.style.display = 'block';
    // não deu pra ler o e-mail, então desativa a proteção: ao voltar pro
    // início, o botão já aparece como "Ativar proteção" (não fica marcado
    // como ativado sem nunca ter analisado nada)
    await storage.set('protecaoAtivada', false);
    renderBotaoProtecao(btnAtivarProtecao, false);
    return;
  }

  emailExtraidoAtual = emailReal;
  elPreviewRemetente.textContent = emailReal.remetente;
  elPreviewAssunto.textContent = emailReal.email_subject || '(sem assunto)';
  elEmailPreview.style.display = 'block';
  elNovoEmailDesc.style.display = 'block';
  elBtnMeProteger.style.display = 'block';
}

// botão "Permitir análise" da tela de consentimento: dispara a leitura
// real (e o prompt nativo do Chrome) e avança pra tela "Analisar e-mail"
document.getElementById('btn-permitir-analise').addEventListener('click', () => {
  irParaTela('novoemail');
  lerEmailEAtualizarTela();
});

elBtnAnalisarNovamente.addEventListener('click', () => {
  lerEmailEAtualizarTela();
});
elBtnVoltarNovoEmail.addEventListener('click', () => irParaTela('inicio'));

// botão de voltar do overlay de análise -> volta pra tela de início
function backToInicio() {
  hideOverlays();
  irParaTela('inicio');
}
document.getElementById('btn-back-analise').addEventListener('click', backToInicio);

// chama a API real; se falhar (backend fora do ar, CORS, etc.),
// cai num fallback local simples baseado em palavras-chave
async function analisarEmail(sample) {
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_text: sample.email_text,
        email_subject: sample.email_subject,
        sender: sample.remetente
      })
    });

    if (!resp.ok) throw new Error('resposta HTTP ' + resp.status);

    const data = await resp.json();
    return {
      offline: false,
      risco: data.risco,
      motivos: (data.explicacao || []).map(p => p.descricao),
      modeloInfo: `Modelo: ${data.modelo_usado} · score ${data.score.toFixed(2)} · ${data.tempo_inferencia_ms.toFixed(2)}ms`
    };
  } catch (err) {
    // fallback local por palavras-chave, só pra não travar a demonstração
    const texto = (sample.email_text || '').toLowerCase();
    const palavrasSuspeitas = ['urgente', 'bloqueada', 'clique', 'senha', 'prêmio', 'pix', 'confirme seus dados'];
    const achadas = palavrasSuspeitas.filter(p => texto.includes(p));
    const risco = achadas.length >= 2 ? 'alto' : achadas.length === 1 ? 'medio' : 'baixo';
    return {
      offline: true,
      risco,
      motivos: achadas.length
        ? achadas.map(p => `Palavra suspeita encontrada: "${p}"`)
        : ['Nenhum padrão suspeito encontrado (análise local simplificada)'],
      modeloInfo: '⚠ Backend indisponível — usando análise local simplificada'
    };
  }
}

// Preenche a lista de motivos; se vier vazia (o classificador de regras não
// achou nenhuma palavra-chave suspeita, mesmo que o modelo de ML tenha dado
// um score alto), mostra uma frase explicando isso em vez de deixar em branco.
function renderListaMotivos(lista, motivos) {
  lista.innerHTML = '';
  if (motivos && motivos.length > 0) {
    motivos.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m;
      lista.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'Nenhuma palavra-chave suspeita identificada pelas regras (o nível de risco acima vem do modelo de machine learning).';
    li.style.fontStyle = 'italic';
    lista.appendChild(li);
  }
}

function renderMotivosERemetente(sample, resultado) {
  threatEmptyEl.style.display = 'none';
  threatCardEl.style.display = 'flex';

  document.getElementById('threat-remetente').textContent = sample.remetente;
  renderListaMotivos(document.getElementById('threat-motivos'), resultado.motivos);

  // linha discreta com info do modelo/status do backend
  let infoEl = document.getElementById('threat-model-info');
  if (!infoEl) {
    infoEl = document.createElement('p');
    infoEl.id = 'threat-model-info';
    infoEl.style.cssText = 'font-size:11px;opacity:0.65;margin-top:2px;';
    document.getElementById('threat-body').appendChild(infoEl);
  }
  infoEl.textContent = resultado.modeloInfo;

  resetarBotaoDenunciar(btnDenunciar);

  storage.set('ultimoResultado', {
    risco: resultado.risco,
    remetente: sample.remetente,
    motivos: resultado.motivos,
    modeloInfo: resultado.modeloInfo,
    denunciado: false
  });
}

// ao abrir o popup, recarrega o último resultado real (se existir) em vez
// de deixar o texto de exemplo fixo do HTML
const threatEmptyEl = document.getElementById('threat-empty');
const threatCardEl = document.getElementById('threat-card');

storage.get('ultimoResultado').then((ultimo) => {
  if (!ultimo) return; // mantém o estado vazio padrão

  threatEmptyEl.style.display = 'none';
  threatCardEl.style.display = 'flex';

  renderThreat(ultimo.risco);
  document.getElementById('threat-remetente').textContent = ultimo.remetente;
  renderListaMotivos(document.getElementById('threat-motivos'), ultimo.motivos);

  let infoEl = document.getElementById('threat-model-info');
  if (!infoEl) {
    infoEl = document.createElement('p');
    infoEl.id = 'threat-model-info';
    infoEl.style.cssText = 'font-size:11px;opacity:0.65;margin-top:2px;';
    document.getElementById('threat-body').appendChild(infoEl);
  }
  infoEl.textContent = ultimo.modeloInfo;

  if (ultimo.denunciado) marcarDenunciado(btnDenunciar);
});

// anima a barra de progresso com uma porcentagem visível enquanto a
// análise real acontece em paralelo; ao terminar, trava em 100% por um
// instante antes de mostrar o resultado (dá tempo do usuário perceber
// que o processo concluiu)
function iniciarAnimacaoProgresso() {
  let pct = 0;
  progressBar.style.width = '0%';
  progressPct.textContent = '0%';
  return setInterval(() => {
    pct = Math.min(pct + Math.random() * 10 + 5, 95);
    progressBar.style.width = pct.toFixed(0) + '%';
    progressPct.textContent = Math.floor(pct) + '%';
  }, 150);
}
async function concluirAnimacaoProgresso(intervalId) {
  clearInterval(intervalId);
  progressBar.style.width = '100%';
  progressPct.textContent = '100%';
  await new Promise((resolve) => setTimeout(resolve, 300));
}

document.getElementById('btn-me-proteger').addEventListener('click', async () => {
  const protecaoAtivada = await storage.get('protecaoAtivada');
  if (!protecaoAtivada) {
    irParaInicioEDestacarAtivarProtecao();
    return;
  }

  // usa o e-mail já extraído quando a tela abriu; se por algum motivo
  // não tiver (ex: aba mudou nesse meio-tempo), mostra o erro de novo
  if (!emailExtraidoAtual) {
    elNoticeErro.style.display = 'flex';
    elBtnAnalisarNovamente.style.display = 'block';
    elBtnVoltarNovoEmail.style.display = 'block';
    elBtnMeProteger.style.display = 'none';
    await storage.set('protecaoAtivada', false);
    renderBotaoProtecao(btnAtivarProtecao, false);
    return;
  }

  showOverlay(overlayAnalise);
  const progressoId = iniciarAnimacaoProgresso();

  try {
    const emailReal = emailExtraidoAtual;
    const resultado = await analisarEmail(emailReal);
    await concluirAnimacaoProgresso(progressoId);

    hideOverlays();

    const stats = await getStats();
    stats.emails += 1;

    const result = resultado.risco;
    if (result !== 'baixo') {
      stats.ameacas += 1;
    }
    await saveStats(stats);
    renderThreat(result);
    renderMotivosERemetente(emailReal, resultado);

    const motivoResumo = (resultado.motivos && resultado.motivos[0]) || THREAT_CONFIG[result].noticeDescPadrao;
    await addHistorico(result, emailReal.remetente, motivoResumo);
    await atualizarUltimaVerificacao();

    // leva o usuário para a tela de ameaças com o resultado
    irParaTela('ameacas');
  } catch (err) {
    console.error('Falha ao analisar o e-mail:', err);
    clearInterval(progressoId);
    hideOverlays();
    irParaTela('novoemail');
    elNoticeErro.style.display = 'flex';
    elBtnAnalisarNovamente.style.display = 'block';
    elBtnVoltarNovoEmail.style.display = 'block';
  }
});
