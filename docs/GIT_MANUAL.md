# Manual Objetivo de Git (Solo e Equipe)

## 1) Configuração inicial (uma vez)

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu.email@empresa.com"
git config --global init.defaultBranch main
```

## 2) Criar ou clonar projeto

### Clonar repositório existente

```bash
git clone https://github.com/<usuario>/<repositorio>.git
cd <repositorio>
```

### Iniciar repositório local e publicar no GitHub

```bash
git init
git add -A
git commit -m "chore: initial commit"
git branch -M main
git remote add origin https://github.com/<usuario>/<repositorio>.git
git push -u origin main
```

## 3) Fluxo Solo (dia a dia)

### Ver estado atual

```bash
git status
git log --oneline --graph --decorate -20
```

### Salvar mudanças

```bash
git add -A
git commit -m "feat: descreve a mudança"
```

### Enviar para GitHub

```bash
git push
```

### Atualizar branch local

```bash
git pull --rebase
```

## 4) Fluxo em Equipe (feature branch)

### Atualizar main local

```bash
git checkout main
git pull --rebase origin main
```

### Criar branch de trabalho

```bash
git checkout -b feature/nome-curto
```

### Trabalhar e versionar

```bash
git add -A
git commit -m "feat: nova funcionalidade"
git push -u origin feature/nome-curto
```

### Trazer alterações recentes da main para sua branch

```bash
git fetch origin
git rebase origin/main
```

### Finalizar

1. Abrir Pull Request no GitHub.
2. Após aprovação, fazer merge.
3. Sincronizar local:

```bash
git checkout main
git pull --rebase origin main
git branch -d feature/nome-curto
git push origin --delete feature/nome-curto
```

## 5) Comandos de correção rápida

### Desfazer arquivo modificado (não commitado)

```bash
git restore caminho/do/arquivo
```

### Tirar arquivo do stage

```bash
git restore --staged caminho/do/arquivo
```

### Alterar mensagem do último commit (ainda não enviado)

```bash
git commit --amend -m "mensagem corrigida"
```

### Guardar trabalho temporário

```bash
git stash push -m "wip"
git stash list
git stash pop
```

## 6) Padrão de mensagens de commit (sugestão)

- feat: nova funcionalidade
- fix: correção de bug
- docs: documentação
- refactor: refatoração sem alterar comportamento
- test: testes
- chore: manutenção técnica

Exemplos:

```bash
git commit -m "feat: adicionar endpoint de analytics"
git commit -m "fix: corrigir validação de salesOrgCode"
```

## 7) Checklist antes de push

1. Rodar testes e lint.
2. Validar arquivos alterados com git status.
3. Revisar diff:

```bash
git diff --staged
```

1. Confirmar que não há segredos/token em arquivos.

## 8) Erros comuns e solução

### error: src refspec main does not match any

Causa: branch sem commit.

Solução:

```bash
git add -A
git commit -m "chore: initial commit"
git push -u origin main
```

### rejected (non-fast-forward)

Causa: remoto tem commits que você não trouxe.

Solução:

```bash
git pull --rebase origin main
git push
```
