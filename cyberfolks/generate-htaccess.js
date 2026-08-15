/**
 * Helper do generowania pliku .htaccess dla cyber_Folks z podanym portem.
 * Użycie: node cyberfolks/generate-htaccess.js <PORT>
 * Przykład: node cyberfolks/generate-htaccess.js 35100
 */

const fs = require("fs");
const path = require("path");

const port = process.argv[2];

if (!port || isNaN(Number(port))) {
  console.error("❌ Błąd: Podaj prawidłowy numer portu z panelu cyber_Folks.");
  console.error("Przykład: node cyberfolks/generate-htaccess.js 35100");
  process.exit(1);
}

const htaccessContent = `# ── Fakturo — .htaccess dla cyber_Folks (Port: ${port}) ──
<IfModule mod_rewrite.c>
  RewriteEngine On

  # Przekierowanie ruchu z subdomeny/katalogu do lokalnego serwera Node.js
  RewriteRule ^$ http://127.0.0.1:${port}/ [P,L,QSA]

  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^(.*)$ http://127.0.0.1:${port}/$1 [P,L,QSA]
</IfModule>

# Blokada dostępu do wrażliwych plików
<FilesMatch "\\.(env|env\\.example|db|sqlite|sqlite3|p12|pfx)$">
  Require all denied
</FilesMatch>

# Wyłącz listing katalogów (zapobiega błędowi 403 gdy reverse proxy nie odpowiada)
Options -Indexes
`;

const outputPath = path.join(__dirname, ".htaccess");
fs.writeFileSync(outputPath, htaccessContent, "utf8");

console.log(`✅ Wygenerowano plik: ${outputPath}`);
console.log(`📌 Skopiuj ten plik do katalogu public_html (lub public_html/faktura) dla Twojej subdomeny na serwerze cyber_Folks.`);
