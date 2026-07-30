# 🛡️ Proteção contra Golpes

Extensão de navegador (Chrome, Manifest V3) para alertar usuários sobre e-mails suspeitos de phishing e golpes, analisando o remetente e o conteúdo da mensagem.

> Front-end desenvolvido a partir do protótipo no Figma: [apicativo](https://www.figma.com/design/8CdJoHjXJzSWibTndczNwQ/apicativo)

![status](https://img.shields.io/badge/status-front--end%20mockado-yellow)
![manifest](https://img.shields.io/badge/manifest-v3-blue)

## 📱 Telas implementadas

| Tela | Descrição |
|---|---|
| **Início** | Card de ativação da proteção + resumo de estatísticas + última verificação |
| **Ameaças** | Resultado da análise do e-mail (Alto / Médio / Baixo risco) + histórico expansível |
| **Configurações** | Lista de preferências com toggles (switches) |
| **Pop-up: e-mail novo** | Overlay exibido quando um novo e-mail é detectado na página |
| **Em análise** | Overlay de carregamento enquanto a mensagem é "verificada" |

---

## 🗂️ Estrutura de arquivos

```
extension/
├── manifest.json      # Configuração da extensão (Manifest V3)
├── popup.html          # Estrutura de todas as telas do popup
├── style.css           # Estilos (cores, layout, componentes)
├── script.js           # Navegação entre telas e simulação de fluxos
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## ▶️ Como testar localmente

1. Baixe/clone este repositório.
2. Abra o Chrome (ou outro navegador baseado em Chromium) e acesse `chrome://extensions`.
3. Ative o **"Modo de desenvolvedor"** (canto superior direito).
4. Clique em **"Carregar sem compactação"** (*Load unpacked*).
5. Selecione a pasta `extension/`.
6. O ícone da extensão vai aparecer na barra de ferramentas — clique para abrir o popup.

### Simulando o fluxo de detecção

Dentro do popup, clique no sininho 🔔 no topo para simular a chegada de um e-mail novo. Isso abre o overlay de aviso → **"Me proteger!"** → tela de análise → resultado aleatório (Alto/Médio/Baixo) já refletido na aba **Ameaças**.

Também há botões de atalho (**Demo — nível**) na aba Ameaças para alternar rapidamente entre os três estados sem precisar rodar o fluxo completo.

---

## 🎨 Paleta de cores

| Cor | Hex | Uso |
|---|---|---|
| Roxo primário | `#5B22B0` | Topbar, botões primários, navegação ativa |
| Verde | `#59CD57` / `#24A522` | Estado seguro, botão "Me proteger" |
| Vermelho | `#FF494C` | Ameaça alta, botão "Denunciar" |
| Laranja | `#FFB923` | Ameaça média, avisos |
| Cinza claro | `#F1F1F1` | Fundo geral |

---

## 🚧 Próximos passos (roadmap)

- [ ] Persistir configurações com `chrome.storage.sync`
- [ ] Criar content script para ler e-mails na página (Gmail/Outlook)
- [ ] Conectar a uma API/back-end real de análise de phishing
- [ ] Guardar histórico de ameaças de verdade (com data, remetente e nível)
- [ ] Sistema de denúncia funcional (enviar para back-end/serviço externo)

---

## 🛠️ Tecnologias

- HTML5 / CSS3 / JavaScript puro (sem frameworks)
- Chrome Extensions Manifest V3

---

## 📄 Licença

Defina aqui a licença do projeto (ex: MIT).
