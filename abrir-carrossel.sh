#!/usr/bin/env bash
# Atalho para Mac e Linux: dê dois cliques (ou rode ./abrir-carrossel.sh).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "O Node.js não está instalado. Instale o Node LTS em https://nodejs.org e abra de novo."
  read -r -p "Enter para fechar."
  exit 1
fi

if [ ! -d node_modules ]; then
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
