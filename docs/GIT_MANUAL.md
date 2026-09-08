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

## 9) Corrupção de `.git` por sincronização externa (Google Drive/Dropbox/OneDrive)

**Nunca mantenha um repositório git dentro de uma pasta sincronizada por
serviço de nuvem tipo Google Drive.** O sync mexe em arquivos internos do
`.git` (`refs/`, `logs/`, `objects/`) fora do controle atômico do próprio
Git, causando corrupção silenciosa e progressiva — sintomas vistos aqui:

1. `fatal: You are on a branch yet to be born` — mesmo com objetos reais
   já existindo em `.git/objects/`
2. Logo depois, `fatal: bad object HEAD` — corrupção mais severa
3. `.git/refs/heads/` vazio, mas `.git/HEAD` ainda apontando pra
   `refs/heads/main` — a referência sumiu, os objetos (por enquanto)
   continuavam
4. **A corrupção pode continuar acontecendo enquanto você investiga** —
   `.git/logs/` existia num `ls -la`, sumiu no comando seguinte. Isso
   indica sync ativo mexendo no repositório em tempo real, não um estado
   corrompido estático

### Diagnóstico (nessa ordem, sem pressa)

```bash
cat .git/HEAD                    # confirma pra onde HEAD aponta
ls -la .git/refs/heads/          # confere se a ref existe
git fsck --full                  # lista corrupção real, ou confirma
                                  # object database vazio
```

### Se `git fsck` mostrar objetos reais (recuperável)

Procure commits "soltos" (sem referência) direto no object store:

```bash
git fsck --full --no-reflog --unreachable --dangling
```

Se aparecer um hash de "dangling commit", aponte a branch de volta pra
ele sem perder nada:

```bash
git update-ref refs/heads/main <hash-do-commit>
```

### Se `git fsck` mostrar object database vazio (não recuperável)

Prioridade não é mais o histórico de commits — é confirmar que os
**arquivos do projeto em si** (não o histórico de versão) sobreviveram:

```bash
ls -la srv/          # ou qualquer pasta central do projeto
wc -l <arquivo-chave-grande>
```

Se os arquivos estiverem intactos (o mais comum — o sync corrompe o
`.git`, não o código em si), pare a sincronização (pause o app do Google
Drive) e **copie o projeto inteiro pra fora da pasta sincronizada antes
de continuar**:

```bash
cp -r ~/GoogleDriveSync/caminho/do/projeto ~/projeto-recuperado
cd ~/projeto-recuperado
rm -rf .git
git init
git branch -M main
git add -A
git status    # revisar antes de comitar - checar .gitignore
git commit -m "chore: commit inicial (recuperado apos corrupcao do .git via sync de nuvem)"
```

O histórico de commits anterior não é recuperável nesse cenário, mas o
código-fonte sim — e é o que importa de verdade.

### Prevenção

Se precisar sincronizar um projeto entre máquinas, publique num GitHub
próprio (ou GitLab/Bitbucket) — nunca dependa de sync de arquivo genérico
pra isso. É exatamente pra esse problema que o controle de versão
distribuído existe.
