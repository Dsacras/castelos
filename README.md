# Castelo ou Mistério?

Quiz fotográfico, em português, sobre castelos de Portugal. A mecânica é inspirada em concursos televisivos: 12 perguntas, quatro respostas, Jokers que eliminam opções e uma árvore de prémios virtual.

## Executar

Como o jogo carrega um ficheiro JSON, deve ser aberto através de um servidor local:

```powershell
python -m http.server 8000
```

Depois, abrir `http://localhost:8000`.

## Publicação no GitHub Pages

O projeto é publicado diretamente a partir da raiz do ramo principal. O ficheiro
`.nojekyll` indica ao GitHub Pages que deve servir os ficheiros estáticos sem os
processar com Jekyll.

## Atualizar o catálogo

O gerador consulta a lista de fortificações da Wikipédia em português e conserva apenas artigos de castelos com imagem principal:

```powershell
.\scripts\generate-castles.ps1
```

As fotografias são servidas pela Wikimedia e cada pergunta liga à página do ficheiro, onde constam autor e licença. A lista é extensa, mas não representa necessariamente todos os castelos existentes: depende da cobertura e das imagens disponíveis nos projetos Wikimedia.

