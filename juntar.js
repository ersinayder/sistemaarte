const fs = require('fs');
const path = require('path');

// Nome do arquivo de saída
const OUTPUT_FILE = 'projeto_completo.txt';

// Pastas e arquivos que devem ser ignorados
const IGNORE_LIST = [
    'node_modules',
    'dist',
    '.git',
    'package-lock.json',
    '.env',
    OUTPUT_FILE // Evita ler o próprio arquivo gerado
];

// Extensões de arquivos que você quer capturar
const ALLOWED_EXTENSIONS = ['.js', '.json', '.html', '.css', '.jsx', '.ts', '.tsx', '.config.js'];

function getFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            if (!IGNORE_LIST.includes(file)) {
                getFiles(filePath, fileList);
            }
        } else {
            const ext = path.extname(file);
            if (ALLOWED_EXTENSIONS.includes(ext) && !IGNORE_LIST.includes(file)) {
                fileList.push(filePath);
            }
        }
    });
    return fileList;
}

function consolidate() {
    const allFiles = getFiles(__dirname);
    let finalContent = '';

    allFiles.forEach(file => {
        const relativePath = path.relative(__dirname, file);
        const content = fs.readFileSync(file, 'utf8');

        finalContent += `\n${'='.repeat(50)}\n`;
        finalContent += `ARQUIVO: ${relativePath}\n`;
        finalContent += `${'='.repeat(50)}\n\n`;
        finalContent += content + '\n\n';
    });

    fs.writeFileSync(OUTPUT_FILE, finalContent);
    console.log(`Sucesso! Todo o código foi salvo em: ${OUTPUT_FILE}`);
}

consolidate();