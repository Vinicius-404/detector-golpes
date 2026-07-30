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
let historicoExpanded = false;

// ---------- NAVEGAÇÃO ENTRE TELAS (bottom nav) ----------
const navButtons = document.querySelectorAll('.navbtn');
const screens = document.querySelectorAll('.screen');

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    navButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.screen;
    screens.forEach(s => s.classList.toggle('active', s.id === `screen-${target}`));
  });
});

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

  document.querySelectorAll('.demo-switch__btn').forEach(b => {
    b.classList.toggle('active', b.dataset.level === level);
  });
}
renderThreat(currentLevel);

document.querySelectorAll('.demo-switch__btn').forEach(btn => {
  btn.addEventListener('click', () => renderThreat(btn.dataset.level));
});

// ---------- HISTÓRICO DE AMEAÇAS (expandir/colapsar) ----------
const historicoToggle = document.getElementById('historico-toggle');
const historicoList = document.getElementById('historico-list');
const historicoChevron = document.getElementById('historico-chevron');
const historicoSub = document.getElementById('historico-sub');

historicoToggle.addEventListener('click', () => {
  historicoExpanded = !historicoExpanded;
  historicoList.classList.toggle('expanded', historicoExpanded);
  historicoChevron.classList.toggle('rotated', historicoExpanded);
  historicoSub.textContent = historicoExpanded
    ? 'Clique para esconder seu histórico de ameaças'
    : 'Clique para ver seu histórico de ameaças';
});

// ---------- BOTÃO "ATIVAR PROTEÇÃO" ----------
document.getElementById('btn-ativar-protecao').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  btn.textContent = 'Proteção ativada ✓';
  btn.disabled = true;
  btn.style.opacity = '0.75';
});

// ---------- BOTÃO "DENUNCIAR" ----------
document.getElementById('btn-denunciar').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const counter = document.getElementById('stat-denuncias');
  counter.textContent = String(Number(counter.textContent) + 1).padStart(2, '0');
  btn.textContent = 'Denunciado ✓';
  btn.disabled = true;
  btn.style.opacity = '0.75';
});

// ---------- OVERLAYS: NOVO E-MAIL -> ANÁLISE -> RESULTADO ----------
const overlayNewEmail = document.getElementById('overlay-newemail');
const overlayAnalise = document.getElementById('overlay-analise');
const bottomnav = document.getElementById('bottomnav');
const progressBar = document.getElementById('progress-bar');

function showOverlay(overlay) {
  bottomnav.style.display = 'none';
  overlayNewEmail.classList.remove('active');
  overlayAnalise.classList.remove('active');
  overlay.classList.add('active');
}

function hideOverlays() {
  overlayNewEmail.classList.remove('active');
  overlayAnalise.classList.remove('active');
  bottomnav.style.display = 'flex';
}

// botão do sino simula a chegada de um novo e-mail (fluxo de demonstração)
document.getElementById('btn-simulate-email').addEventListener('click', () => {
  showOverlay(overlayNewEmail);
});

// botões de voltar dos overlays -> volta pra tela de início
function backToInicio() {
  hideOverlays();
  navButtons.forEach(b => b.classList.remove('active'));
  document.querySelector('.navbtn[data-screen="inicio"]').classList.add('active');
  screens.forEach(s => s.classList.toggle('active', s.id === 'screen-inicio'));
}
document.getElementById('btn-back-newemail').addEventListener('click', backToInicio);
document.getElementById('btn-back-analise').addEventListener('click', backToInicio);

document.getElementById('btn-me-proteger').addEventListener('click', () => {
  showOverlay(overlayAnalise);
  progressBar.style.width = '0%';

  requestAnimationFrame(() => {
    progressBar.style.width = '100%';
  });

  setTimeout(() => {
    hideOverlays();

    // atualiza contador de e-mails analisados
    const emailCounter = document.getElementById('stat-emails');
    emailCounter.textContent = String(Number(emailCounter.textContent) + 1).padStart(2, '0');

    // sorteia um nível de ameaça pra demonstrar o resultado
    const levels = ['alto', 'medio', 'baixo'];
    const result = levels[Math.floor(Math.random() * levels.length)];
    if (result !== 'baixo') {
      const ameacaCounter = document.getElementById('stat-ameacas');
      ameacaCounter.textContent = String(Number(ameacaCounter.textContent) + 1).padStart(2, '0');
    }
    renderThreat(result);

    // leva o usuário para a tela de ameaças com o resultado
    navButtons.forEach(b => b.classList.remove('active'));
    document.querySelector('.navbtn[data-screen="ameacas"]').classList.add('active');
    screens.forEach(s => s.classList.toggle('active', s.id === 'screen-ameacas'));
  }, 1800);
});
