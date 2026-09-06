FROM node:20-slim

# Instalacja zależności systemowych (python, make, g++ potrzebne do zbudowania node-pty)
# sudo potrzebne, ponieważ server.js używa `sudo -u` gdy CLAUDE_RUN_AS jest ustawione
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Utworzenie nieuprzywilejowanego użytkownika, z poziomu którego Gemini będzie wykonywał kod
RUN useradd -m -s /bin/bash ai_user

WORKDIR /app

# Instalacja Gemini CLI globalnie (Upewnij się, że nazwa paczki jest poprawna, podałem przykładową)
RUN npm install -g @google/gemini-cli

# Instalacja zależności aplikacji
COPY package*.json ./
RUN npm install

# Kopiowanie kodu źródłowego
COPY . .

# Konfiguracja bezpiecznego środowiska uruchomieniowego
ENV PORT=3021
ENV WORK_DIR=/app/workspace
ENV OUTPUT_BASE_DIR=/app/output
# Zabezpieczenie: Gemini uruchomi się jako ai_user (sandbox)
ENV AI_RUN_AS=ai_user

# Utworzenie folderów roboczych i nadanie uprawnień nieuprzywilejowanemu użytkownikowi
RUN mkdir -p /app/workspace /app/output /app/.gemini && \
    chown -R ai_user:ai_user /app/workspace /app/output /app/.gemini

EXPOSE 3021

CMD ["node", "server.js"]
