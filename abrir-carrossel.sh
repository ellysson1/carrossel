#!/usr/bin/env bash
# Atalho para Mac e Linux: dê dois cliques (ou rode ./abrir-carrossel.sh).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "O Node.js não está instalado. Instale o Node LTS em https://nodejs.org e abra de novo."
  read -r -p "Enter para fechar."
  exit 1
fi

# o app se atualiza sozinho; falha de rede ou alteração local nunca impede de abrir
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  # o app regera este arquivo a cada subida: restaura antes de comparar
  [ -n "$(git status --porcelain -- artifact/index.html 2>/dev/null)" ] && git checkout -- artifact/index.html 2>/dev/null
  if [ -z "$(git status --porcelain)" ]; then
    antes=$(git rev-parse HEAD)
    if git pull --ff-only >/dev/null 2>&1; then
      depois=$(git rev-parse HEAD)
      [ "$antes" != "$depois" ] && echo "Atualizado: $(git rev-list --count "$antes..$depois") novidade(s)."
    else
      echo "Não consegui atualizar agora. Seguindo com a versão local."
    fi
  else
    echo "Você tem alterações locais: pulei a atualização."
  fi
fi

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "Primeira vez: instalando o que o app precisa."
  npm install && npx playwright install chromium || exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Criei o arquivo .env. Coloque a sua chave de imagem nele e abra de novo."
  "${EDITOR:-nano}" .env
fi

echo "Subindo o app. Deixe este terminal aberto enquanto estiver usando."
npm start -- --rede
