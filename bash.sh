# NVM yükle
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# NVM'i terminale tanıt
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

# Node LTS sürümünü yükle ve kullan
nvm install --lts
nvm use --lts

# Kontrol
node -v
npm -v
