// ---------- CONFIG DA API ----------
const API_URL = 'http://localhost:8000/analisar-email';

// ---------- STORAGE (chrome.storage.local, com fallback para testes fora da extensão) ----------
const storage = {
  get(key) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([key], (result) => resolve(result[key]));
      } else {
        try { resolve(JSON.parse(window.__devStorage?.[key] ?? 'null')); }
        catch (e) { resolve(null); }
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
const LEVEL_LABEL = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };

function formatAgora() {
  const d = new Date();
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', weekday: 'long' }) +
    ', ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ---------- CONFIG POR NÍVEL DE AMEAÇA ----------
const THREAT_CONFIG = {
  alto: {
    cardClass: 'threat-card--alto',
    badgeClass: 'badge--alto',
    badgeText: 'Alto',
    iconBadgeClass: 'icon-badge--alto',
    title: 'Ameaça detectada:',
    showReport: true,
    icon: `<path d="M12 3 2 20h20L12 3Z" stroke="#FF494C" stroke-width="2" stroke-linejoin="round"/><path d="M12 9.5v4.2" stroke="#FF494C" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.8" r="1.1" fill="#FF494C"/>`
  },
  medio: {
    cardClass: 'threat-card--medio',
    badgeClass: 'badge--medio',
    badgeText: 'Médio',
    iconBadgeClass: 'icon-badge--medio',
    title: 'Ameaça detectada:',
    showReport: true,
    icon: `<path d="M12 3 2 20h20L12 3Z" fill="#FFB923"/><path d="M12 9.5v4.2" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.8" r="1.1" fill="#fff"/>`
  },
  baixo: {
    cardClass: 'threat-card--baixo',
    badgeClass: 'badge--baixo',
    badgeText: 'Baixo',
    iconBadgeClass: 'icon-badge--baixo',
    title: 'E-mail seguro: <small style="display:block;font-weight:400;font-size:11px;margin-top:2px;">Nenhuma ameaça detectada</small>',
    showReport: false,
    icon: `<path d="M5 12.5 10 17 19 7" stroke="#59CD57" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`
  }
};

let currentLevel = 'alto';

// ---------- NAVEGAÇÃO ENTRE TELAS (bottom nav) ----------
const navButtons = document.querySelectorAll('.navbtn');
const screens = document.querySelectorAll('.screen');
const btnSino = document.getElementById('btn-simulate-email');

// o sino (que abre o fluxo de "novo e-mail detectado") só faz sentido
// na tela Início — nas outras abas ele fica escondido
function atualizarVisibilidadeSino() {
  const inicioEstaAtivo = document.getElementById('screen-inicio').classList.contains('active');
  btnSino.style.visibility = inicioEstaAtivo ? 'visible' : 'hidden';
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    navButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.screen;
    screens.forEach(s => s.classList.toggle('active', s.id === `screen-${target}`));
    atualizarVisibilidadeSino();
  });
});

atualizarVisibilidadeSino();

// ---------- RENDER DO CARD DE AMEAÇA ----------
function renderThreat(level) {
  currentLevel = level;
  const cfg = THREAT_CONFIG[level];

  const card = document.getElementById('threat-card');
  card.className = 'card threat-card ' + cfg.cardClass;

  const badge = document.getElementById('threat-badge');
  badge.className = 'badge ' + cfg.badgeClass;
  badge.textContent = cfg.badgeText;

  document.getElementById('threat-title').innerHTML = cfg.title;

  const iconBadge = document.getElementById('threat-icon-badge');
  iconBadge.className = 'icon-badge ' + cfg.iconBadgeClass;

  document.getElementById('threat-icon-svg').innerHTML = cfg.icon;

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
    historicoList.innerHTML = '<p class="historico__empty" id="historico-empty">Nenhuma análise ainda. Simule um e-mail novo (🔔) pra começar.</p>';
    return;
  }
  items.forEach((item) => {
    const bar = document.createElement('div');
    bar.className = `historico__bar historico__bar--${item.level}`;
    bar.innerHTML = `
      <span><strong>${LEVEL_LABEL[item.level]}</strong> · ${item.remetente}</span>
      <span>${item.quando}</span>
    `;
    historicoList.appendChild(bar);
  });
}

async function getHistorico() {
  return (await storage.get('historico')) || [];
}

// adiciona no topo; se passar de MAX_HISTORICO, remove o mais antigo (FIFO)
async function addHistorico(level, remetente) {
  const items = await getHistorico();
  items.unshift({ level, remetente, quando: formatAgora() });
  const limitado = items.slice(0, MAX_HISTORICO);
  await storage.set('historico', limitado);
  renderHistorico(limitado);
}

historicoToggle.addEventListener('click', () => {
  historicoExpanded = !historicoExpanded;
  historicoList.classList.toggle('expanded', historicoExpanded);
  historicoChevron.classList.toggle('rotated', historicoExpanded);
  historicoSub.textContent = historicoExpanded
    ? 'Clique para esconder seu histórico de ameaças'
    : 'Clique para ver seu histórico de ameaças';
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
storage.get('ultimaVerificacao').then((val) => {
  if (val) ultimaVerificacaoEl.textContent = val;
});

getStats().then(saveStats);

// ---------- CONFIGURAÇÕES ----------
const cfgNotificacoes = document.getElementById('cfg-notificacoes');
const cfgSom = document.getElementById('cfg-som');

// carrega as preferências salvas (por padrão, ambas ligadas)
storage.get('cfgNotificacoes').then((val) => {
  cfgNotificacoes.checked = val === undefined ? true : val;
});
storage.get('cfgSom').then((val) => {
  cfgSom.checked = val === undefined ? true : val;
});

cfgNotificacoes.addEventListener('change', () => {
  storage.set('cfgNotificacoes', cfgNotificacoes.checked);
});
cfgSom.addEventListener('change', () => {
  storage.set('cfgSom', cfgSom.checked);
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

// ---------- BOTÃO "ATIVAR PROTEÇÃO" (liga/desliga) ----------
const btnAtivarProtecao = document.getElementById('btn-ativar-protecao');

function renderBotaoProtecao(btn, ativada) {
  if (ativada) {
    btn.textContent = 'Proteção ativada ✓';
    btn.classList.add('btn--ativo');
  } else {
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

  // ao ATIVAR (não ao desativar), leva o usuário direto pra tela de
  // "novo e-mail", já que é o próximo passo natural do fluxo
  if (novoEstado) {
    setTimeout(irParaTelaNovoEmail, 200);
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
  btn.textContent = 'Denunciar';
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

// ---------- OVERLAY DE ANÁLISE + CARD EMBUTIDO "NOVO E-MAIL" ----------
const overlayAnalise = document.getElementById('overlay-analise');
const bottomnav = document.getElementById('bottomnav');
const progressBar = document.getElementById('progress-bar');

function showOverlay(overlay) {
  bottomnav.style.display = 'none';
  overlayAnalise.classList.remove('active');
  overlay.classList.add('active');
}

function hideOverlays() {
  overlayAnalise.classList.remove('active');
  bottomnav.style.display = 'flex';
}

// guarda o e-mail já extraído da aba ativa, pra não precisar extrair de
// novo quando o usuário clicar em "Analisar agora"
let emailExtraidoAtual = null;

const elCarregandoEmail = document.getElementById('carregando-email');
const elEmailPreview = document.getElementById('email-preview');
const elPreviewRemetente = document.getElementById('preview-remetente');
const elPreviewAssunto = document.getElementById('preview-assunto');
const elNovoEmailDesc = document.getElementById('novoemail-desc');
const elBtnMeProteger = document.getElementById('btn-me-proteger');
const elBtnVoltarNovoEmail = document.getElementById('btn-voltar-novoemail');

// volta pra tela de início a partir da tela "novo e-mail" (mesmo destino
// do botão "início" da barra inferior)
function voltarParaInicioDeNovoEmail() {
  document.querySelector('.navbtn[data-screen="inicio"]').click();
}
elBtnVoltarNovoEmail.addEventListener('click', voltarParaInicioDeNovoEmail);

// leva pra tela "novo e-mail detectado" (mesmo padrão de tamanho das
// outras telas — não é mais overlay nem card embutido no Início) e já
// tenta extrair o e-mail da aba ativa pra mostrar remetente/assunto
// antes de perguntar se o usuário quer analisar
async function irParaTelaNovoEmail() {
  document.getElementById('protecao-warning').style.display = 'none';
  document.getElementById('extracao-erro').style.display = 'none';
  elEmailPreview.style.display = 'none';
  elNovoEmailDesc.style.display = 'none';
  elBtnMeProteger.style.display = 'none';
  elBtnVoltarNovoEmail.style.display = 'none';
  elCarregandoEmail.style.display = 'block';
  emailExtraidoAtual = null;

  screens.forEach(s => s.classList.toggle('active', s.id === 'screen-novoemail'));
  atualizarVisibilidadeSino();

  const emailReal = await tentarExtrairEmailDaAbaAtiva();
  elCarregandoEmail.style.display = 'none';

  if (!emailReal) {
    document.getElementById('extracao-erro').style.display = 'block';
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

// botão do sino leva direto pra tela de novo e-mail
document.getElementById('btn-simulate-email').addEventListener('click', irParaTelaNovoEmail);

// botão de voltar do overlay de análise -> volta pra tela de início
function backToInicio() {
  hideOverlays();
  navButtons.forEach(b => b.classList.remove('active'));
  document.querySelector('.navbtn[data-screen="inicio"]').classList.add('active');
  screens.forEach(s => s.classList.toggle('active', s.id === 'screen-inicio'));
  atualizarVisibilidadeSino();
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
  threatCardEl.style.display = 'block';

  const quando = formatAgora();
  document.getElementById('threat-remetente').textContent = sample.remetente;
  document.getElementById('threat-quando').textContent = quando;

  renderListaMotivos(document.getElementById('threat-motivos'), resultado.motivos);

  // linha discreta com info do modelo/status do backend
  let infoEl = document.getElementById('threat-model-info');
  if (!infoEl) {
    infoEl = document.createElement('p');
    infoEl.id = 'threat-model-info';
    infoEl.style.cssText = 'font-size:11px;opacity:0.65;margin-top:8px;';
    document.getElementById('threat-body').appendChild(infoEl);
  }
  infoEl.textContent = resultado.modeloInfo;

  // reseta o botão de denúncia pra cada nova análise (ainda não denunciada)
  resetarBotaoDenunciar(btnDenunciar);

  // salva o último resultado pra reaparecer quando o popup for reaberto
  storage.set('ultimoResultado', {
    risco: resultado.risco,
    remetente: sample.remetente,
    quando,
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
  threatCardEl.style.display = 'block';

  renderThreat(ultimo.risco);
  document.getElementById('threat-remetente').textContent = ultimo.remetente;
  document.getElementById('threat-quando').textContent = ultimo.quando;

  renderListaMotivos(document.getElementById('threat-motivos'), ultimo.motivos);

  let infoEl = document.getElementById('threat-model-info');
  if (!infoEl) {
    infoEl = document.createElement('p');
    infoEl.id = 'threat-model-info';
    infoEl.style.cssText = 'font-size:11px;opacity:0.65;margin-top:8px;';
    document.getElementById('threat-body').appendChild(infoEl);
  }
  infoEl.textContent = ultimo.modeloInfo;

  if (ultimo.denunciado) marcarDenunciado(btnDenunciar);
});

// tenta pegar o e-mail real aberto na aba ativa (Gmail/Outlook) via
// content.js; se não conseguir (aba errada, nenhum e-mail aberto, extensão
// sem permissão, etc.), usa null e quem chamar decide o fallback
async function tentarExtrairEmailDaAbaAtiva() {
  let origin = null;
  let permissaoConcedidaAgora = false;

  try {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!aba?.id || !aba?.url) return null;

    // só faz sentido pedir permissão/ler se a aba for Gmail ou Outlook
    const ehGmailOuOutlook =
      aba.url.includes('mail.google.com') ||
      aba.url.includes('outlook.live.com') ||
      aba.url.includes('outlook.office.com');
    if (!ehGmailOuOutlook) return null;

    origin = new URL(aba.url).origin + '/*';

    // pede a permissão sempre (mesmo que já tenha sido concedida antes,
    // a gente remove ela no "finally", então nunca fica "lembrada")
    permissaoConcedidaAgora = await chrome.permissions.request({ origins: [origin] });
    if (!permissaoConcedidaAgora) return null; // usuário negou a permissão

    // injeta o content.js na aba (não é mais carregado automaticamente,
    // já que a permissão agora é opcional/sob demanda)
    await chrome.scripting.executeScript({
      target: { tabId: aba.id },
      files: ['content.js']
    });

    const resposta = await chrome.tabs.sendMessage(aba.id, { tipo: 'EXTRAIR_EMAIL_ATUAL' });
    if (!resposta || !resposta.corpo) return null; // nada útil extraído

    return {
      remetente: resposta.remetente || 'remetente não identificado',
      email_subject: resposta.assunto || '',
      email_text: resposta.corpo
    };
  } catch (err) {
    // sem content script na aba, permissão negada, aba não respondeu,
    // ou qualquer outro erro inesperado nas APIs do Chrome
    return null;
  } finally {
    // sempre remove a permissão no final, dando erro ou não, pra ela ser
    // pedida de novo da próxima vez que clicar em "Me proteger!"
    if (permissaoConcedidaAgora && origin) {
      try { await chrome.permissions.remove({ origins: [origin] }); } catch (e) { /* ignora */ }
    }
  }
}

// se o usuário tenta analisar um e-mail sem ter clicado em "Ativar proteção"
// primeiro, mostra um aviso e depois leva de volta pro Início, destacando
// o botão "Ativar proteção" (agora fica numa tela separada da de "novo e-mail")
function irParaInicioEDestacarAtivarProtecao() {
  navButtons.forEach(b => b.classList.remove('active'));
  document.querySelector('.navbtn[data-screen="inicio"]').classList.add('active');
  screens.forEach(s => s.classList.toggle('active', s.id === 'screen-inicio'));
  atualizarVisibilidadeSino();

  btnAtivarProtecao.classList.add('btn--pulse');
  setTimeout(() => btnAtivarProtecao.classList.remove('btn--pulse'), 3200);
}

document.getElementById('btn-me-proteger').addEventListener('click', async () => {
  const protecaoAtivada = await storage.get('protecaoAtivada');
  if (!protecaoAtivada) {
    document.getElementById('protecao-warning').style.display = 'block';
    setTimeout(irParaInicioEDestacarAtivarProtecao, 1400);
    return;
  }

  // usa o e-mail já extraído quando a tela abriu; se por algum motivo
  // não tiver (ex: aba mudou nesse meio-tempo), mostra o erro de novo
  // e desativa a proteção, assim como no erro de extração inicial
  if (!emailExtraidoAtual) {
    document.getElementById('extracao-erro').style.display = 'block';
    elBtnVoltarNovoEmail.style.display = 'block';
    elBtnMeProteger.style.display = 'none';
    await storage.set('protecaoAtivada', false);
    renderBotaoProtecao(btnAtivarProtecao, false);
    return;
  }

  showOverlay(overlayAnalise);
  progressBar.style.width = '0%';

  requestAnimationFrame(() => {
    progressBar.style.width = '100%';
  });

  (async () => {
    try {
      const emailReal = emailExtraidoAtual;

      const resultado = await analisarEmail(emailReal);

      hideOverlays();

      // atualiza contador de e-mails analisados (persistente)
      const stats = await getStats();
      stats.emails += 1;

      const result = resultado.risco;
      if (result !== 'baixo') {
        stats.ameacas += 1;
      }
      await saveStats(stats);
      renderThreat(result);
      renderMotivosERemetente(emailReal, resultado);

      // registra no histórico (mantém só os 3 mais recentes)
      await addHistorico(result, emailReal.remetente);

      // atualiza "última verificação"
      const agora = formatAgora();
      ultimaVerificacaoEl.textContent = agora;
      await storage.set('ultimaVerificacao', agora);

      // leva o usuário para a tela de ameaças com o resultado
      navButtons.forEach(b => b.classList.remove('active'));
      document.querySelector('.navbtn[data-screen="ameacas"]').classList.add('active');
      screens.forEach(s => s.classList.toggle('active', s.id === 'screen-ameacas'));
      atualizarVisibilidadeSino();
    } catch (err) {
      // rede de segurança: qualquer erro inesperado no meio do processo
      // volta pro aviso de erro em vez de travar na tela "Em análise"
      console.error('Falha ao analisar o e-mail:', err);
      hideOverlays();
      document.getElementById('extracao-erro').style.display = 'block';
    }
  })();
});
