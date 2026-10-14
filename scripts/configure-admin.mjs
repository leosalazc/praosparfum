import { randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Read the injected secret in memory: never accept a password in command arguments.
const password = process.env.ADMIN_PASSWORD;
const destination = path.resolve('server/admin-credentials.json');
const replace = process.argv.includes('--replace');

try {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new Error('Define ADMIN_PASSWORD de 12 a 200 caracteres en la configuración privada del entorno.');
  }
  if (fs.existsSync(destination)) {
    const file = fs.lstatSync(destination);
    if (!file.isFile() || file.isSymbolicLink()) throw new Error('La ruta de credenciales no es un archivo local.');
    if (!replace) throw new Error('La contraseña ya está preparada. Usa --replace para cambiarla expresamente.');
  }
  const salt = randomBytes(24);
  const hash = scryptSync(password, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const verifier = { version: 1, algorithm: 'scrypt', salt: salt.toString('base64url'), hash: hash.toString('base64url'), parameters: { N: 131072, r: 8, p: 1, keyLength: 32 } };
  const temporary = path.join(path.dirname(destination), `.credentials-${randomBytes(12).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(verifier, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log('Contraseña preparada: solo se guardó su huella scrypt para el servidor.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo preparar la contraseña.');
  process.exitCode = 1;
}
