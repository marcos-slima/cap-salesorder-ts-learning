# Getting Started

Welcome to your new CAP project.

It contains these folders and files, following our recommended project layout:

File or Folder | Purpose
---------|----------
`app/` | content for UI frontends goes here
`db/` | your domain models and data go here
`srv/` | your service models and code go here
`readme.md` | this getting started guide

## Next Steps

- Open a new terminal and run `cds watch`
- (in VS Code simply choose _**Terminal** > Run Task > cds watch_)
- Start with your domain model, in a CDS file in `db/`

## Learn More

Learn more at <https://cap.cloud.sap>.
---

## Git — Referência Rápida

### Solo
```bash
git status                          # ver estado
git add -A && git commit -m "..."   # salvar
git push                            # publicar
git pull --rebase                   # atualizar
```

### Equipe (feature branch)
```bash
git checkout main && git pull --rebase origin main
git checkout -b feature/nome-curto  # criar branch
# ... trabalhar e commitar ...
git push -u origin feature/nome-curto
# abrir Pull Request no GitHub
git checkout main && git pull --rebase origin main
git branch -d feature/nome-curto
```

### Correcções rápidas
```bash
git restore <ficheiro>              # descartar mudança local
git restore --staged <ficheiro>     # tirar do stage
git commit --amend -m "..."         # corrigir último commit
git stash push -m "wip"             # guardar temporariamente
git stash pop                       # restaurar
```

> Manual completo: [docs/GIT_MANUAL.md](docs/GIT_MANUAL.md)