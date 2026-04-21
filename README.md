# AgendaEstudo

Agenda web (Angular) com eventos locais, notas e vista calendário.

## GitHub Pages

O site estático gerado pelo Angular está na pasta **`docs/`**.

1. No repositório GitHub: **Settings → Pages**
2. **Build and deployment**: Branch **main**, pasta **/docs**
3. O site fica em: **https://Ivancf-Bezerra.github.io/AgendaEstudo/**

Para voltar a gerar `docs/` após alterações no código:

```bash
cd agenda-frontend
npx ng build --configuration=production --base-href=/AgendaEstudo/
```

Depois copie o conteúdo de `dist/agenda-frontend/browser/` para `docs/` na raiz deste repositório e crie/atualize o ficheiro vazio `.nojekyll` dentro de `docs/`.

## Desenvolvimento

```bash
cd agenda-frontend
npm install
ng serve
```
# AgendaEstudo
