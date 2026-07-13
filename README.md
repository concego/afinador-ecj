# Afinador ECJ 🐉

Afinador web para instrumentos musicais — projeto do canal **Eu Concego Jogar**.

## Como usar

Abra `index.html` no navegador (ou acesse via GitHub Pages), escolha o instrumento, clique em **Iniciar afinação** e toque uma corda.

## Estrutura

```
afinador-ecj/
├── index.html              ← Página principal
├── app.js                  ← Controlador principal
├── style.css               ← Estilos
├── core/
│   └── pitch.js            ← Detecção de pitch (algoritmo YIN)
└── instruments/
    ├── violao.js           ← Violão — afinação padrão E
    └── ukulele.js          ← Ukulele — afinação padrão G
```

## Princípios de design

- **Inclusão acima de acessibilidade isolada** — funciona para todos, com ou sem leitor de tela
- **Sem feedback sonoro próprio** — o leitor de tela (NVDA/TalkBack) lê o resultado
- **100% client-side** — sem backend, sem instalação
- **Sem PWA** na versão inicial — facilita o desenvolvimento e as atualizações

## Adicionar novo instrumento

1. Crie `instruments/novo.js` seguindo o padrão de `violao.js`
2. Importe e registre em `app.js`
3. Adicione o botão de seleção em `index.html`

## Hospedagem

GitHub Pages: `concego.github.io/afinador-ecj`
