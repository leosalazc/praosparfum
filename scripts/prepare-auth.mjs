import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const privateDirectory = path.resolve('.private');
const keyFile = path.join(privateDirectory, 'admin-session-key.json');
const rotate = process.argv.includes('--rotate');

function validKey(value) {
  if (!value || value.version !== 1 || value.kind !== 'praos-admin-session-key' ||
      typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(value.key)) return false;
  const bytes = Buffer.from(value.key, 'base64url');
  return bytes.length === 48 && bytes.toString('base64url') === value.key;
}

try {
  if (fs.existsSync(privateDirectory)) {
    const directory = fs.lstatSync(privateDirectory);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('La ruta privada debe ser un directorio local.');
  } else fs.mkdirSync(privateDirectory, { mode: 0o700 });

  let existing = false;
  if (fs.existsSync(keyFile)) {
    const file = fs.lstatSync(keyFile);
    if (!file.isFile() || file.isSymbolicLink() || file.size > 4096 ||
        !validKey(JSON.parse(fs.readFileSync(keyFile, 'utf8')))) {
      throw new Error('Existe un archivo de sesión desconocido; se conserva sin reemplazarlo.');
    }
    existing = true;
  }
  if (!existing || rotate) {
    const temporary = path.join(privateDirectory, `.session-${randomBytes(12).toString('hex')}.tmp`);
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, kind: 'praos-admin-session-key', key: randomBytes(48).toString('base64url') }) + '\n', { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, keyFile);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  console.log('Acceso administrador: archivo privado de sesión preparado.');
} catch {
  console.error('No se pudo preparar el archivo privado de sesión. Revisa .private sin publicar su contenido.');
  process.exitCode = 1;
}
